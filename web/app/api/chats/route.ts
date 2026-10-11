import { NextResponse } from "next/server";

import { dbAll } from "@/lib/db";
import { displayName } from "@/lib/notify";
import { sessionAddress } from "@/lib/session-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const me = await sessionAddress(request);
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const rows = await dbAll<{
    thread: string;
    a: string;
    b: string;
    kind: string;
    last_message_at: string;
    last_preview: string | null;
  }>(
    `SELECT thread, a, b, kind, last_message_at, last_preview FROM chat_threads
     WHERE (a = ? OR b = ?) AND last_message_at IS NOT NULL
     ORDER BY last_message_at DESC LIMIT 50`,
    [me, me],
  );

  const chats = await Promise.all(
    rows.map(async (row) => {
      const other = row.a === me ? row.b : row.a;
      return {
        thread: row.thread,
        kind: row.kind,
        counterparty: other,
        name: await displayName(other),
        agreementId: row.kind === "agreement" ? Number(row.thread.split(":")[1]) : null,
        preview: row.last_preview ?? "",
        lastAt: row.last_message_at,
      };
    }),
  );
  return NextResponse.json({ chats });
}