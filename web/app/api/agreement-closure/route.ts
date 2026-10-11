import { NextResponse } from "next/server";
import { verifyTypedData } from "viem";
import { z } from "zod";

import { closureTypedData } from "@/lib/acceptance";
import { getEscrowAddress, readAgreementTerms } from "@/lib/agreement-chain";
import { getAcceptances, getClosures, saveClosure } from "@/lib/safepay-store";
import { displayName, notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  agreementId: z.number().int().positive(),
  kind: z.enum(["declined", "withdrawn"]),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = raw
    .split(",")
    .map(Number)
    .filter((value) => Number.isSafeInteger(value) && value > 0)
    .slice(0, 100);
  if (ids.length === 0) return NextResponse.json({ closed: {} });
  try {
    return NextResponse.json({ closed: await getClosures(getEscrowAddress(), ids) });
  } catch {
    return NextResponse.json({ error: "Could not load closures." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { agreementId, kind, signature } = parsed.data;

  try {
    const escrow = getEscrowAddress();
    const terms = await readAgreementTerms(agreementId);
    if (terms.status !== 0) {
      return NextResponse.json({ error: "Only agreements that are not funded yet can be closed this way." }, { status: 400 });
    }

    if (kind === "declined") {
      const accepted = await getAcceptances(escrow, [agreementId]);
      if (accepted[agreementId]) {
        return NextResponse.json({ error: "You already accepted this agreement." }, { status: 400 });
      }
    }

    const signer = kind === "declined" ? terms.contractor : terms.client;
    const valid = await verifyTypedData({
      address: signer,
      ...closureTypedData(escrow, terms, kind),
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      return NextResponse.json({ error: "The signature does not match the right wallet for this action." }, { status: 401 });
    }

    await saveClosure({ contractAddress: escrow, agreementId, kind, signer, signature });
    return NextResponse.json({ ok: true });
    await notify({
      address: kind === "declined" ? terms.client : terms.contractor,
      type: "agreement",
      title: kind === "declined" ? "Agreement declined" : "Agreement withdrawn",
      body:
        kind === "declined"
          ? `${await displayName(terms.contractor)} declined your agreement. Nothing was locked.`
          : `${await displayName(terms.client)} withdrew the agreement. Nothing was locked.`,
      link: `/agreement/${agreementId}`,
    }).catch(() => undefined);
  } catch {
    return NextResponse.json({ error: "Could not close the agreement." }, { status: 500 });
  }
}