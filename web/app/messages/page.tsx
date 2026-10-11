"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useApiSession } from "@/lib/api-session";
import { RoleSignInLink } from "@/lib/wallet/role-sign-in-link";
import { useSafePayWallet } from "@/lib/wallet/useSafePayWallet";

type Chat = {
  thread: string;
  kind: string;
  counterparty: string;
  name: string;
  agreementId: number | null;
  preview: string;
  lastAt: string;
};

export default function MessagesPage() {
  const { ready: walletReady, authenticated } = useSafePayWallet();
  const { ready, authedFetch } = useApiSession();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    const load = async () => {
      try {
        const response = await authedFetch("/api/chats");
        const body = (await response.json()) as { chats?: Chat[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Could not load your messages.");
        if (active) {
          setChats(body.chats ?? []);
          setError(null);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load your messages.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [ready, authedFetch]);

  if (!walletReady) return <main className="flex-1 bg-slate-950 p-10 text-slate-300">Loading…</main>;

  if (!authenticated) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-950 px-6 py-10">
        <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 text-slate-50">
          <h1 className="text-2xl font-semibold">Messages</h1>
          <p className="mt-3 text-slate-300">Sign in to see your conversations.</p>
          <RoleSignInLink className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500">
            Sign in
          </RoleSignInLink>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-3xl font-semibold">Messages</h1>
        {error ? <p role="alert" className="rounded-xl border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">{error}</p> : null}
        {loading ? <p className="text-slate-400">Loading…</p> : null}
        {!loading && !error && chats.length === 0 ? (
          <p className="text-slate-400">
            No conversations yet. Use <Link href="/services" className="text-violet-300">Find freelancer</Link> or a
            project page to start one, or open an agreement and use its chat.
          </p>
        ) : null}
        <ul className="space-y-3">
          {chats.map((chat) => (
            <li key={chat.thread}>
              <Link
                href={chat.agreementId ? `/agreement/${chat.agreementId}#chat` : `/messages/${chat.counterparty}`}
                className="block rounded-2xl border border-slate-800 bg-slate-900 p-4 hover:border-slate-500"
              >
                <p className="font-semibold">
                  {chat.name}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {chat.agreementId ? `Agreement #${chat.agreementId}` : "Direct message"}
                  </span>
                </p>
                <p className="mt-1 line-clamp-1 text-sm text-slate-300">{chat.preview}</p>
                <p className="mt-1 text-xs text-slate-500">{new Date(chat.lastAt).toLocaleString()}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}