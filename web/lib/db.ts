import "server-only";

import { createClient, type Client, type InValue } from "@libsql/client";

let client: Client | undefined;
let ready: Promise<void> | undefined;

function getClient(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    client = url
      ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
      : createClient({ url: "file:data/safepay.db" });
  }
  return client;
}

const statements = [
  `CREATE TABLE IF NOT EXISTS freelancer_profiles (
    address TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    headline TEXT NOT NULL,
    bio TEXT NOT NULL,
    skills_json TEXT NOT NULL,
    category TEXT NOT NULL,
    country TEXT NOT NULL,
    hourly_rate_usd REAL NOT NULL,
    experience_years INTEGER NOT NULL DEFAULT 0,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    country TEXT NOT NULL,
    budget_usd REAL NOT NULL,
    deadline_days INTEGER NOT NULL,
    owner_address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS project_applications (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    applicant_address TEXT NOT NULL,
    message TEXT NOT NULL,
    proposed_price_usd REAL NOT NULL,
    delivery_days INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (project_id, applicant_address)
  )`,
  `CREATE TABLE IF NOT EXISTS project_nonces (
    nonce TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    action TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS agreement_details (
    contract_address TEXT NOT NULL,
    agreement_id INTEGER NOT NULL,
    descriptions_json TEXT NOT NULL,
    contractor_email TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (contract_address, agreement_id)
  )`,
  `CREATE TABLE IF NOT EXISTS agreement_acceptances (
    contract_address TEXT NOT NULL,
    agreement_id INTEGER NOT NULL,
    contractor_address TEXT NOT NULL,
    terms_hash TEXT NOT NULL,
    signature TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (contract_address, agreement_id)
  )`,
  `CREATE TABLE IF NOT EXISTS agreement_closures (
    contract_address TEXT NOT NULL,
    agreement_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    signer_address TEXT NOT NULL,
    signature TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (contract_address, agreement_id)
  )`,
  `CREATE TABLE IF NOT EXISTS agreement_cancellations (
    contract_address TEXT NOT NULL,
    agreement_id INTEGER NOT NULL,
    cancelled_by TEXT NOT NULL,
    contractor_fee TEXT NOT NULL,
    client_refund TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (contract_address, agreement_id)
  )`,
  `CREATE TABLE IF NOT EXISTS keeper_releases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_address TEXT NOT NULL,
    agreement_id INTEGER NOT NULL,
    milestone_index INTEGER NOT NULL,
    tx_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS fx_rate_cache (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    rates_json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    rate_timestamp TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS api_session_nonces (
    nonce TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS api_sessions (
    token TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    link TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS notifications_by_address ON notifications (address, is_read, id)`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread TEXT NOT NULL,
    sender TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS chat_messages_by_thread ON chat_messages (thread, id)`,
  `CREATE TABLE IF NOT EXISTS chat_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    data TEXT NOT NULL
  )`,
    `CREATE INDEX IF NOT EXISTS chat_files_by_message ON chat_files (message_id)`,
    `CREATE TABLE IF NOT EXISTS notified_txs (
    tx_hash TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chat_threads (
    thread TEXT PRIMARY KEY,
    a TEXT NOT NULL,
    b TEXT NOT NULL,
    kind TEXT NOT NULL,
    last_message_at TEXT,
    last_preview TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS chat_threads_a ON chat_threads (a)`,
  `CREATE INDEX IF NOT EXISTS chat_threads_b ON chat_threads (b)`,
];


function isNetworkError(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } } | undefined)?.cause;
  const code = cause?.code ?? (error as { code?: string } | undefined)?.code ?? "";
  return (
    ["UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(code) ||
    /fetch failed/i.test(String((error as Error | undefined)?.message ?? ""))
  );
}

async function withRetry<T>(task: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!isNetworkError(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt + Math.random() * 200));
    }
  }
  throw lastError;
}

// Allow only a few database requests at once, so a busy page does not flood the connection.
let activeRequests = 0;
const waiting: (() => void)[] = [];

async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (activeRequests >= 4) await new Promise<void>((resolve) => waiting.push(resolve));
  activeRequests += 1;
  try {
    return await task();
  } finally {
    activeRequests -= 1;
    waiting.shift()?.();
  }
}

function run(sql: string, args: InValue[]) {
  return withRetry(() => limited(() => getClient().execute({ sql, args })));
}

export function initDb(): Promise<void> {
  const existing = ready;
  if (existing) return existing;
    const started = withRetry(() => getClient().batch(statements, "write"))
    .then(() => undefined)
    .catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
  ready = started;
  return started;
}

export async function dbAll<T>(sql: string, args: InValue[] = []): Promise<T[]> {
  await initDb();
  const result = await run(sql, args);
  return result.rows as unknown as T[];
}

export async function dbGet<T>(sql: string, args: InValue[] = []): Promise<T | undefined> {
  return (await dbAll<T>(sql, args))[0];
}

/** Runs a statement and returns how many rows it changed. */
export async function dbRun(sql: string, args: InValue[] = []): Promise<number> {
  await initDb();
  const result = await run(sql, args);
  return result.rowsAffected;
}
/** Runs an INSERT and returns the new row's id. */
export async function dbInsert(sql: string, args: InValue[] = []): Promise<number> {
  await initDb();
  const result = await run(sql, args);
  return Number(result.lastInsertRowid ?? 0);
}