import { NextResponse } from "next/server";
import { z } from "zod";

import { MAX_FILE_BYTES, MAX_FILES, MAX_MESSAGE_CHARS } from "@/lib/chat-keys";
import { ensureThread, resolveThread } from "@/lib/chat-server";
import { dbAll, dbInsert, dbRun } from "@/lib/db";
import { displayName, notify } from "@/lib/notify";
import { sessionAddress } from "@/lib/session-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MessageRow = { id: number; sender: string; body: string; created_at: string };
type FileRow = { id: number; message_id: number; name: string; mime: string; size: number };

export async function GET(request: Request) {
  const me = await sessionAddress(request);
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const thread = params.get("thread") ?? "";
  const after = Math.max(0, Math.floor(Number(params.get("after")) || 0));
  const info = await resolveThread(thread, me);
  if (!info) return NextResponse.json({ error: "You are not part of this conversation." }, { status: 403 });

  const rows = await dbAll<MessageRow>(
    "SELECT id, sender, body, created_at FROM chat_messages WHERE thread = ? AND id > ? ORDER BY id ASC LIMIT 200",
    [thread, after],
  );
  const files =
    rows.length > 0
      ? await dbAll<FileRow>(
          `SELECT id, message_id, name, mime, size FROM chat_files WHERE message_id IN (${rows.map(() => "?").join(",")})`,
          rows.map((row) => Number(row.id)),
        )
      : [];

  return NextResponse.json({
    names: { [info.a]: await displayName(info.a), [info.b]: await displayName(info.b) },
    messages: rows.map((row) => ({
      id: Number(row.id),
      sender: row.sender,
      body: row.body,
      createdAt: row.created_at,
      files: files
        .filter((file) => Number(file.message_id) === Number(row.id))
        .map((file) => ({ id: Number(file.id), name: file.name, mime: file.mime, size: Number(file.size) })),
    })),
  });
}

const postSchema = z.object({
  thread: z.string().max(120),
  body: z.string().max(MAX_MESSAGE_CHARS).default(""),
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        mime: z.string().max(100),
        data: z.string().max(1_500_000),
      }),
    )
    .max(MAX_FILES)
    .default([]),
});

export async function POST(request: Request) {
  const me = await sessionAddress(request);
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  const body = parsed.data.body.trim();

  const info = await resolveThread(parsed.data.thread, me);
  if (!info) return NextResponse.json({ error: "You are not part of this conversation." }, { status: 403 });

  const files = parsed.data.files.map((file) => {
    const buffer = Buffer.from(file.data, "base64");
    return {
      name: file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "file",
      mime: /^[\w.+-]+\/[\w.+-]+$/.test(file.mime) ? file.mime : "application/octet-stream",
      size: buffer.length,
      data: buffer.toString("base64"),
    };
  });
  if (!body && files.length === 0) return NextResponse.json({ error: "Write a message or attach a file." }, { status: 400 });
  if (files.some((file) => file.size === 0 || file.size > MAX_FILE_BYTES)) {
    return NextResponse.json({ error: "Each file must be between 1 byte and 1 MB. Share larger files with a link." }, { status: 400 });
  }

  await ensureThread(info);
  const createdAt = new Date().toISOString();
  const id = await dbInsert("INSERT INTO chat_messages (thread, sender, body, created_at) VALUES (?, ?, ?, ?)", [
    info.thread,
    me,
    body,
    createdAt,
  ]);
  for (const file of files) {
    await dbInsert("INSERT INTO chat_files (message_id, name, mime, size, data) VALUES (?, ?, ?, ?, ?)", [
      id,
      file.name,
      file.mime,
      file.size,
      file.data,
    ]);
  }

  const preview = body || `Sent ${files.length} file${files.length === 1 ? "" : "s"}`;
  await dbRun("UPDATE chat_threads SET last_message_at = ?, last_preview = ? WHERE thread = ?", [
    createdAt,
    preview.slice(0, 160),
    info.thread,
  ]);

  const other = me === info.a ? info.b : info.a;
  await notify({
    address: other,
    type: "chat",
    title: `New message from ${await displayName(me)}`,
    body: preview,
    link: info.kind === "agreement" ? `/agreement/${info.thread.split(":")[1]}#chat` : `/messages/${me}`,
    collapse: true,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, id });
}