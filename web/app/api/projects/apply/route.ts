import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyAndConsume } from "@/lib/projects-auth";
import { createApplication } from "@/lib/projects-db";
import { addressSchema, applicationInputSchema } from "@/lib/projects-schema";
import { getProject } from "@/lib/projects-db";
import { displayName, notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  nonce: z.string().uuid(),
  address: addressSchema,
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  payload: z.unknown(),
});

export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const payload = applicationInputSchema.safeParse(body.data.payload);
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.issues[0]?.message ?? "Invalid details." }, { status: 400 });
  }

  const valid = await verifyAndConsume({
    nonce: body.data.nonce,
    address: body.data.address,
    action: "apply",
    payload: payload.data,
    signature: body.data.signature as `0x${string}`,
  });
  if (!valid) return NextResponse.json({ error: "The signature could not be verified." }, { status: 401 });

  const result = await createApplication(payload.data, body.data.address);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const project = await getProject(payload.data.projectId);
  if (project) {
    await notify({
      address: project.ownerAddress,
      type: "application",
      title: "New application on your project",
      body: `${await displayName(body.data.address)} applied to "${project.title}".`,
      link: `/projects/${project.id}`,
    }).catch(() => undefined);
  }
  return NextResponse.json({ application: result.application });
}