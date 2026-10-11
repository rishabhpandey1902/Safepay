"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useApiSession } from "@/lib/api-session";
import { RoleSignInLink } from "@/lib/wallet/role-sign-in-link";
import { useSafePayWallet } from "@/lib/wallet/useSafePayWallet";

import type { NotificationItem } from "../notification-bell";

export default function NotificationsPage() {
  const router = useRouter();
  const { ready: walletReady, authenticated } = useSafePayWallet();
  const { ready, authedFetch } = useApiSession();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await authedFetch("/api/notifications");
      const body = (await response.json()) as { items?: NotificationItem[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not load notifications.");
      setItems(body.items ?? []);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    if (!ready) return;
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [ready, load]);

  const markAll = async () => {
    await authedFetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "readAll" }),
    }).catch(() => undefined);
    await load();
  };

  const open = async (item: NotificationItem) => {
    if (!item.isRead) {
      await authedFetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", ids: [item.id] }),
      }).catch(() => undefined);
    }
    router.push(item.link);
  };

  if (!walletReady) return <main className="flex-1 bg-slate-950 p-10 text-slate-300">Loading…</main>;

  if (!authenticated) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-950 px-6 py-10">
        <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 text-slate-50">
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="mt-3 text-slate-300">Sign in to see what happened on your agreements.</p>
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold">Notifications</h1>
          <button type="button" onClick={() => void markAll()} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold hover:border-slate-500">
            Mark all as read
          </button>
        </div>
        {error ? <p role="alert" className="rounded-xl border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">{error}</p> : null}
        {loading ? <p className="text-slate-400">Loading…</p> : null}
        {!loading && !error && items.length === 0 ? <p className="text-slate-400">Nothing yet. Updates on your agreements appear here.</p> : null}
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => void open(item)}
                className={`w-full rounded-2xl border p-4 text-left hover:border-slate-500 ${item.isRead ? "border-slate-800 bg-slate-900" : "border-violet-500/40 bg-slate-900"}`}
              >
                <p className="flex items-center gap-2 font-semibold">
                  {!item.isRead ? <span className="h-2 w-2 rounded-full bg-violet-400" /> : null}
                  {item.title}
                </p>
                <p className="mt-1 text-sm text-slate-300">{item.body}</p>
                <p className="mt-1 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}