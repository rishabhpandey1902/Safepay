import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createPublicClient,
  encodeFunctionData,
  http,
  isAddress,
  isHash,
  type Address,
} from "viem";

import { safePayEscrowAbi } from "@/lib/contracts";
import { monadTestnet } from "@/lib/monad";
import { createPrivyServerClient } from "@/lib/privy-server";
import { saveKeeperRelease } from "@/lib/safepay-store";
import { notifyMany } from "@/lib/notify";

export const runtime = "nodejs";

const requestSchema = z.object({
  agreementId: z.number().int().positive(),
  milestoneIndex: z.number().int().nonnegative(),
});

const rpcUrl =
  process.env.MONAD_RPC_URL ??
  process.env.NEXT_PUBLIC_MONAD_RPC_URL ??
  "https://testnet-rpc.monad.xyz";
const publicClient = createPublicClient({ chain: monadTestnet, transport: http(rpcUrl) });

// Stops two requests from sending the same release at the same time.
const inFlight = new Set<string>();

export async function POST(request: Request) {
  const relayerWalletId = process.env.PRIVY_TIMEOUT_RELAYER_WALLET_ID;
  const escrowAddress = process.env.NEXT_PUBLIC_SAFE_PAY_ESCROW_ADDRESS;
  const tokenAddress = process.env.NEXT_PUBLIC_SAFE_PAY_TOKEN_ADDRESS;
  const privyAppId = process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!privyAppId || !process.env.PRIVY_APP_SECRET || !relayerWalletId) {
    return NextResponse.json(
      { error: "The SafePay keeper is not configured. Set the Privy app credentials and the keeper wallet ID." },
      { status: 503 },
    );
  }
  if (!escrowAddress || !isAddress(escrowAddress) || !tokenAddress || !isAddress(tokenAddress)) {
    return NextResponse.json({ error: "Configure valid SafePay escrow and settlement token addresses." }, { status: 503 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid release request." }, { status: 400 });
  }

  const key = `${parsed.data.agreementId}:${parsed.data.milestoneIndex}`;
  if (inFlight.has(key)) {
    return NextResponse.json({ error: "A release for this milestone is already in progress." }, { status: 409 });
  }
  inFlight.add(key);

  try {
    const privy = createPrivyServerClient();

    if ((await publicClient.getChainId()) !== 10143) {
      return NextResponse.json({ error: "The configured RPC is not connected to Monad Testnet (chain ID 10143)." }, { status: 503 });
    }
    const relayer = await privy.wallets().get(relayerWalletId);
    if (relayer.chain_type !== "ethereum" || relayer.owner_id !== null) {
      return NextResponse.json(
        { error: "The keeper must be a Privy-managed Ethereum wallet without a user owner." },
        { status: 503 },
      );
    }

    const address = escrowAddress as Address;
    const token = tokenAddress as Address;
    const [agreement, milestone, block] = await Promise.all([
      publicClient.readContract({
        address,
        abi: safePayEscrowAbi,
        functionName: "getAgreement",
        args: [BigInt(parsed.data.agreementId)],
      }),
      publicClient.readContract({
        address,
        abi: safePayEscrowAbi,
        functionName: "getMilestone",
        args: [BigInt(parsed.data.agreementId), BigInt(parsed.data.milestoneIndex)],
      }),
      publicClient.getBlock(),
    ]);
    if (agreement.token.toLowerCase() !== token.toLowerCase()) {
      return NextResponse.json({ error: "The agreement uses a different settlement token." }, { status: 409 });
    }
    if (Number(agreement.status) !== 1 || Number(milestone.status) !== 1) {
      return NextResponse.json(
        { error: "Only active agreements with a submitted, unreleased milestone can be released by timeout." },
        { status: 409 },
      );
    }
    if (milestone.approvalDeadline > block.timestamp) {
      return NextResponse.json(
        { error: "The approval window has not ended yet.", approvalDeadline: milestone.approvalDeadline.toString() },
        { status: 409 },
      );
    }

    const data = encodeFunctionData({
      abi: safePayEscrowAbi,
      functionName: "releaseMilestone",
      args: [BigInt(parsed.data.agreementId), BigInt(parsed.data.milestoneIndex)],
    });
    const sent = await privy.wallets().ethereum().sendTransaction(relayerWalletId, {
      caip2: "eip155:10143",
      params: {
        transaction: {
          to: address,
          value: "0x0",
          data,
          chain_id: 10143,
        },
      },
    });
    if (!isHash(sent.hash)) throw new Error("Privy returned an invalid transaction hash.");
    const receipt = await publicClient.waitForTransactionReceipt({ hash: sent.hash });
    if (receipt.status !== "success") {
      return NextResponse.json(
        { error: "The keeper sent the release, but the transaction reverted.", transactionHash: sent.hash },
        { status: 502 },
      );
    }

    await saveKeeperRelease({
      contractAddress: address,
      agreementId: parsed.data.agreementId,
      milestoneIndex: parsed.data.milestoneIndex,
      txHash: sent.hash,
    }).catch(() => undefined);

        await notifyMany(
      [agreement.contractor, agreement.client].map((person) => ({
        address: person,
        type: "agreement",
        title: `Milestone ${parsed.data.milestoneIndex + 1} released`,
        body: "The approval window ended, so the SafePay keeper released the payment.",
        link: `/agreement/${parsed.data.agreementId}`,
      })),
    );

    return NextResponse.json({ transactionHash: sent.hash, status: receipt.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to run the keeper release." },
      { status: 502 },
    );
  } finally {
    inFlight.delete(key);
  }
}