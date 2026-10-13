import "server-only";

import { createPublicClient, http, isAddress, type Address } from "viem";

import type { AcceptanceTerms } from "./acceptance";
import { safePayEscrowAbi } from "./contracts";
import { monadTestnet } from "./monad";

const client = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? monadTestnet.rpcUrls.default.http[0]),
});

export function getEscrowAddress(): Address {
  const value = process.env.NEXT_PUBLIC_SAFE_PAY_ESCROW_ADDRESS;
  if (!value || !isAddress(value) || /^0x0+$/.test(value)) {
    throw new Error("The escrow address is not configured.");
  }
  return value;
}

export async function readAgreementTerms(
  agreementId: number,
): Promise<AcceptanceTerms & { status: number }> {
  const escrow = getEscrowAddress();
  const agreement = await client.readContract({
    address: escrow,
    abi: safePayEscrowAbi,
    functionName: "getAgreement",
    args: [BigInt(agreementId)],
  });
  if (/^0x0+$/.test(agreement.client)) throw new Error("Agreement not found.");

  const milestones = await Promise.all(
    Array.from({ length: Number(agreement.milestoneCount) }, (_, index) =>
      client.readContract({
        address: escrow,
        abi: safePayEscrowAbi,
        functionName: "getMilestone",
        args: [BigInt(agreementId), BigInt(index)],
      }),
    ),
  );

  return {
    agreementId: BigInt(agreementId),
    client: agreement.client,
    contractor: agreement.contractor,
    token: agreement.token,
    resolver: agreement.resolver,
    totalAmount: agreement.totalAmount,
    approvalWindow: agreement.approvalWindow,
    disputeWindow: agreement.disputeWindow,
    clientCancellationFee: agreement.clientCancellationFee,
    status: Number(agreement.status),
    milestones: milestones.map((milestone) => ({
      amount: milestone.amount,
      descriptionHash: milestone.descriptionHash,
    })),
  };
}
export { client as chainClient };

const partiesCache = new Map<number, { client: string; contractor: string; resolver: string }>();

/** Cheap lookup of who is in an agreement. The result never changes, so it is cached. */
export async function readAgreementParties(
  agreementId: number,
): Promise<{ client: string; contractor: string; resolver: string }> {
  const cached = partiesCache.get(agreementId);
  if (cached) return cached;
  const agreement = await client.readContract({
    address: getEscrowAddress(),
    abi: safePayEscrowAbi,
    functionName: "getAgreement",
    args: [BigInt(agreementId)],
  });
  if (/^0x0+$/.test(agreement.client)) throw new Error("Agreement not found.");
  const parties = {
    client: agreement.client.toLowerCase(),
    contractor: agreement.contractor.toLowerCase(),
    resolver: agreement.resolver.toLowerCase(),
  };
  partiesCache.set(agreementId, parties);
  return parties;
}