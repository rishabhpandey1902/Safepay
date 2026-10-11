import { NextResponse } from "next/server";
import { z } from "zod";

import { issueChallenge } from "@/lib/projects-auth";
import { profileInputSchema } from "@/lib/profiles-schema";
import { addressSchema, applicationInputSchema, projectInputSchema } from "@/lib/projects-schema";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["create_project", "apply", "save_profile"]),
  address: addressSchema,
  payload: z.unknown(),
});

const schemas = {
  create_project: projectInputSchema,
  apply: applicationInputSchema,
  save_profile: profileInputSchema,
} as const;

export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const payload = schemas[body.data.action].safeParse(body.data.payload);
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.issues[0]?.message ?? "Invalid details." }, { status: 400 });
  }

  return NextResponse.json(
    await issueChallenge({ action: body.data.action, address: body.data.address, payload: payload.data }),
  );
}