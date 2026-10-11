"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isAddress, type Address } from "viem";

import { safePayEscrowAbi } from "@/lib/contracts";
import { formatTokenDisplay } from "@/lib/token";
import { useSafePayWallet } from "@/lib/wallet/useSafePayWallet";

import { useTokenConfig } from "../token-provider";

const contractAddress = process.env.NEXT_PUBLIC_SAFE_PAY_ESCROW_ADDRESS as Address | undefined;
const LATEST = 40;

type Row = {
  id: number;
  client: Address;
  contractor: Address;
  totalAmount: bigint;
  remainingBalance: bigint;
  status: number;
};

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

export default function ActivityPage() {
  const { publicClient } = useSafePayWallet();
  const tokenConfig = useTokenConfig();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [closedIds, setClosedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const configError =
    !contractAddress || !isAddress(contractAddress) || /^0x0+$/.test(contractAddress)
      ? "Set NEXT_PUBLIC_SAFE_PAY_ESCROW_ADDRESS to see activity."
      : null;

  useEffect(() => {
    if (configError || !contractAddress) return;
    const escrow = contractAddress;
    let active = true;

    const load = async () => {
      try {
        const count = Number(
          await publicClient.readContract({ address: escrow, abi: safePayEscrowAbi, functionName: "agreementCount" }),
        );
        const first = Math.max(1, count - LATEST + 1);
        const ids = Array.from({ length: Math.max(0, count - first + 1) }, (_, index) => first + index);
        const list = await Promise.all(
          ids.map(async (id) => {
            const agreement = await publicClient.readContract({
              address: escrow,
              abi: safePayEscrowAbi,
              functionName: "getAgreement",
              args: [BigInt(id)],
            });
            return {
              id,
              client: agreement.client,
              contractor: agreement.contractor,
              totalAmount: agreement.totalAmount,
              remainingBalance: agreement.remainingBalance,
              status: Number(agreement.status),
            } satisfies Row;
          }),
        );

        let closed = new Set<number>();
        const draftIds = list.filter((row) => row.status === 0).map((row) => row.id);
        if (draftIds.length > 0) {
          const response = await fetch(`/api/agreement-closure?ids=${draftIds.join(",")}`, { cache: "no-store" });
          if (response.ok) {
            const body = (await response.json()) as { closed?: Record<string, string> };
            closed = new Set(Object.keys(body.closed ?? {}).map(Number));
          }
        }

        if (!active) return;
        setTotal(count);
        setRows(list.reverse());
        setClosedIds(closed);
        setError(null);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load activity.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [configError, publicClient]);

  const amount = (value: bigint) =>
    tokenConfig.status === "ready" ? formatTokenDisplay(value, tokenConfig.metadata) : "—";

  const label = (row: Row) => {
    if (row.status === 0) return closedIds.has(row.id) ? "Closed before funding" : "Waiting to be funded";
    if (row.status === 1) return "Active";
    return row.status === 2 ? "Cancelled" : "Completed";
  };

  const active = rows.filter((row) => row.status === 1);
  const locked = active.reduce((sum, row) => sum + row.remainingBalance, BigInt(0));
  const finished = rows.filter((row) => row.status > 1).length;

  const stat = "rounded-2xl border border-slate-800 bg-slate-900 p-4";

  return (
    <main className="flex-1 bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-400">SafePay</p>
          <h1 className="mt-2 text-3xl font-semibold">Activity</h1>
          <p className="mt-2 text-sm text-slate-400">
            Recent agreements across SafePay. Agreements are public on the blockchain. Only addresses and
            amounts are shown here.
          </p>
        </div>

        {configError || error ? (
          <p role="alert" className="rounded-xl border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
            {configError ?? error}
          </p>
        ) : null}
        {loading && !configError ? <p className="text-slate-400">Loading activity…</p> : null}

        <section className="grid gap-4 sm:grid-cols-4">
          <div className={stat}><p className="text-xs text-slate-400">Agreements created</p><p className="mt-1 text-2xl font-semibold">{total}</p></div>
          <div className={stat}><p className="text-xs text-slate-400">Active (recent)</p><p className="mt-1 text-2xl font-semibold">{active.length}</p></div>
          <div className={stat}><p className="text-xs text-slate-400">Finished (recent)</p><p className="mt-1 text-2xl font-semibold">{finished}</p></div>
          <div className={stat}><p className="text-xs text-slate-400">Held in escrow (recent)</p><p className="mt-1 text-lg font-semibold">{amount(locked)}</p></div>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Latest agreements</h2>
          {!loading && !error && rows.length === 0 ? <p className="mt-3 text-slate-400">No agreements yet.</p> : null}
          <ul className="mt-3 space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div>
                  <p className="font-semibold">Agreement #{row.id} · {amount(row.totalAmount)}</p>
                  <p className="text-xs text-slate-400">{short(row.client)} pays {short(row.contractor)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-slate-300">{label(row)}</span>
                  <Link href={`/agreement/${row.id}`} className="text-sm font-semibold text-violet-300 hover:text-violet-200">Open</Link>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">Showing the latest {LATEST} agreements. The totals cover only those.</p>
        </section>
      </div>
    </main>
  );
}