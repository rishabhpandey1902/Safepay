import { NextResponse } from "next/server";
import { keccak256, toBytes } from "viem";
import { z } from "zod";

import { getEscrowAddress, readAgreementTerms } from "@/lib/agreement-chain";
import { getDetails, saveDetails } from "@/lib/safepay-store";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  agreementId: z.number().int().positive(),
  descriptions: z.array(z.string().min(1).max(400)).min(1).max(50),
  contractorEmail: z.string().email().max(200).optional(),
});

export async function GET(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid agreement id." }, { status: 400 });
  }
  try {
    const descriptions = await getDetails(getEscrowAddress(), id);
    if (!descriptions) return NextResponse.json({ error: "No details saved." }, { status: 404 });
    return NextResponse.json({ descriptions });
  } catch {
    return NextResponse.json({ error: "Could not load details." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { agreementId, descriptions, contractorEmail } = parsed.data;

  try {
    const terms = await readAgreementTerms(agreementId);
    // Only text that matches the hashes stored on the blockchain is accepted.
    const matches =
      terms.milestones.length === descriptions.length &&
      terms.milestones.every(
        (milestone, index) => keccak256(toBytes(descriptions[index])) === milestone.descriptionHash,
      );
    if (!matches) {
      return NextResponse.json(
        { error: "These descriptions do not match the agreement on the blockchain." },
        { status: 400 },
      );
    }
    await saveDetails({
      contractAddress: getEscrowAddress(),
      agreementId,
      descriptions,
      contractorEmail,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not save the agreement details." }, { status: 500 });
  }
}