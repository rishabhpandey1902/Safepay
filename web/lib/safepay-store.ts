import "server-only";

import { listingDatabase } from "./services-db";

listingDatabase.exec(`
  CREATE TABLE IF NOT EXISTS agreement_details (
    contract_address TEXT NOT NULL,
    agreement_id INTEGER NOT NULL,
    descriptions_json TEXT NOT NULL,
    contractor_email TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (contract_address, agreement_id)
  );
  CREATE TABLE IF NOT EXISTS agreement_acceptances (
    contract_address TEXT NOT NULL,
    agreement_id INTEGER NOT NULL,
    contractor_address TEXT NOT NULL,
    terms_hash TEXT NOT NULL,
    signature TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (contract_address, agreement_id)
  );
`);

export async function saveDetails(input: {
  contractAddress: string;
  agreementId: number;
  descriptions: string[];
  contractorEmail?: string;
}): Promise<void> {
  listingDatabase
    .prepare(
      `INSERT OR IGNORE INTO agreement_details
       (contract_address, agreement_id, descriptions_json, contractor_email, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      input.contractAddress.toLowerCase(),
      input.agreementId,
      JSON.stringify(input.descriptions),
      input.contractorEmail ?? null,
      new Date().toISOString(),
    );
}

export async function getDetails(
  contractAddress: string,
  agreementId: number,
): Promise<string[] | null> {
  const row = listingDatabase
    .prepare(
      "SELECT descriptions_json FROM agreement_details WHERE contract_address = ? AND agreement_id = ?",
    )
    .get(contractAddress.toLowerCase(), agreementId) as { descriptions_json: string } | undefined;
  return row ? (JSON.parse(row.descriptions_json) as string[]) : null;
}

export async function saveAcceptance(input: {
  contractAddress: string;
  agreementId: number;
  contractor: string;
  termsHash: string;
  signature: string;
}): Promise<void> {
  listingDatabase
    .prepare(
      `INSERT OR IGNORE INTO agreement_acceptances
       (contract_address, agreement_id, contractor_address, terms_hash, signature, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.contractAddress.toLowerCase(),
      input.agreementId,
      input.contractor.toLowerCase(),
      input.termsHash,
      input.signature,
      new Date().toISOString(),
    );
}

export async function getAcceptances(
  contractAddress: string,
  ids: number[],
): Promise<Record<number, { createdAt: string }>> {
  const result: Record<number, { createdAt: string }> = {};
  const statement = listingDatabase.prepare(
    "SELECT created_at FROM agreement_acceptances WHERE contract_address = ? AND agreement_id = ?",
  );
  for (const id of ids) {
    const row = statement.get(contractAddress.toLowerCase(), id) as { created_at: string } | undefined;
    if (row) result[id] = { createdAt: row.created_at };
  }
  return result;
}