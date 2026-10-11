"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { useApiSession } from "@/lib/api-session";
import { MAX_FILE_BYTES, MAX_FILES, MAX_MESSAGE_CHARS, shortAddress } from "@/lib/chat-keys";
import { useWalletSession } from "@/lib/wallet/session";

type ChatFile = { id: number; name: string; mime: string; size: number };
type ChatMessage = { id: number; sender: string; body: string; createdAt: string; files: ChatFile[] };

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function ChatBox({ thread, emptyText }: { thread: string; emptyText?: string }) {
  const { address } = useWalletSession();
  const { ready, authedFetch } = useApiSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const lastId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const me = address?.toLowerCase() ?? "";

  const load = useCallback(
    async (reset: boolean) => {
      try {
        const after = reset ? 0 : lastId.current;
        const response = await authedFetch(`/api/chat?thread=${encodeURIComponent(thread)}&after=${after}`);
        const body = (await response.json()) as {
          messages?: ChatMessage[];
          names?: Record<string, string>;
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? "Could not load the chat.");
        const incoming = body.messages ?? [];
        if (body.names) setNames(body.names);
        if (incoming.length > 0) lastId.current = Math.max(lastId.current, incoming[incoming.length - 1].id);
        setMessages((current) => {
          if (reset) return incoming;
          const seen = new Set(current.map((message) => message.id));
          return [...current, ...incoming.filter((message) => !seen.has(message.id))];
        });
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load the chat.");
      } finally {
        setLoaded(true);
      }
    },
    [authedFetch, thread],
  );

  useEffect(() => {
    if (!ready) return;
    lastId.current = 0;
    void load(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(false);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [ready, load]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  const onPick = (list: FileList | null) => {
    if (!list) return;
    const next = [...picked, ...Array.from(list)];
    if (next.length > MAX_FILES) {
      setError(`You can attach up to ${MAX_FILES} files per message.`);
      return;
    }
    const tooBig = next.find((file) => file.size > MAX_FILE_BYTES);
    if (tooBig) {
      setError(`${tooBig.name} is larger than 1 MB. Share larger files with a link instead.`);
      return;
    }
    setError(null);
    setPicked(next);
    if (fileInput.current) fileInput.current.value = "";
  };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy || (!text.trim() && picked.length === 0)) return;
    setBusy(true);
    setError(null);
    try {
      const files = await Promise.all(
        picked.map(async (file) => ({
          name: file.name,
          mime: file.type || "application/octet-stream",
          data: await toBase64(file),
        })),
      );
      const response = await authedFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread, body: text.trim(), files }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not send your message.");
      setText("");
      setPicked([]);
      await load(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send your message.");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const download = async (file: ChatFile) => {
    const response = await authedFetch(`/api/chat/file?id=${file.id}`);
    if (!response.ok) {
      setError("Could not download that file.");
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  if (!ready) {
    return (
      <p className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-400">
        Starting a secure session. You may be asked to sign a message. It does not move any money.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950/60">
      <div ref={listRef} className="max-h-96 min-h-40 space-y-3 overflow-y-auto p-4">
        {!loaded ? <p className="text-sm text-slate-400">Loading messages…</p> : null}
        {loaded && messages.length === 0 ? (
          <p className="text-sm text-slate-400">{emptyText ?? "No messages yet. Say hello and share the project details."}</p>
        ) : null}
        {messages.map((message) => {
          const mine = message.sender === me;
          return (
            <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${mine ? "bg-violet-700 text-white" : "bg-slate-800 text-slate-100"}`}>
                <p className="text-xs opacity-70">{mine ? "You" : names[message.sender] ?? shortAddress(message.sender)}</p>
                {message.body ? <p className="mt-1 whitespace-pre-wrap break-words">{message.body}</p> : null}
                {message.files.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => void download(file)}
                    className="mt-2 block w-full rounded-lg border border-white/20 px-3 py-1.5 text-left text-xs hover:bg-white/10"
                  >
                    Download {file.name} ({sizeLabel(file.size)})
                  </button>
                ))}
                <p className="mt-1 text-right text-[11px] opacity-60">{new Date(message.createdAt).toLocaleString()}</p>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={(event) => void send(event)} className="border-t border-slate-800 p-3">
        {error ? <p role="alert" className="mb-2 text-sm text-red-300">{error}</p> : null}
        {picked.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-2">
            {picked.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200">
                {file.name} ({sizeLabel(file.size)})
                <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setPicked((current) => current.filter((_, position) => position !== index))} className="text-slate-400 hover:text-white">
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={MAX_MESSAGE_CHARS}
          placeholder="Write a message. Enter sends, Shift+Enter adds a new line."
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <input ref={fileInput} type="file" multiple onChange={(event) => onPick(event.target.files)} className="hidden" id={`file-${thread}`} />
            <label htmlFor={`file-${thread}`} className="cursor-pointer rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500">
              Attach files (up to {MAX_FILES}, 1 MB each)
            </label>
          </div>
          <button type="submit" disabled={busy || (!text.trim() && picked.length === 0)} className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold hover:bg-violet-500 disabled:opacity-50">
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}