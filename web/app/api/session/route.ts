import { NextResponse } from "next/server";
import { z } from "zod";

import { createSession } from "@/lib/session-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = z
    .object({ nonce: z.string().uuid(), address: z.string(), signature: z.string() })
    .safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const session = await createSession(body.data);
  if (!session) return NextResponse.json({ error: "The signature could not be verified." }, { status: 401 });
  return NextResponse.json(session);
}