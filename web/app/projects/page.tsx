"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import {
  convertUsdToDisplayCurrency,
  formatDisplayCurrency,
  type DisplayCurrency,
} from "@/lib/currency";
import type { Project } from "@/lib/projects-schema";
import { serviceCategories } from "@/lib/services-schema";
import { useSafePayWallet } from "@/lib/wallet/useSafePayWallet";

import { CurrencySelector, FxRateNotice, useFxRate } from "../currency-selector";

export default function ProjectsPage() {
  const wallet = useSafePayWallet();
  const [currency, setCurrency] = useState<DisplayCurrency>("USD");
  const fx = useFxRate(currency);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [country, setCountry] = useState("");
  const [applied, setApplied] = useState({ search: "", category: "", country: "" });
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams();
    if (applied.search) query.set("search", applied.search);
    if (applied.category) query.set("category", applied.category);
    if (applied.country) query.set("country", applied.country);
    fetch(`/api/projects?${query.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { projects?: Project[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Could not load projects.");
        if (active) {
          setProjects(body.projects ?? []);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load projects.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applied]);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setApplied({ search: search.trim(), category, country: country.trim() });
  };

  const price = (usd: number) =>
    fx.status === "ready"
      ? `${formatDisplayCurrency(convertUsdToDisplayCurrency(usd, fx.data.rate), currency)} (≈ $${usd.toLocaleString("en-US")})`
      : `$${usd.toLocaleString("en-US")}`;

  return (
    <main className="flex-1 bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-teal-400">Find work</p>
            <h1 className="mt-2 text-3xl font-semibold">Projects from clients worldwide</h1>
            <p className="mt-2 text-sm text-slate-400">
              Apply with your price, then get paid safely through a SafePay agreement.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/projects/new" className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500">
              Post a project
            </Link>
          </div>
        </div>

        <form onSubmit={onSearch} className="mt-6 grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-[2fr_1fr_1fr_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search projects"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            <option value="">All categories</option>
            {serviceCategories.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <input
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            placeholder="Country"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
          <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 font-semibold hover:bg-teal-600">
            Search
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <CurrencySelector value={currency} onChange={setCurrency} />
          <div className="min-w-0 flex-1">
            <FxRateNotice state={fx} currency={currency} />
          </div>
        </div>

        {error ? (
          <p role="alert" className="mt-6 rounded-xl border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>
        ) : null}
        {loading ? <p className="mt-6 text-slate-400">Loading projects…</p> : null}
        {!loading && !error && projects.length === 0 ? (
          <p className="mt-6 text-slate-400">No projects match your search.</p>
        ) : null}

        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{project.title}</h2>
                {project.isDemo ? (
                  <span className="shrink-0 rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-200">Demo</span>
                ) : null}
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-slate-400">{project.description}</p>
              <p className="mt-3 text-sm text-slate-300">
                {project.category} · {project.country} · {project.deadlineDays} days
              </p>
              <p className="mt-1 text-sm font-semibold text-white">Budget: {price(project.budgetUsd)}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-slate-400">{project.applicationCount} applications</span>
                <Link href={`/projects/${project.id}`} className="text-sm font-semibold text-teal-300 hover:text-teal-200">
                  View and apply
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}