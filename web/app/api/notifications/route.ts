import { NextResponse } from "next/server";
import { z } from "zod";

import { dbAll, dbGet, dbRun } from "@/lib/db";
import { sessionAddress } from "@/lib/session-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = { id: number; type: string; title: string; body: string; link: string; is_read: number; created_at: string };

export async function GET(request: Request) {
  const me = await sessionAddress(request);
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const rows = await dbAll<Row>(
    "SELECT id, type, title, body, link, is_read, created_at FROM notifications WHERE address = ? ORDER BY id DESC LIMIT 100",
    [me],
  );
  const unread = await dbGet<{ c: number }>(
    "SELECT COUNT(*) AS c FROM notifications WHERE address = ? AND is_read = 0",
    [me],
  );
  return NextResponse.json({
    unread: Number(unread?.c ?? 0),
    items: rows.map((row) => ({
      id: Number(row.id),
      type: row.type,
      title: row.title,
      body: row.body,
      link: row.link,
      isRead: Number(row.is_read) === 1,
      createdAt: row.created_at,
    })),
  });
}

const postSchema = z.union([
  z.object({ action: z.literal("readAll") }),
  z.object({ action: z.literal("read"), ids: z.array(z.number().int()).max(100) }),
]);

export async function POST(request: Request) {
  const me = await sessionAddress(request);
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = postSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  if (body.data.action === "readAll") {
    await dbRun("UPDATE notifications SET is_read = 1 WHERE address = ?", [me]);
  } else if (body.data.ids.length > 0) {
    const marks = body.data.ids.map(() => "?").join(",");
    await dbRun(`UPDATE notifications SET is_read = 1 WHERE address = ? AND id IN (${marks})`, [me, ...body.data.ids]);
  }
  return NextResponse.json({ ok: true });
}