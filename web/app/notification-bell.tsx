"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useApiSession } from "@/lib/api-session";

export type NotificationItem = {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string;
  isRead: boolean;
  createdAt: string;
};

export function NotificationBell() {
  const router = useRouter();
  const { ready, authedFetch } = useApiSession();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<NotificationItem | null>(null);
  const lastSeen = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await authedFetch("/api/notifications");
      if (!response.ok) return;
      const body = (await response.json()) as { items: NotificationItem[]; unread: number };
      const newest = body.items[0]?.id ?? 0;
      if (lastSeen.current !== null && newest > lastSeen.current) {
        const fresh = body.items.find((item) => item.id > (lastSeen.current ?? 0) && !item.isRead);
        if (fresh) setToast(fresh);
      }
      lastSeen.current = newest;
      setItems(body.items);
      setUnread(body.unread);
    } catch {
      // Try again on the next refresh.
    }
  }, [authedFetch]);

  useEffect(() => {
    if (!ready) return;
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 12_000);
    return () => window.clearInterval(timer);
  }, [ready, load]);

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) SafePay` : "SafePay";
  }, [unread]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const markRead = async (ids: number[]) => {
    setItems((current) => current.map((item) => (ids.includes(item.id) ? { ...item, isRead: true } : item)));
    setUnread((count) => Math.max(0, count - ids.length));
    await authedFetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", ids }),
    }).catch(() => undefined);
  };

  const markAll = async () => {
    setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnread(0);
    await authedFetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "readAll" }),
    }).catch(() => undefined);
  };

    const openItem = (item: NotificationItem) => {
    setOpen(false);
    setToast(null);
    if (!item.isRead) void markRead([item.id]);
    const target = new URL(item.link, window.location.origin);
    if (target.pathname === window.location.pathname) {
      // Already on this page: refresh its data instead of navigating.
      window.dispatchEvent(new Event("safepay:refresh"));
      if (target.hash) window.location.hash = target.hash;
      return;
    }
    router.push(item.link);
  };

  if (!ready) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-lg border border-slate-700 p-2 text-slate-200 hover:border-slate-500"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] rounded-2xl border border-slate-700 bg-slate-900 p-3 shadow-2xl">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Notifications</p>
            <button type="button" onClick={() => void markAll()} className="text-xs text-violet-300 hover:text-violet-200">
              Mark all as read
            </button>
          </div>
          {items.length === 0 ? <p className="mt-3 text-sm text-slate-400">Nothing yet.</p> : null}
          <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto">
            {items.slice(0, 8).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className={`w-full rounded-lg px-3 py-2 text-left hover:bg-slate-800 ${item.isRead ? "" : "bg-slate-800/60"}`}
                >
                  <p className="flex items-center gap-2 text-sm font-medium text-white">
                    {!item.isRead ? <span className="h-2 w-2 rounded-full bg-violet-400" /> : null}
                    {item.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{item.body}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
                </button>
              </li>
            ))}
          </ul>
          <Link href="/notifications" onClick={() => setOpen(false)} className="mt-2 block text-center text-sm text-violet-300 hover:text-violet-200">
            See all notifications
          </Link>
        </div>
      ) : null}

      {toast ? (
        <button
          type="button"
          onClick={() => openItem(toast)}
          className="fixed bottom-4 right-4 z-50 w-80 max-w-[90vw] rounded-2xl border border-violet-500/50 bg-slate-900 p-4 text-left shadow-2xl"
        >
          <p className="text-sm font-semibold text-white">{toast.title}</p>
          <p className="mt-1 text-xs text-slate-300">{toast.body}</p>
        </button>
      ) : null}
    </div>
  );
}