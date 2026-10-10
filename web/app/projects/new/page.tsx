"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { projectInputSchema, type Project } from "@/lib/projects-schema";
import { submitSigned } from "@/lib/projects-client";
import { serviceCategories } from "@/lib/services-schema";
import { RoleSignInLink } from "@/lib/wallet/role-sign-in-link";
import { useSafePayWallet } from "@/lib/wallet/useSafePayWallet";

export default function NewProjectPage() {
  const wallet = useSafePayWallet();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(serviceCategories[0]);
  const [country, setCountry] = useState("");
  const [budget, setBudget] = useState("");
  const [days, setDays] = useState("14");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!wallet.address || !wallet.walletClient) {
      setError("Your wallet is not ready yet. Please try again.");
      return;
    }
    const parsed = projectInputSchema.safeParse({
      title,
      description,
      category,
      country,
      budgetUsd: Number(budget),
      deadlineDays: Number(days),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    setBusy(true);
    try {
      const body = await submitSigned<{ project: Project }>({
        action: "create_project",
        endpoint: "/api/projects",
        address: wallet.address,
        walletClient: wallet.walletClient,
        payload: parsed.data,
      });
      router.push(`/projects/${body.project.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not post the project.");
    } finally {
      setBusy(false);
    }
  };

  if (!wallet.ready) {
    return <main className="flex-1 bg-slate-950 p-10 text-slate-300">Loading…</main>;
  }

  if (!wallet.authenticated) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-950 px-6 py-10">
        <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 text-slate-50">
          <h1 className="text-2xl font-semibold">Post a project</h1>
          <p className="mt-3 text-slate-300">
            Sign in as someone who pays to post a project and choose a freelancer.
          </p>
          <RoleSignInLink className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500">
            Sign in
          </RoleSignInLink>
        </div>
      </main>
    );
  }

  const field = "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white";

  return (
    <main className="flex-1 bg-slate-950 px-6 py-10 text-slate-50">
      <form onSubmit={(event) => void onSubmit(event)} className="mx-auto max-w-2xl space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-8">
        <h1 className="text-2xl font-semibold">Post a project</h1>
        <p className="text-sm text-slate-400">
          Freelancers apply with a price. When you pick one, SafePay opens a protected agreement for the work.
          Applications on your project are public.
        </p>
        <label className="block text-sm text-slate-300">
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} className={field} />
        </label>
        <label className="block text-sm text-slate-300">
          Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} className={field} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-slate-300">
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value)} className={field}>
              {serviceCategories.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-slate-300">
            Your country
            <input value={country} onChange={(event) => setCountry(event.target.value)} className={field} />
          </label>
          <label className="block text-sm text-slate-300">
            Budget (USD)
            <input value={budget} onChange={(event) => setBudget(event.target.value)} type="number" min="1" step="0.01" className={field} />
          </label>
          <label className="block text-sm text-slate-300">
            Deadline (days)
            <input value={days} onChange={(event) => setDays(event.target.value)} type="number" min="1" max="365" className={field} />
          </label>
        </div>
        {error ? (
          <p role="alert" className="rounded-lg border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500 disabled:opacity-50"
        >
          {busy ? "Waiting for your signature…" : "Sign and post project"}
        </button>
        <p className="text-xs text-slate-500">Signing proves the post is yours. It does not move any money.</p>
      </form>
    </main>
  );
}