import "server-only";

import { dbAll, dbGet, dbRun } from "./db";

const lower = (value: string) => value.toLowerCase();
const placeholders = (ids: number[]) => ids.map(() => "?").join(",");

export async function saveDetails(input: {
  contractAddress: string;
  agreementId: number;
  descriptions: string[];
  contractorEmail?: string;
}): Promise<void> {
  await dbRun(
    `INSERT OR IGNORE INTO agreement_details
     (contract_address, agreement_id, descriptions_json, contractor_email, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      lower(input.contractAddress),
      input.agreementId,
      JSON.stringify(input.descriptions),
      input.contractorEmail ?? null,
      new Date().toISOString(),
    ],
  );
}

export async function getDetails(contractAddress: string, agreementId: number): Promise<string[] | null> {
  const row = await dbGet<{ descriptions_json: string }>(
    "SELECT descriptions_json FROM agreement_details WHERE contract_address = ? AND agreement_id = ?",
    [lower(contractAddress), agreementId],
  );
  return row ? (JSON.parse(row.descriptions_json) as string[]) : null;
}

export async function saveAcceptance(input: {
  contractAddress: string;
  agreementId: number;
  contractor: string;
  termsHash: string;
  signature: string;
}): Promise<void> {
  await dbRun(
    `INSERT OR IGNORE INTO agreement_acceptances
     (contract_address, agreement_id, contractor_address, terms_hash, signature, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      lower(input.contractAddress),
      input.agreementId,
      lower(input.contractor),
      input.termsHash,
      input.signature,
      new Date().toISOString(),
    ],
  );
}

export async function getAcceptances(
  contractAddress: string,
  ids: number[],
): Promise<Record<number, { createdAt: string }>> {
  const result: Record<number, { createdAt: string }> = {};
  if (ids.length === 0) return result;
  const rows = await dbAll<{ agreement_id: number; created_at: string }>(
    `SELECT agreement_id, created_at FROM agreement_acceptances
     WHERE contract_address = ? AND agreement_id IN (${placeholders(ids)})`,
    [lower(contractAddress), ...ids],
  );
  for (const row of rows) result[Number(row.agreement_id)] = { createdAt: row.created_at };
  return result;
}

export async function saveClosure(input: {
  contractAddress: string;
  agreementId: number;
  kind: "declined" | "withdrawn";
  signer: string;
  signature: string;
}): Promise<void> {
  await dbRun(
    `INSERT OR IGNORE INTO agreement_closures
     (contract_address, agreement_id, kind, signer_address, signature, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      lower(input.contractAddress),
      input.agreementId,
      input.kind,
      lower(input.signer),
      input.signature,
      new Date().toISOString(),
    ],
  );
}

export async function getClosures(
  contractAddress: string,
  ids: number[],
): Promise<Record<number, "declined" | "withdrawn">> {
  const result: Record<number, "declined" | "withdrawn"> = {};
  if (ids.length === 0) return result;
  const rows = await dbAll<{ agreement_id: number; kind: string }>(
    `SELECT agreement_id, kind FROM agreement_closures
     WHERE contract_address = ? AND agreement_id IN (${placeholders(ids)})`,
    [lower(contractAddress), ...ids],
  );
  for (const row of rows) {
    if (row.kind === "declined" || row.kind === "withdrawn") result[Number(row.agreement_id)] = row.kind;
  }
  return result;
}

type CancellationRecord = {
  cancelledBy: string;
  contractorFee: string;
  clientRefund: string;
  txHash: string;
  createdAt: string;
};

export async function saveCancellation(input: {
  contractAddress: string;
  agreementId: number;
  cancelledBy: string;
  contractorFee: bigint;
  clientRefund: bigint;
  txHash: string;
}): Promise<void> {
  await dbRun(
    `INSERT OR IGNORE INTO agreement_cancellations
     (contract_address, agreement_id, cancelled_by, contractor_fee, client_refund, tx_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      lower(input.contractAddress),
      input.agreementId,
      lower(input.cancelledBy),
      input.contractorFee.toString(),
      input.clientRefund.toString(),
      input.txHash,
      new Date().toISOString(),
    ],
  );
}

export async function getCancellations(
  contractAddress: string,
  ids: number[],
): Promise<Record<number, CancellationRecord>> {
  const result: Record<number, CancellationRecord> = {};
  if (ids.length === 0) return result;
  const rows = await dbAll<{
    agreement_id: number;
    cancelled_by: string;
    contractor_fee: string;
    client_refund: string;
    tx_hash: string;
    created_at: string;
  }>(
    `SELECT agreement_id, cancelled_by, contractor_fee, client_refund, tx_hash, created_at
     FROM agreement_cancellations
     WHERE contract_address = ? AND agreement_id IN (${placeholders(ids)})`,
    [lower(contractAddress), ...ids],
  );
  for (const row of rows) {
    result[Number(row.agreement_id)] = {
      cancelledBy: row.cancelled_by,
      contractorFee: row.contractor_fee,
      clientRefund: row.client_refund,
      txHash: row.tx_hash,
      createdAt: row.created_at,
    };
  }
  return result;
}

export async function saveKeeperRelease(input: {
  contractAddress: string;
  agreementId: number;
  milestoneIndex: number;
  txHash: string;
}): Promise<void> {
  await dbRun(
    `INSERT INTO keeper_releases (contract_address, agreement_id, milestone_index, tx_hash, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [lower(input.contractAddress), input.agreementId, input.milestoneIndex, input.txHash, new Date().toISOString()],
  );
}

export async function listKeeperReleases(
  limit: number,
): Promise<{ agreementId: number; milestoneIndex: number; txHash: string; createdAt: string }[]> {
  const rows = await dbAll<{
    agreement_id: number;
    milestone_index: number;
    tx_hash: string;
    created_at: string;
  }>("SELECT agreement_id, milestone_index, tx_hash, created_at FROM keeper_releases ORDER BY id DESC LIMIT ?", [
    limit,
  ]);
  return rows.map((row) => ({
    agreementId: Number(row.agreement_id),
    milestoneIndex: Number(row.milestone_index),
    txHash: row.tx_hash,
    createdAt: row.created_at,
  }));
}