"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { isAddress } from "viem";

import { dmThread, shortAddress } from "@/lib/chat-keys";
import { RoleSignInLink } from "@/lib/wallet/role-sign-in-link";
import { useSafePayWallet } from "@/lib/wallet/useSafePayWallet";

import { ChatBox } from "../../chat-box";

export default function DirectMessagePage() {
  const params = useParams<{ address: string }>();
  const other = (params?.address ?? "").toLowerCase();
  const { ready, authenticated, address } = useSafePayWallet();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!isAddress(other)) return;
    let active = true;
    fetch("/api/profiles", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ profiles?: { address: string; displayName: string; isDemo: boolean }[] }>)
      .then((body) => {
        const match = body.profiles?.find((profile) => profile.address.toLowerCase() === other && !profile.isDemo);
        if (active && match) setName(match.displayName);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [other]);

  if (!isAddress(other)) {
    return <main className="flex-1 bg-slate-950 p-10 text-slate-300">This conversation link is not valid.</main>;
  }
  if (!ready) return <main className="flex-1 bg-slate-950 p-10 text-slate-300">Loading…</main>;

  if (!authenticated || !address) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-950 px-6 py-10">
        <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 text-slate-50">
          <h1 className="text-2xl font-semibold">Message {name ?? shortAddress(other)}</h1>
          <p className="mt-3 text-slate-300">Sign in to start the conversation.</p>
          <RoleSignInLink className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500">
            Sign in
          </RoleSignInLink>
        </div>
      </main>
    );
  }

  const isDemo = /^0x[23]0{38}\d$/.test(other);
  return (
    <main className="flex-1 bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/messages" className="text-sm text-teal-300 hover:text-teal-200">← All messages</Link>
        <h1 className="text-2xl font-semibold">{name ?? shortAddress(other)}</h1>
        <p className="break-all text-xs text-slate-500">{other}</p>
        {other === address.toLowerCase() ? (
          <p className="text-slate-300">You can&apos;t message yourself.</p>
        ) : isDemo ? (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            This is a demo profile. Nobody can reply from it.
          </p>
        ) : (
          <ChatBox thread={dmThread(address, other)} emptyText="No messages yet. Introduce yourself and describe what you need." />
        )}
      </div>
    </main>
  );
}