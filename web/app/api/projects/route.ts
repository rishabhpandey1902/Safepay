import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyAndConsume } from "@/lib/projects-auth";
import { createProject, listProjects } from "@/lib/projects-db";
import { addressSchema, projectInputSchema } from "@/lib/projects-schema";

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
  return NextResponse.json({
    projects: await listProjects({ search: clean("search"), category: clean("category"), country: clean("country") }),
  });
}

export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const payload = projectInputSchema.safeParse(body.data.payload);
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.issues[0]?.message ?? "Invalid details." }, { status: 400 });
  }

  const valid = await verifyAndConsume({
    nonce: body.data.nonce,
    address: body.data.address,
    action: "create_project",
    payload: payload.data,
    signature: body.data.signature as `0x${string}`,
  });
  if (!valid) return NextResponse.json({ error: "The signature could not be verified." }, { status: 401 });

  return NextResponse.json({ project: await createProject(payload.data, body.data.address) });
}