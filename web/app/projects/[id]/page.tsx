"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import {
  convertUsdToDisplayCurrency,
  formatDisplayCurrency,
  type DisplayCurrency,
} from "@/lib/currency";
import { submitSigned } from "@/lib/projects-client";
import {
  applicationInputSchema,
  type Project,
  type ProjectApplication,
} from "@/lib/projects-schema";
import { RoleSignInLink } from "@/lib/wallet/role-sign-in-link";
import { useSafePayWallet } from "@/lib/wallet/useSafePayWallet";

import { CurrencySelector, FxRateNotice, useFxRate } from "../../currency-selector";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id ?? "";
  const wallet = useSafePayWallet();
  const [currency, setCurrency] = useState<DisplayCurrency>("USD");
  const fx = useFxRate(currency);
  const [project, setProject] = useState<Project | null>(null);
  const [applications, setApplications] = useState<ProjectApplication[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState("");
  const [price, setPrice] = useState("");
  const [days, setDays] = useState("14");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    fetch(`/api/projects/${projectId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as {
          project?: Project;
          applications?: ProjectApplication[];
          error?: string;
        };
        if (!response.ok || !body.project) throw new Error(body.error ?? "Could not load this project.");
        if (active) {
          setProject(body.project);
          setApplications(body.applications ?? []);
          setLoadError(null);
        }
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(cause instanceof Error ? cause.message : "Could not load this project.");
      });
    return () => {
      active = false;
    };
  }, [projectId, tick]);

  const show = (usd: number) =>
    fx.status === "ready"
      ? `${formatDisplayCurrency(convertUsdToDisplayCurrency(usd, fx.data.rate), currency)} (≈ $${usd.toLocaleString("en-US")})`
      : `$${usd.toLocaleString("en-US")}`;

  const me = wallet.address?.toLowerCase();
  const isOwner = Boolean(project && me && project.ownerAddress === me);
  const alreadyApplied = applications.some((application) => application.applicantAddress === me);

  const onApply = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!wallet.address || !wallet.walletClient) {
      setError("Your wallet is not ready yet. Please try again.");
      return;
    }
    const parsed = applicationInputSchema.safeParse({
      projectId,
      message,
      proposedPriceUsd: Number(price),
      deliveryDays: Number(days),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    setBusy(true);
    try {
      await submitSigned({
        action: "apply",
        endpoint: "/api/projects/apply",
        address: wallet.address,
        walletClient: wallet.walletClient,
        payload: parsed.data,
      });
      setMessage("");
      setPrice("");
      setTick((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send your application.");
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <main className="flex-1 bg-slate-950 px-6 py-10 text-slate-50">
        <p role="alert" className="mx-auto max-w-3xl rounded-xl border border-red-500/40 bg-red-950/50 p-4 text-sm text-red-200">
          {loadError}
        </p>
      </main>
    );
  }
  if (!project) {
    return <main className="flex-1 bg-slate-950 p-10 text-slate-300">Loading project…</main>;
  }

  const field = "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white";

  return (
    <main className="flex-1 bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/projects" className="text-sm text-teal-300 hover:text-teal-200">← All projects</Link>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold">{project.title}</h1>
            {project.isDemo ? (
              <span className="shrink-0 rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-200">Demo</span>
            ) : null}
          </div>
          <p className="mt-3 whitespace-pre-line text-slate-300">{project.description}</p>
          <p className="mt-4 text-sm text-slate-300">
            {project.category} · {project.country} · {project.deadlineDays} days
          </p>
          <p className="mt-1 font-semibold">Budget: {show(project.budgetUsd)}</p>
          <p className="mt-2 break-all text-xs text-slate-500">Posted by {project.ownerAddress}</p>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <CurrencySelector value={currency} onChange={setCurrency} />
            <div className="min-w-0 flex-1">
              <FxRateNotice state={fx} currency={currency} />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold">Applications ({applications.length})</h2>
          {applications.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">No applications yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {applications.map((application) => (
                <li key={application.id} className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                  <p className="break-all text-xs text-slate-400">{application.applicantAddress}</p>
                  <p className="mt-2 text-sm text-slate-200">{application.message}</p>
                  <p className="mt-2 text-sm font-semibold">
                    {show(application.proposedPriceUsd)} · {application.deliveryDays} days
                  </p>
                  {isOwner ? (
                    <Link
                      href={`/create?provider=${application.applicantAddress}&title=${encodeURIComponent(project.title)}&listing=${encodeURIComponent(project.title)}`}
                      className="mt-3 inline-block rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold hover:bg-violet-500"
                    >
                      Create SafePay with this freelancer
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {isOwner && applications.length > 0 ? (
            <p className="mt-4 text-xs text-slate-500">
              On the next screen, enter the agreed amount and milestones. The proposed price above is for reference.
            </p>
          ) : null}
        </section>

        {!wallet.ready ? null : !wallet.authenticated ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-slate-300">Sign in with an account for getting paid to apply for this project.</p>
            <RoleSignInLink className="mt-4 inline-flex rounded-xl bg-teal-700 px-4 py-2 font-semibold hover:bg-teal-600">
              Sign in to apply
            </RoleSignInLink>
          </section>
        ) : isOwner ? null : wallet.role !== "freelancer" ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
            Applying needs an account for getting paid. Log out, then sign in with &quot;I want to get paid&quot;.
          </section>
        ) : alreadyApplied ? (
          <section className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-sm text-emerald-100">
            You applied to this project. The client will contact you through a SafePay agreement.
          </section>
        ) : (
          <form onSubmit={(event) => void onApply(event)} className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold">Apply to this project</h2>
            <p className="text-xs text-slate-400">Applications are public. Don&apos;t include private contact details.</p>
            <label className="block text-sm text-slate-300">
              Your message
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} className={field} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-slate-300">
                Your price (USD)
                <input value={price} onChange={(event) => setPrice(event.target.value)} type="number" min="1" step="0.01" className={field} />
              </label>
              <label className="block text-sm text-slate-300">
                Delivery (days)
                <input value={days} onChange={(event) => setDays(event.target.value)} type="number" min="1" max="365" className={field} />
              </label>
            </div>
            {error ? (
              <p role="alert" className="rounded-lg border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold hover:bg-teal-600 disabled:opacity-50"
            >
              {busy ? "Waiting for your signature…" : "Sign and apply"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}