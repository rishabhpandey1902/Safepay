import { NextResponse } from "next/server";
import { createPublicClient, decodeFunctionData, http, isHash, parseAbi, parseEventLogs } from "viem";
import { z } from "zod";

import { getEscrowAddress, readAgreementTerms } from "@/lib/agreement-chain";
import { safePayEscrowAbi } from "@/lib/contracts";
import { monadTestnet } from "@/lib/monad";
import { getCancellations, saveCancellation } from "@/lib/safepay-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = createPublicClient({
  chain: monadTestnet,
  transport: http(
    process.env.MONAD_RPC_URL ?? process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz",
  ),
});

const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

const bodySchema = z.object({
  agreementId: z.number().int().positive(),
  txHash: z.string().refine(isHash, "Enter a valid transaction hash."),
});

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = raw
    .split(",")
    .map(Number)
    .filter((value) => Number.isSafeInteger(value) && value > 0)
    .slice(0, 100);
  if (ids.length === 0) return NextResponse.json({ cancelled: {} });
  try {
    return NextResponse.json({ cancelled: await getCancellations(getEscrowAddress(), ids) });
  } catch {
    return NextResponse.json({ error: "Could not load cancellations." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { agreementId } = parsed.data;
  const hash = parsed.data.txHash as `0x${string}`;

  try {
    const escrow = getEscrowAddress();
    const [tx, receipt, terms] = await Promise.all([
      client.getTransaction({ hash }),
      client.getTransactionReceipt({ hash }),
      readAgreementTerms(agreementId),
    ]);

    if (receipt.status !== "success" || !tx.to || tx.to.toLowerCase() !== escrow.toLowerCase()) {
      return NextResponse.json({ error: "That transaction is not a successful call to the SafePay contract." }, { status: 400 });
    }
    const decoded = decodeFunctionData({ abi: safePayEscrowAbi, data: tx.input });
    if (decoded.functionName !== "cancelAgreement" || decoded.args?.[0] !== BigInt(agreementId)) {
      return NextResponse.json({ error: "That transaction did not cancel this agreement." }, { status: 400 });
    }
    if (terms.status !== 2) {
      return NextResponse.json({ error: "This agreement is not cancelled." }, { status: 400 });
    }
    const cancelledBy = tx.from.toLowerCase();
    if (cancelledBy !== terms.client.toLowerCase() && cancelledBy !== terms.contractor.toLowerCase()) {
      return NextResponse.json({ error: "The cancelling wallet is not part of this agreement." }, { status: 400 });
    }

    // The amounts are the token transfers the contract sent out in this transaction.
    const transfers = parseEventLogs({ abi: transferAbi, logs: receipt.logs, eventName: "Transfer", strict: true })
      .filter(
        (log) =>
          log.address.toLowerCase() === terms.token.toLowerCase() &&
          log.args.from.toLowerCase() === escrow.toLowerCase(),
      );
    let contractorFee = BigInt(0);
    let clientRefund = BigInt(0);
    for (const log of transfers) {
      if (log.args.to.toLowerCase() === terms.contractor.toLowerCase()) contractorFee += log.args.value;
      else if (log.args.to.toLowerCase() === terms.client.toLowerCase()) clientRefund += log.args.value;
    }

    await saveCancellation({
      contractAddress: escrow,
      agreementId,
      cancelledBy,
      contractorFee,
      clientRefund,
      txHash: hash,
    });
    return NextResponse.json({
      ok: true,
      contractorFee: contractorFee.toString(),
      clientRefund: clientRefund.toString(),
    });
  } catch {
    return NextResponse.json({ error: "Could not read that transaction." }, { status: 500 });
  }
}