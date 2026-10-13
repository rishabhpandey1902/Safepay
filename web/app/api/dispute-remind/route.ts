import { NextResponse } from "next/server";
import { z } from "zod";

import { chainClient, getEscrowAddress, readAgreementTerms } from "@/lib/agreement-chain";
import { safePayEscrowAbi } from "@/lib/contracts";
import { dbGet } from "@/lib/db";
import { displayName, notify } from "@/lib/notify";
import { sessionAddress } from "@/lib/session-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOLDOWN_HOURS = 6;

export async function POST(request: Request) {
  const me = await sessionAddress(request);
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = z.object({ agreementId: z.number().int().positive() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const id = parsed.data.agreementId;

  try {
    const terms = await readAgreementTerms(id);
    if (me !== terms.client.toLowerCase() && me !== terms.contractor.toLowerCase()) {
      return NextResponse.json({ error: "Only the client or the contractor can send a reminder." }, { status: 403 });
    }

    const escrow = getEscrowAddress();
    let disputed = false;
    for (let index = 0; index < terms.milestones.length; index += 1) {
      const milestone = await chainClient.readContract({
        address: escrow,
        abi: safePayEscrowAbi,
        functionName: "getMilestone",
        args: [BigInt(id), BigInt(index)],
      });
      if (Number(milestone.status) === 3) {
        disputed = true;
        break;
      }
    }
    if (!disputed) return NextResponse.json({ error: "There is no open dispute on this agreement." }, { status: 400 });

    const link = `/dispute-room/${id}`;
    const resolver = terms.resolver.toLowerCase();
    const since = new Date(Date.now() - COOLDOWN_HOURS * 3_600_000).toISOString();
    const recent = await dbGet<{ c: number }>(
      "SELECT COUNT(*) AS c FROM notifications WHERE address = ? AND type = 'dispute-reminder' AND link = ? AND created_at > ?",
      [resolver, link, since],
    );
    if (Number(recent?.c ?? 0) > 0) {
      return NextResponse.json(
        { error: `A reminder was already sent in the last ${COOLDOWN_HOURS} hours. Share your case in the dispute chat meanwhile.` },
        { status: 429 },
      );
    }

    await notify({
      address: resolver,
      type: "dispute-reminder",
      title: "Reminder: a dispute needs your decision",
      body: `${await displayName(me)} asked you to review the dispute on agreement #${id}.`,
      link,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not send the reminder." }, { status: 500 });
  }
}