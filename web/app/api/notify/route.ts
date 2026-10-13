import { NextResponse } from "next/server";
import { decodeFunctionData, isHash, parseEventLogs } from "viem";
import { z } from "zod";

import { chainClient, getEscrowAddress, readAgreementTerms } from "@/lib/agreement-chain";
import { safePayEscrowAbi } from "@/lib/contracts";
import { dbRun } from "@/lib/db";
import { displayName, notifyMany } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  agreementId: z.number().int().positive(),
  txHash: z.string().refine(isHash, "Enter a valid transaction hash."),
});

type Note = { to: string; title: string; body: string; link?: string };

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { agreementId } = parsed.data;
  const hash = parsed.data.txHash as `0x${string}`;
  const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

  try {
    const escrow = getEscrowAddress();
    const [tx, receipt, terms] = await Promise.all([
      chainClient.getTransaction({ hash }),
      chainClient.getTransactionReceipt({ hash }),
      readAgreementTerms(agreementId),
    ]);
    if (receipt.status !== "success" || !tx.to || tx.to.toLowerCase() !== escrow.toLowerCase()) {
      return bad("That transaction is not a successful call to the SafePay contract.");
    }

    const decoded = decodeFunctionData({ abi: safePayEscrowAbi, data: tx.input });
    const args = (decoded.args ?? []) as readonly unknown[];
    const from = tx.from.toLowerCase();
    const client = terms.client.toLowerCase();
    const contractor = terms.contractor.toLowerCase();
    const resolver = terms.resolver.toLowerCase();
    const link = `/agreement/${agreementId}`;
    const who = await displayName(tx.from);
    const index = args[1] !== undefined ? Number(args[1]) + 1 : 0;
    const sameAgreement = args[0] === BigInt(agreementId);
    const isParty = from === client || from === contractor;
    let notes: Note[] = [];

    switch (decoded.functionName) {
      case "createAgreement": {
        const [created] = parseEventLogs({
          abi: safePayEscrowAbi,
          logs: receipt.logs,
          eventName: "AgreementCreated",
          strict: true,
        });
        if (!created || created.args.agreementId !== BigInt(agreementId) || from !== client) {
          return bad("That transaction did not create this agreement.");
        }
        notes = [{ to: contractor, title: "New agreement for you", body: `${who} created a SafePay agreement for you. Review the terms and accept.` }];
        break;
      }
      case "fundAgreement":
        if (!sameAgreement || from !== client) return bad("That transaction did not fund this agreement.");
        notes = [{ to: contractor, title: "Agreement funded", body: `${who} funded the agreement. You can start work.` }];
        break;
      case "submitMilestone":
        if (!sameAgreement || from !== contractor) return bad("That transaction did not submit work on this agreement.");
        notes = [{ to: client, title: `Milestone ${index} delivered`, body: `${who} submitted their work. Review it, then approve or raise a dispute.` }];
        break;
      case "approveMilestone":
        if (!sameAgreement || from !== client) return bad("That transaction did not approve this agreement's work.");
        notes = [{ to: contractor, title: `Milestone ${index} approved`, body: `${who} approved your work. The payment was released to you.` }];
        break;
      case "releaseMilestone":
        if (!sameAgreement) return bad("That transaction did not release this agreement's payment.");
        notes = [
          { to: contractor, title: `Milestone ${index} released`, body: "The payment for this milestone was released to you." },
          { to: client, title: `Milestone ${index} released`, body: "The approval window ended, so the payment was released automatically." },
        ];
        break;
            case "raiseDispute":
        if (!sameAgreement || !isParty) return bad("That transaction did not raise a dispute on this agreement.");
        notes = [
          {
            to: from === client ? contractor : client,
            title: "Dispute raised",
            body: `${who} raised a dispute on milestone ${index}. Open the dispute room to respond.`,
            link: `/dispute-room/${agreementId}`,
          },
          {
            to: resolver,
            title: "A dispute needs your decision",
            body: `A dispute was raised on milestone ${index} of agreement #${agreementId}. Open the dispute room.`,
            link: `/dispute-room/${agreementId}`,
          },
        ];
        break;
        if (!sameAgreement || !isParty) return bad("That transaction did not raise a dispute on this agreement.");
        notes = [
          { to: from === client ? contractor : client, title: "Dispute raised", body: `${who} raised a dispute on milestone ${index}.` },
          { to: resolver, title: "A dispute needs your decision", body: `A dispute was raised on milestone ${index} of agreement #${agreementId}.` },
        ];
        break;
      case "resolveDispute":
        if (!sameAgreement || from !== resolver) return bad("That transaction did not resolve a dispute on this agreement.");
        notes = [
          { to: client, title: "Dispute resolved", body: `The resolver decided the dispute on milestone ${index}.` },
          { to: contractor, title: "Dispute resolved", body: `The resolver decided the dispute on milestone ${index}.` },
        ];
        break;
      case "cancelAgreement":
        if (!sameAgreement || !isParty) return bad("That transaction did not cancel this agreement.");
        notes = [{ to: from === client ? contractor : client, title: "Agreement cancelled", body: `${who} cancelled the agreement. See Wallet history for the amounts.` }];
        break;
      default:
        return bad("That transaction does not need a notification.");
    }

    // Each transaction produces notifications only once.
    const first = await dbRun("INSERT OR IGNORE INTO notified_txs (tx_hash, created_at) VALUES (?, ?)", [
      hash.toLowerCase(),
      new Date().toISOString(),
    ]);
    if (first === 0) return NextResponse.json({ ok: true, duplicate: true });

    await notifyMany(
      notes
        .filter((note) => note.to !== from)
                .map((note) => ({ address: note.to, type: "agreement", title: note.title, body: note.body, link: note.link ?? link })),
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not verify that transaction." }, { status: 500 });
  }
}