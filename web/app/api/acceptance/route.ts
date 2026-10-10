import { NextResponse } from "next/server";
import { verifyTypedData } from "viem";
import { z } from "zod";

import { acceptanceTypedData, computeTermsHash } from "@/lib/acceptance";
import { getEscrowAddress, readAgreementTerms } from "@/lib/agreement-chain";
import { getAcceptances, saveAcceptance } from "@/lib/safepay-store";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  agreementId: z.number().int().positive(),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = raw
    .split(",")
    .map(Number)
    .filter((value) => Number.isSafeInteger(value) && value > 0)
    .slice(0, 100);
  if (ids.length === 0) return NextResponse.json({ accepted: {} });
  try {
    return NextResponse.json({ accepted: await getAcceptances(getEscrowAddress(), ids) });
  } catch {
    return NextResponse.json({ error: "Could not load acceptances." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { agreementId, signature } = parsed.data;

  try {
    const escrow = getEscrowAddress();
    const terms = await readAgreementTerms(agreementId);
    if (terms.status !== 0) {
      return NextResponse.json(
        { error: "Only agreements that are not funded yet can be accepted." },
        { status: 400 },
      );
    }

    const typed = acceptanceTypedData(escrow, terms);
    const valid = await verifyTypedData({
      address: terms.contractor,
      ...typed,
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      return NextResponse.json(
        { error: "The signature does not match the contractor wallet." },
        { status: 401 },
      );
    }

    await saveAcceptance({
      contractAddress: escrow,
      agreementId,
      contractor: terms.contractor,
      termsHash: computeTermsHash(terms),
      signature,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not record the acceptance." }, { status: 500 });
  }
}