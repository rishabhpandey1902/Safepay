import "server-only";

import { randomUUID } from "node:crypto";
import { keccak256, stringToHex, verifyMessage } from "viem";

import { listingDatabase as db } from "./services-db";


action: "create_project" | "apply" | "save_profile";

function hashPayload(value: unknown): string {
  return keccak256(stringToHex(JSON.stringify(value)));
}

function buildMessage(input: {
  action: ProjectAction;
  address: string;
  nonce: string;
  payloadHash: string;
  expiresAt: number;
}): string {
  return [
    "SafePay projects authorization",
    `Action: ${input.action}`,
    `Wallet: ${input.address}`,
    `Payload: ${input.payloadHash}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${input.expiresAt}`,
  ].join("\n");
}

export function issueChallenge(input: {
  action: ProjectAction;
  address: string;
  payload: unknown;
}): { nonce: string; message: string } {
  const nonce = randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 300;
  const payloadHash = hashPayload(input.payload);
  db.prepare(
    "INSERT INTO project_nonces (nonce, address, action, payload_hash, expires_at) VALUES (?, ?, ?, ?, ?)",
  ).run(nonce, input.address, input.action, payloadHash, expiresAt);
  db.prepare("DELETE FROM project_nonces WHERE expires_at < ?").run(Math.floor(Date.now() / 1000));
  return {
    nonce,
    message: buildMessage({ action: input.action, address: input.address, nonce, payloadHash, expiresAt }),
  };
}

export async function verifyAndConsume(input: {
  nonce: string;
  address: string;
  action: ProjectAction;
  payload: unknown;
  signature: `0x${string}`;
}): Promise<boolean> {
  const consume = db.transaction((valid: boolean) => {
    if (!valid) return false;
    return db.prepare("DELETE FROM project_nonces WHERE nonce = ?").run(input.nonce).changes === 1;
  });

  const row = db
    .prepare("SELECT address, action, payload_hash, expires_at FROM project_nonces WHERE nonce = ?")
    .get(input.nonce) as
    | { address: string; action: string; payload_hash: string; expires_at: number }
    | undefined;

  if (
    !row ||
    row.address !== input.address ||
    row.action !== input.action ||
    row.payload_hash !== hashPayload(input.payload) ||
    row.expires_at < Math.floor(Date.now() / 1000)
  ) {
    return consume(false);
  }

  const message = buildMessage({
    action: input.action,
    address: row.address,
    nonce: input.nonce,
    payloadHash: row.payload_hash,
    expiresAt: row.expires_at,
  });
  const valid = await verifyMessage({
    address: input.address as `0x${string}`,
    message,
    signature: input.signature,
  }).catch(() => false);
  return consume(valid);
}