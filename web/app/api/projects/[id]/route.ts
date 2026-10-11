import { NextResponse } from "next/server";

import { getProject, listApplications } from "@/lib/projects-db";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ project, applications: await listApplications(id) });
}