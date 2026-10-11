import { NextResponse } from "next/server";
import { z } from "zod";

import { profileInputSchema } from "@/lib/profiles-schema";
import { listProfiles, saveProfile } from "@/lib/profiles-db";
import { verifyAndConsume } from "@/lib/projects-auth";
import { addressSchema } from "@/lib/projects-schema";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  nonce: z.string().uuid(),
  address: addressSchema,
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  payload: z.unknown(),
});

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const clean = (key: string) => params.get(key)?.trim().slice(0, 100) || undefined;
  const minExperience = Number(params.get("minExperience"));
  return NextResponse.json({
    profiles: await listProfiles({
      search: clean("search"),
      category: clean("category"),
      country: clean("country"),
      minExperience: Number.isFinite(minExperience) && minExperience > 0 ? Math.floor(minExperience) : undefined,
    }),
  });
}

export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const payload = profileInputSchema.safeParse(body.data.payload);
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.issues[0]?.message ?? "Invalid details." }, { status: 400 });
  }

  const valid = await verifyAndConsume({
    nonce: body.data.nonce,
    address: body.data.address,
    action: "save_profile",
    payload: payload.data,
    signature: body.data.signature as `0x${string}`,
  });
  if (!valid) return NextResponse.json({ error: "The signature could not be verified." }, { status: 401 });

  return NextResponse.json({ profile: await saveProfile(payload.data, body.data.address) });
}