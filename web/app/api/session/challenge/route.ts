import { NextResponse } from "next/server";
import { z } from "zod";

import { issueSessionChallenge } from "@/lib/session-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = z.object({ address: z.string() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const challenge = await issueSessionChallenge(body.data.address);
  if (!challenge) return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
  return NextResponse.json(challenge);
}