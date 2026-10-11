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
const MAX_AGREEMENTS = 60;

type Row = {
  id: number;
  client: Address;
  contractor: Address;
  totalAmount: bigint;
  remainingBalance: bigint;
  status: number;
};

function describeRow(row: Row, me: string, accepted: boolean) {
  const isClient = row.client.toLowerCase() === me;
  if (row.status === 0) {
    if (isClient) {
      return accepted
        ? { text: "The contractor accepted. Fund it to start.", action: true }
        : { text: "Waiting for the contractor to accept.", action: false };
    }
    return accepted
      ? { text: "You accepted. Waiting for the client to fund it.", action: false }
      : { text: "Needs your acceptance.", action: true };
  }
  if (row.status === 1) {
    return { text: "Active. Open it to submit, approve or dispute milestones.", action: false };
  }
return { text: row.status === 2 ? "Cancelled." : "Completed.", action: false };
}

export default function DashboardPage() {
  const { ready, authenticated, address, publicClient } = useSafePayWallet();
  const tokenConfig = useTokenConfig();
  const [rows, setRows] = useState<Row[]>([]);
  const [acceptedIds, setAcceptedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const configError =
    !contractAddress || !isAddress(contractAddress) || /^0x0+$/.test(contractAddress)
      ? "Set NEXT_PUBLIC_SAFE_PAY_ESCROW_ADDRESS before viewing the dashboard."
      : null;
  const me = address?.toLowerCase() ?? "";

  useEffect(() => {
    if (configError || !contractAddress || !address) return;
    const escrow = contractAddress;
    const mine = address.toLowerCase();
    let active = true;

    const load = async () => {
      try {
        const count = Number(
          await publicClient.readContract({ address: escrow, abi: safePayEscrowAbi, functionName: "agreementCount" }),
        );
        const first = Math.max(1, count - MAX_AGREEMENTS + 1);
        const ids = Array.from({ length: Math.max(0, count - first + 1) }, (_, index) => first + index);

        const all = await Promise.all(
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

                const candidates = all
          .filter((row) => row.client.toLowerCase() === mine || row.contractor.toLowerCase() === mine)
          .reverse();

        let accepted = new Set<number>();
        let closedIds = new Set<number>();
        const draftIds = candidates.filter((row) => row.status === 0).map((row) => row.id);
        if (draftIds.length > 0) {
          const [acceptedResponse, closureResponse] = await Promise.all([
            fetch(`/api/acceptance?ids=${draftIds.join(",")}`, { cache: "no-store" }),
            fetch(`/api/agreement-closure?ids=${draftIds.join(",")}`, { cache: "no-store" }),
          ]);
          if (acceptedResponse.ok) {
            const body = (await acceptedResponse.json()) as { accepted?: Record<string, unknown> };
            accepted = new Set(Object.keys(body.accepted ?? {}).map(Number));
          }
          if (closureResponse.ok) {
            const body = (await closureResponse.json()) as { closed?: Record<string, string> };
            closedIds = new Set(Object.keys(body.closed ?? {}).map(Number));
          }
        }
        const own = candidates.filter((row) => !closedIds.has(row.id));

        if (!active) return;
        setRows(own);
        setAcceptedIds(accepted);
        setError(null);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load your agreements.");
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
  }, [address, configError, publicClient]);

  const amount = (value: bigint) =>
    tokenConfig.status === "ready" ? formatTokenDisplay(value, tokenConfig.metadata) : "—";

  if (!ready) {
    return <main className="flex-1 bg-slate-950 p-10 text-slate-300">Loading…</main>;
  }

  if (!authenticated) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-950 px-6 py-10">
        <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 text-slate-50">
          <h1 className="text-2xl font-semibold">My agreements</h1>
          <p className="mt-3 text-slate-300">Sign in to see agreements you created or were invited to.</p>
          <RoleSignInLink className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500">
            Sign in
          </RoleSignInLink>
        </div>
      </main>
    );
  }

  const described = rows.map((row) => ({ row, info: describeRow(row, me, acceptedIds.has(row.id)) }));
  const needsAction = described.filter((item) => item.info.action);

  const card = ({ row, info }: (typeof described)[number]) => {
    const isClient = row.client.toLowerCase() === me;
    return (
      <li key={row.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">Agreement #{row.id}</p>
            <p className="text-sm text-slate-400">{isClient ? "You are paying" : "You are getting paid"}</p>
          </div>
          <p className="text-lg font-semibold">{amount(row.totalAmount)}</p>
        </div>
        <p className={`mt-3 text-sm ${info.action ? "text-amber-200" : "text-slate-300"}`}>{info.text}</p>
        <p className="mt-1 break-all text-xs text-slate-500">
          {isClient ? `Contractor: ${row.contractor}` : `Client: ${row.client}`}
        </p>
        <Link
          href={`/agreement/${row.id}`}
          className="mt-4 inline-block rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500"
        >
          Open
        </Link>
      </li>
    );
  };

  return (
    <main className="flex-1 bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-400">SafePay</p>
            <h1 className="mt-2 text-3xl font-semibold">My agreements</h1>
          </div>
          <Link href="/create" className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500">
            Create SafePay
          </Link>
        </div>

        {configError || error ? (
          <p role="alert" className="rounded-xl border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
            {configError ?? error}
          </p>
        ) : null}
        {loading && !configError ? <p className="text-slate-400">Loading your agreements…</p> : null}

        {needsAction.length > 0 ? (
          <section>
            <h2 className="text-lg font-semibold text-amber-200">Needs your action ({needsAction.length})</h2>
            <ul className="mt-3 grid gap-4 md:grid-cols-2">{needsAction.map(card)}</ul>
          </section>
        ) : null}

        <section>
          <h2 className="text-lg font-semibold">All my agreements</h2>
          {!loading && !error && described.length === 0 ? (
            <p className="mt-3 text-slate-400">
              No agreements yet. Create one, or ask someone to send you a SafePay link.
            </p>
          ) : null}
          <ul className="mt-3 grid gap-4 md:grid-cols-2">{described.map(card)}</ul>
        </section>

        <p className="text-xs text-slate-500">Showing your latest {MAX_AGREEMENTS} agreements.</p>
      </div>
    </main>
  );
}