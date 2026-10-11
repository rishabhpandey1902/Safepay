import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isAddress, verifyMessage } from "viem";

import { dbGet, dbRun } from "./db";

const SESSION_SECONDS = 24 * 60 * 60;
const now = () => Math.floor(Date.now() / 1000);
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function challengeMessage(address: string, nonce: string, expiresAt: number) {
  return [
    "SafePay sign-in",
    "Sign to open your private messages and notifications. This does not move any money.",
    `Wallet: ${address}`,
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt}`,
  ].join("\n");
}

export async function issueSessionChallenge(rawAddress: string): Promise<{ nonce: string; message: string } | null> {
  if (!isAddress(rawAddress)) return null;
  const address = rawAddress.toLowerCase();
  const nonce = randomUUID();
  const expiresAt = now() + 300;
  await dbRun("INSERT INTO api_session_nonces (nonce, address, expires_at) VALUES (?, ?, ?)", [nonce, address, expiresAt]);
  await dbRun("DELETE FROM api_session_nonces WHERE expires_at < ?", [now()]);
  return { nonce, message: challengeMessage(address, nonce, expiresAt) };
}

export async function createSession(input: {
  nonce: string;
  address: string;
  signature: string;
}): Promise<{ token: string; expiresAt: number } | null> {
  if (!isAddress(input.address) || !/^0x[0-9a-fA-F]+$/.test(input.signature)) return null;
  const address = input.address.toLowerCase();
  const row = await dbGet<{ address: string; expires_at: number }>(
    "SELECT address, expires_at FROM api_session_nonces WHERE nonce = ?",
    [input.nonce],
  );
  if (!row || row.address !== address || Number(row.expires_at) < now()) return null;

  const valid = await verifyMessage({
    address: address as `0x${string}`,
    message: challengeMessage(address, input.nonce, Number(row.expires_at)),
    signature: input.signature as `0x${string}`,
  }).catch(() => false);
  if (!valid) return null;

  // Deleting the nonce is atomic, so one signature opens only one session.
  if ((await dbRun("DELETE FROM api_session_nonces WHERE nonce = ?", [input.nonce])) !== 1) return null;

  const token = randomBytes(32).toString("hex");
  const expiresAt = now() + SESSION_SECONDS;
  await dbRun("INSERT INTO api_sessions (token, address, expires_at) VALUES (?, ?, ?)", [
    hashToken(token),
    address,
    expiresAt,
  ]);
  await dbRun("DELETE FROM api_sessions WHERE expires_at < ?", [now()]);
  return { token, expiresAt };
}

/** Returns the signed-in wallet address (lowercase) for a request, or null. */
export async function sessionAddress(request: Request): Promise<string | null> {
  const token = /^Bearer\s+([0-9a-f]{64})$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return null;
  const row = await dbGet<{ address: string; expires_at: number }>(
    "SELECT address, expires_at FROM api_sessions WHERE token = ?",
    [hashToken(token.toLowerCase())],
  );
  if (!row || Number(row.expires_at) < now()) return null;
  return row.address;
}