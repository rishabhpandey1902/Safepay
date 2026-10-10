import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";

import { monadTestnet } from "./monad";

export type AcceptanceTerms = {
  agreementId: bigint;
  client: Address;
  contractor: Address;
  token: Address;
  resolver: Address;
  totalAmount: bigint;
  approvalWindow: bigint;
  disputeWindow: bigint;
  clientCancellationFee: bigint;
  milestones: { amount: bigint; descriptionHash: Hex }[];
};

export function computeTermsHash(terms: AcceptanceTerms): Hex {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        "address resolver, uint256 approvalWindow, uint256 disputeWindow, uint256 cancellationFee, uint256[] amounts, bytes32[] descriptionHashes",
      ),
      [
        terms.resolver,
        terms.approvalWindow,
        terms.disputeWindow,
        terms.clientCancellationFee,
        terms.milestones.map((milestone) => milestone.amount),
        terms.milestones.map((milestone) => milestone.descriptionHash),
      ],
    ),
  );
}

export function acceptanceTypedData(escrow: Address, terms: AcceptanceTerms) {
  return {
    domain: {
      name: "SafePay Agreement",
      version: "1",
      chainId: monadTestnet.id,
      verifyingContract: escrow,
    },
    types: {
      Accept: [
        { name: "agreementId", type: "uint256" },
        { name: "client", type: "address" },
        { name: "contractor", type: "address" },
        { name: "token", type: "address" },
        { name: "totalAmount", type: "uint256" },
        { name: "termsHash", type: "bytes32" },
      ],
    },
    primaryType: "Accept" as const,
    message: {
      agreementId: terms.agreementId,
      client: terms.client,
      contractor: terms.contractor,
      token: terms.token,
      totalAmount: terms.totalAmount,
      termsHash: computeTermsHash(terms),
    },
  };
}