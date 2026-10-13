"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { isAddress, type Address } from "viem";

import { useApiSession } from "@/lib/api-session";
import { shortAddress } from "@/lib/chat-keys";
import { safePayEscrowAbi } from "@/lib/contracts";
import { formatTokenDisplay } from "@/lib/token";
import { RoleSignInLink } from "@/lib/wallet/role-sign-in-link";
import { useSafePayWallet } from "@/lib/wallet/useSafePayWallet";

import { ChatBox } from "../../chat-box";
import { useTokenConfig } from "../../token-provider";

const contractAddress = process.env.NEXT_PUBLIC_SAFE_PAY_ESCROW_ADDRESS as Address | undefined;

type Note = { note: string; link: string };
type Disputed = {
  index: number;
  amount: bigint;
  delivery: Note | null;
  reason: Note | null;
  raisedBy: Address;
};
type Parties = { client: Address; contractor: Address; resolver: Address };

function parseNote(value: string): Note | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { n?: unknown; l?: unknown };
    if (typeof parsed === "object" && parsed !== null) {
      return {
        note: typeof parsed.n === "string" ? parsed.n : "",
        link: typeof parsed.l === "string" && /^https?:\/\//i.test(parsed.l) ? parsed.l : "",
      };
    }
  } catch {
    // Older records stored a plain link.
  }
  return /^https?:\/\//i.test(value) ? { note: "", link: value } : { note: value, link: "" };
}

export default function DisputeRoomPage() {
  const params = useParams<{ id: string }>();
  const agreementId = Number(params?.id ?? "0");
  const { ready, authenticated, address, publicClient } = useSafePayWallet();
  const { authedFetch } = useApiSession();
  const tokenConfig = useTokenConfig();
  const [parties, setParties] = useState<Parties | null>(null);
  const [items, setItems] = useState<Disputed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const configError =
    !contractAddress || !isAddress(contractAddress) || /^0x0+$/.test(contractAddress)
      ? "Set NEXT_PUBLIC_SAFE_PAY_ESCROW_ADDRESS to open this page."
      : !Number.isSafeInteger(agreementId) || agreementId <= 0
        ? "This agreement number is not valid."
        : null;

  useEffect(() => {
    if (configError || !contractAddress) return;
    const escrow = contractAddress;
    let active = true;

    const load = async () => {
      try {
        const agreement = await publicClient.readContract({
          address: escrow,
          abi: safePayEscrowAbi,
          functionName: "getAgreement",
          args: [BigInt(agreementId)],
        });
        const milestones = await Promise.all(
          Array.from({ length: Number(agreement.milestoneCount) }, (_, index) =>
            publicClient.readContract({
              address: escrow,
              abi: safePayEscrowAbi,
              functionName: "getMilestone",
              args: [BigInt(agreementId), BigInt(index)],
            }),
          ),
        );
        if (!active) return;
        setParties({ client: agreement.client, contractor: agreement.contractor, resolver: agreement.resolver });
        setItems(
          milestones
            .map((milestone, index) => ({ milestone, index }))
            .filter(({ milestone }) => Number(milestone.status) === 3)
            .map(({ milestone, index }) => ({
              index,
              amount: milestone.amount,
              delivery: parseNote(milestone.evidenceURI),
              reason: parseNote(milestone.disputeReasonURI),
              raisedBy: milestone.disputeRaisedBy,
            })),
        );
        setError(null);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load this dispute.");
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
  }, [agreementId, configError, publicClient]);

  const amount = (value: bigint) =>
    tokenConfig.status === "ready" ? formatTokenDisplay(value, tokenConfig.metadata) : "—";

  const remind = async () => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const response = await authedFetch("/api/dispute-remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreementId }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not send the reminder.");
      setNotice("Reminder sent. The resolver has a new notification.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the reminder.");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return <main className="flex-1 bg-slate-950 p-10 text-slate-300">Loading…</main>;

  if (!authenticated || !address) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-950 px-6 py-10">
        <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 text-slate-50">
          <h1 className="text-2xl font-semibold">Dispute room</h1>
          <p className="mt-3 text-slate-300">Sign in to open this dispute.</p>
          <RoleSignInLink className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500">
            Sign in
          </RoleSignInLink>
        </div>
      </main>
    );
  }

  const me = address.toLowerCase();
  const role = !parties
    ? null
    : me === parties.client.toLowerCase()
      ? "client"
      : me === parties.contractor.toLowerCase()
        ? "contractor"
        : me === parties.resolver.toLowerCase()
          ? "resolver"
          : null;

  const noteBlock = (title: string, note: Note | null, empty: string) => (
    <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">{title}</p>
      {note && (note.note || note.link) ? (
        <>
          {note.note ? <p className="mt-1 whitespace-pre-line break-words text-slate-200">{note.note}</p> : null}
          {note.link ? (
            <a href={note.link} target="_blank" rel="noreferrer noopener" className="mt-1 inline-block break-all text-violet-300 hover:text-violet-200">
              Open link
            </a>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-slate-500">{empty}</p>
      )}
    </div>
  );

  return (
    <main className="flex-1 bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <Link href={`/agreement/${agreementId}`} className="text-sm text-teal-300 hover:text-teal-200">
            ← Back to agreement #{agreementId}
          </Link>
          <h1 className="mt-2 text-3xl font-semibold">Dispute room</h1>
          <p className="mt-1 text-sm text-slate-400">
            Agreement #{agreementId}. The client, the contractor and the resolver can all write here. Explain your case
            and share files before the resolver decides.
          </p>
        </div>

        {configError || error ? (
          <p role="alert" className="rounded-xl border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">{configError ?? error}</p>
        ) : null}
        {notice ? <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</p> : null}
        {loading && !configError ? <p className="text-slate-400">Loading…</p> : null}

        {parties && !role ? (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            Only the client, the contractor and the resolver of this agreement can open this room.
          </p>
        ) : null}

        {parties && role ? (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              {([
                ["Client", parties.client],
                ["Contractor", parties.contractor],
                ["Resolver", parties.resolver],
              ] as const).map(([label, who]) => (
                <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-400">{label}{who.toLowerCase() === me ? " (you)" : ""}</p>
                  <p className="mt-1 text-sm">{shortAddress(who)}</p>
                </div>
              ))}
            </section>

            {items.length === 0 && !loading ? (
              <p className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">
                There is no open dispute on this agreement right now. It may already have been resolved.
              </p>
            ) : null}

            {items.map((item) => (
              <section key={item.index} className="space-y-3 rounded-2xl border border-amber-500/30 bg-slate-900 p-5">
                <h2 className="text-lg font-semibold">
                  Milestone {item.index + 1} · {amount(item.amount)}
                </h2>
                <p className="text-xs text-slate-400">
                  Dispute raised by {item.raisedBy.toLowerCase() === parties.client.toLowerCase() ? "the client" : "the contractor"}.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {noteBlock("Delivered work", item.delivery, "No delivery details on file.")}
                  {noteBlock("Reason for the dispute", item.reason, "No written reason was saved. Disputes raised before this update only store a link.")}
                </div>
              </section>
            ))}

            {role === "resolver" && items.length > 0 ? (
              <section className="rounded-2xl border border-violet-500/40 bg-violet-500/10 p-5 text-sm text-violet-100">
                <p>You are the resolver. Read both sides here, then decide.</p>
                <Link href="/resolver" className="mt-3 inline-block rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white hover:bg-violet-500">
                  Open resolver tools
                </Link>
              </section>
            ) : null}

            {role !== "resolver" && items.length > 0 ? (
              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-300">
                <p>
                  Disputed money stays locked until the resolver decides. If nothing happens, you can send a reminder
                  (one every 6 hours).
                </p>
                <button
                  type="button"
                  onClick={() => void remind()}
                  disabled={busy}
                  className="mt-3 rounded-lg border border-violet-500/50 bg-violet-500/10 px-4 py-2 font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-60"
                >
                  {busy ? "Sending…" : "Remind the resolver"}
                </button>
              </section>
            ) : null}

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-lg font-semibold">Dispute chat</h2>
              <p className="mt-1 text-sm text-slate-400">Visible to the client, the contractor and the resolver only.</p>
              <div className="mt-4">
                <ChatBox thread={`dispute:${agreementId}`} emptyText="No messages yet. Explain what happened and attach evidence." />
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}