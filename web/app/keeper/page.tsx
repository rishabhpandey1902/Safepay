"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Condition = { field_source?: string; field?: string; operator?: string; value?: string | string[] };
type Rule = { name: string; method: string; action: string; conditions: Condition[] };
type KeeperData = {
  configured?: boolean;
  message?: string;
  error?: string;
  address?: string;
  balanceMon?: string;
  policies?: { id: string; name: string; rules: Rule[] }[];
  releases?: { agreementId: number; milestoneIndex: number; txHash: string; createdAt: string }[];
};

export default function KeeperPage() {
  const [data, setData] = useState<KeeperData | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/keeper", { cache: "no-store" })
        .then((response) => response.json() as Promise<KeeperData>)
        .then((body) => {
          if (active) setData(body);
        })
        .catch(() => {
          if (active) setData({ error: "Could not reach the keeper service." });
        });
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <main className="flex-1 bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-400">SafePay keeper</p>
          <h1 className="mt-2 text-3xl font-semibold">Automatic releases</h1>
          <p className="mt-2 text-sm text-slate-400">
            If a client does not respond before the approval window ends, the contractor is still paid. The
            keeper is a Privy server wallet protected by a policy. It sends the release once the deadline has
            passed. The contract also enforces the deadline, and the keeper cannot move funds any other way.The policy limits the keeper to calls to the SafePay contract, and the contract itself only pays out after the deadline.
          </p>
        </div>

        {!data ? <p className="text-slate-400">Loading…</p> : null}
        {data?.error ? (
          <p role="alert" className="rounded-xl border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">{data.error}</p>
        ) : null}
        {data && data.configured === false ? (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">{data.message}</p>
        ) : null}

        {data?.configured ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Keeper wallet (Privy)</p>
            <p className="mt-2 break-all text-sm text-white">{data.address}</p>
            <p className="mt-1 text-sm text-slate-300">Gas balance: {Number(data.balanceMon ?? 0).toFixed(4)} MON</p>
          </section>
        ) : null}

        {data?.configured ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold">Policy attached to the keeper</h2>
            {data.policies && data.policies.length > 0 ? (
              data.policies.map((policy) => (
                <div key={policy.id} className="mt-3 space-y-2">
                  <p className="text-sm text-slate-200">{policy.name}</p>
                  {policy.rules.map((rule, index) => (
                    <div key={`${rule.name}-${index}`} className="rounded-lg border border-slate-800 p-3">
                      <p className="text-sm font-medium text-slate-100">{rule.name}</p>
                      <p className="text-xs text-slate-400">{rule.action} · {rule.method}</p>
                      {rule.conditions.map((condition, conditionIndex) => (
                        <p key={conditionIndex} className="mt-1 break-all text-xs text-slate-400">
                          {condition.field_source}.{condition.field} {condition.operator} {JSON.stringify(condition.value)}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <p className="mt-2 text-sm text-amber-200">No policy is attached to the keeper wallet yet. Attach one in the Privy dashboard.</p>
            )}
            <p className="mt-3 text-xs text-slate-500">Rules are read live from Privy.</p>
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="font-semibold">Releases made by the keeper</h2>
          {data?.releases && data.releases.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {data.releases.map((release) => (
                <li key={release.txHash} className="text-sm text-slate-300">
                  <Link href={`/agreement/${release.agreementId}`} className="text-violet-300 hover:text-violet-200">
                    Agreement #{release.agreementId}, milestone {release.milestoneIndex + 1}
                  </Link>{" "}
                  ·{" "}
                  <a
                    href={`https://testnet.monadexplorer.com/tx/${release.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-violet-300 hover:text-violet-200"
                  >
                    {release.txHash.slice(0, 10)}…{release.txHash.slice(-6)}
                  </a>{" "}
                  · {new Date(release.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-400">No automatic releases yet.</p>
          )}
        </section>
      </div>
    </main>
  );
}