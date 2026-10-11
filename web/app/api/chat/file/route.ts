import { NextResponse } from "next/server";

import { resolveThread } from "@/lib/chat-server";
import { dbGet } from "@/lib/db";
import { sessionAddress } from "@/lib/session-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const me = await sessionAddress(request);
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const id = Math.floor(Number(new URL(request.url).searchParams.get("id")));
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid file." }, { status: 400 });

  const row = await dbGet<{ data: string; thread: string }>(
    `SELECT f.data AS data, m.thread AS thread
     FROM chat_files f JOIN chat_messages m ON m.id = f.message_id WHERE f.id = ?`,
    [id],
  );
  if (!row) return NextResponse.json({ error: "File not found." }, { status: 404 });
  if (!(await resolveThread(row.thread, me))) {
    return NextResponse.json({ error: "You are not part of this conversation." }, { status: 403 });
  }

  return new Response(Buffer.from(row.data, "base64") as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="download"',
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}