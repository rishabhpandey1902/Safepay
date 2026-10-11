"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isAddress, type Address } from "viem";

import { safePayEscrowAbi } from "@/lib/contracts";
import { formatTokenDisplay } from "@/lib/token";
import { RoleSignInLink } from "@/lib/wallet/role-sign-in-link";
import { useSafePayWallet } from "@/lib/wallet/useSafePayWallet";

import { useTokenConfig } from "../token-provider";

const contractAddress = process.env.NEXT_PUBLIC_SAFE_PAY_ESCROW_ADDRESS as Address | undefined;
const LATEST = 15;
const ZERO = BigInt(0);

type Entry = {
  key: string;
  agreementId: number;
  kind: "paid" | "received" | "refunded" | "fee";
  amount: bigint;
  counterparty: Address;
  note: string;
  when: number;
};

type Totals = { paid: bigint; received: bigint; refunded: bigint; held: bigint; pending: bigint };
type CancelRecord = { cancelledBy: string; contractorFee: string; clientRefund: string; txHash: string; createdAt: string };

const emptyTotals: Totals = { paid: ZERO, received: ZERO, refunded: ZERO, held: ZERO, pending: ZERO };
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

export default function HistoryPage() {
  const { ready, authenticated, address, publicClient } = useSafePayWallet();
  const tokenConfig = useTokenConfig();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [totals, setTotals] = useState<Totals>(emptyTotals);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const configError =
    !contractAddress || !isAddress(contractAddress) || /^0x0+$/.test(contractAddress)
      ? "Set NEXT_PUBLIC_SAFE_PAY_ESCROW_ADDRESS to see your history."
      : null;

  useEffect(() => {
    if (configError || !contractAddress || !address) return;
    const escrow = contractAddress;
    const me = address.toLowerCase();
    let active = true;

    const load = async () => {
      try {
        const count = Number(
          await publicClient.readContract({ address: escrow, abi: safePayEscrowAbi, functionName: "agreementCount" }),
        );
        const first = Math.max(1, count - LATEST + 1);
        const ids = Array.from({ length: Math.max(0, count - first + 1) }, (_, index) => first + index);

        const nextEntries: Entry[] = [];
        const nextTotals: Totals = { ...emptyTotals };
        const cancelledList: { id: number; other: Address; isClient: boolean; isContractor: boolean }[] = [];

        await Promise.all(
          ids.map(async (id) => {
            const agreement = await publicClient.readContract({
              address: escrow,
              abi: safePayEscrowAbi,
              functionName: "getAgreement",
              args: [BigInt(id)],
            });
            const isClient = agreement.client.toLowerCase() === me;
            const isContractor = agreement.contractor.toLowerCase() === me;
            if (!isClient && !isContractor) return;

            const funded = agreement.fundedAt > ZERO;
            const other = isClient ? agreement.contractor : agreement.client;

            if (Number(agreement.status) === 2) {
              cancelledList.push({ id, other, isClient, isContractor });
            }

            const milestones = await Promise.all(
              Array.from({ length: Number(agreement.milestoneCount) }, (_, index) =>
                publicClient.readContract({
                  address: escrow,
                  abi: safePayEscrowAbi,
                  functionName: "getMilestone",
                  args: [BigInt(id), BigInt(index)],
                }),
              ),
            );

            if (isClient && funded) {
              nextEntries.push({
                key: `${id}-funded`,
                agreementId: id,
                kind: "paid",
                amount: agreement.totalAmount,
                counterparty: other,
                note: "Funded the agreement",
                when: Number(agreement.fundedAt),
              });
              nextTotals.paid += agreement.totalAmount;
            }

            milestones.forEach((milestone, index) => {
              const status = Number(milestone.status);
              const label = `Milestone ${index + 1}`;
              const when = Number(milestone.submittedAt);

              const addReceived = (amount: bigint, note: string) => {
                if (isContractor && amount > ZERO) {
                  nextEntries.push({ key: `${id}-${index}-in`, agreementId: id, kind: "received", amount, counterparty: other, note, when });
                  nextTotals.received += amount;
                }
              };
              const addRefund = (amount: bigint, note: string) => {
                if (isClient && amount > ZERO) {
                  nextEntries.push({ key: `${id}-${index}-refund`, agreementId: id, kind: "refunded", amount, counterparty: other, note, when });
                  nextTotals.refunded += amount;
                }
              };

              if (status === 2) addReceived(milestone.contractorPayout > ZERO ? milestone.contractorPayout : milestone.amount, `${label} released`);
              if (status === 4) addRefund(milestone.clientRefund > ZERO ? milestone.clientRefund : milestone.amount, `${label} refunded`);
              if (status === 5) {
                addReceived(milestone.contractorPayout, `${label} split`);
                addRefund(milestone.clientRefund, `${label} split`);
              }

              if (funded && (status === 0 || status === 1 || status === 3)) {
                if (isClient) nextTotals.held += milestone.amount;
                if (isContractor) nextTotals.pending += milestone.amount;
              }
            });
          }),
        );

        if (cancelledList.length > 0) {
          let records: Record<string, CancelRecord> = {};
          try {
            const response = await fetch(`/api/cancellation?ids=${cancelledList.map((item) => item.id).join(",")}`, {
              cache: "no-store",
            });
            if (response.ok) {
              const body = (await response.json()) as { cancelled?: Record<string, CancelRecord> };
              records = body.cancelled ?? {};
            }
          } catch {
            // Without records the page shows an "amounts not recorded" row.
          }

          for (const item of cancelledList) {
            const record = records[String(item.id)];
            if (!record) {
              nextEntries.push({
                key: `${item.id}-cancelled`,
                agreementId: item.id,
                kind: "fee",
                amount: ZERO,
                counterparty: item.other,
                note: "Agreement cancelled (amounts not recorded)",
                when: 0,
              });
              continue;
            }
            const fee = BigInt(record.contractorFee);
            const refund = BigInt(record.clientRefund);
            const when = Math.floor(new Date(record.createdAt).getTime() / 1000);
            const by = record.cancelledBy.toLowerCase() === me ? "by you" : "by the other party";

            if (item.isContractor && fee > ZERO) {
              nextEntries.push({
                key: `${item.id}-cancel-fee-in`,
                agreementId: item.id,
                kind: "received",
                amount: fee,
                counterparty: item.other,
                note: `Cancellation fee (cancelled ${by})`,
                when,
              });
              nextTotals.received += fee;
            }
            if (item.isClient && fee > ZERO) {
              nextEntries.push({
                key: `${item.id}-cancel-fee-out`,
                agreementId: item.id,
                kind: "fee",
                amount: fee,
                counterparty: item.other,
                note: `Cancellation fee paid to the contractor (cancelled ${by})`,
                when,
              });
            }
            if (item.isClient && refund > ZERO) {
              nextEntries.push({
                key: `${item.id}-cancel-refund`,
                agreementId: item.id,
                kind: "refunded",
                amount: refund,
                counterparty: item.other,
                note: `Balance returned after cancellation (cancelled ${by})`,
                when,
              });
              nextTotals.refunded += refund;
            }
          }
        }

        nextEntries.sort((a, b) => b.when - a.when || b.agreementId - a.agreementId);

        const profileMap: Record<string, string> = {};
        try {
          const response = await fetch("/api/profiles", { cache: "no-store" });
          if (response.ok) {
            const body = (await response.json()) as { profiles?: { address: string; displayName: string; isDemo: boolean }[] };
            for (const profile of body.profiles ?? []) {
              if (!profile.isDemo) profileMap[profile.address.toLowerCase()] = profile.displayName;
            }
          }
        } catch {
          // Names are optional.
        }

        if (!active) return;
        setEntries(nextEntries);
        setTotals(nextTotals);
        setNames(profileMap);
        setError(null);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load your history.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [address, configError, publicClient]);

  const amount = (value: bigint) =>
    tokenConfig.status === "ready" ? formatTokenDisplay(value, tokenConfig.metadata) : "—";

  if (!ready) return <main className="flex-1 bg-slate-950 p-10 text-slate-300">Loading…</main>;

  if (!authenticated) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-950 px-6 py-10">
        <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 text-slate-50">
          <h1 className="text-2xl font-semibold">Wallet history</h1>
          <p className="mt-3 text-slate-300">Sign in to see what you paid and received.</p>
          <RoleSignInLink className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500">
            Sign in
          </RoleSignInLink>
        </div>
      </main>
    );
  }

  const card = "rounded-2xl border border-slate-800 bg-slate-900 p-4";
  const who = (value: string) => names[value.toLowerCase()] ?? short(value);
  const sign = { paid: "−", received: "+", refunded: "+", fee: "−" } as const;
  const color = {
    paid: "text-red-300",
    received: "text-emerald-300",
    refunded: "text-emerald-300",
    fee: "text-red-300",
  } as const;
  const label = {
    paid: "Paid into escrow",
    received: "Received",
    refunded: "Refunded to you",
    fee: "Cancellation",
  } as const;
  const direction = (entry: Entry) =>
    entry.kind === "paid" || (entry.kind === "fee" && entry.amount > ZERO)
      ? "To"
      : entry.kind === "fee"
        ? "With"
        : "From";

  return (
    <main className="flex-1 bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-400">SafePay</p>
            <h1 className="mt-2 text-3xl font-semibold">Wallet history</h1>
            <p className="mt-1 break-all text-xs text-slate-500">{address}</p>
          </div>
          {address ? (
            <a
              href={`https://testnet.monadexplorer.com/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-500"
            >
              Open in explorer
            </a>
          ) : null}
        </div>

        {configError || error ? (
          <p role="alert" className="rounded-xl border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">{configError ?? error}</p>
        ) : null}
        {loading && !configError ? <p className="text-slate-400">Loading your history…</p> : null}

        <section className="grid gap-3 sm:grid-cols-5">
          <div className={card}><p className="text-xs text-slate-400">Paid into escrow</p><p className="mt-1 font-semibold">{amount(totals.paid)}</p></div>
          <div className={card}><p className="text-xs text-slate-400">Received</p><p className="mt-1 font-semibold">{amount(totals.received)}</p></div>
          <div className={card}><p className="text-xs text-slate-400">Refunded</p><p className="mt-1 font-semibold">{amount(totals.refunded)}</p></div>
          <div className={card}><p className="text-xs text-slate-400">Still in escrow (you paid)</p><p className="mt-1 font-semibold">{amount(totals.held)}</p></div>
          <div className={card}><p className="text-xs text-slate-400">Pending income</p><p className="mt-1 font-semibold">{amount(totals.pending)}</p></div>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Transactions</h2>
          {!loading && !error && entries.length === 0 ? (
            <p className="mt-3 text-slate-400">Nothing yet. Money movements appear here once an agreement is funded or paid out.</p>
          ) : null}
          <ul className="mt-3 space-y-3">
            {entries.map((entry) => (
              <li key={entry.key} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div>
                  <p className="font-medium">{label[entry.kind]} · {entry.note}</p>
                  <p className="text-xs text-slate-400">
                    {direction(entry)} {who(entry.counterparty)} ·{" "}
                    <Link href={`/agreement/${entry.agreementId}`} className="text-violet-300 hover:text-violet-200">
                      Agreement #{entry.agreementId}
                    </Link>{" "}
                    · {entry.when > 0 ? new Date(entry.when * 1000).toLocaleString() : "—"}
                  </p>
                </div>
                <p className={`text-lg font-semibold ${color[entry.kind]}`}>
                  {entry.amount > ZERO ? `${sign[entry.kind]} ${amount(entry.amount)}` : "—"}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            Built from the SafePay contract&apos;s records of your latest {LATEST} agreements, plus the
            cancellation details saved when an agreement was cancelled. It does not list transfers outside
            SafePay, such as faucet funds or tokens you minted. Use the explorer for those. Dates show when the
            agreement was funded, the milestone was submitted, or the cancellation was recorded.
          </p>
        </section>
      </div>
    </main>
  );
}