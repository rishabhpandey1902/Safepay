"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import {
  convertUsdToDisplayCurrency,
  formatDisplayCurrency,
  type DisplayCurrency,
} from "@/lib/currency";
import type { FreelancerProfile } from "@/lib/profiles-schema";
import { serviceCategories } from "@/lib/services-schema";
import { useSafePayWallet } from "@/lib/wallet/useSafePayWallet";

import { CurrencySelector, FxRateNotice, useFxRate } from "../currency-selector";

type Filters = { search: string; category: string; country: string; minExperience: string };
const emptyFilters: Filters = { search: "", category: "", country: "", minExperience: "" };

const experienceOptions = [
  { value: "", label: "Any experience" },
  { value: "1", label: "1+ years" },
  { value: "3", label: "3+ years" },
  { value: "5", label: "5+ years" },
  { value: "10", label: "10+ years" },
];

export default function FindFreelancerPage() {
  const wallet = useSafePayWallet();
  const [currency, setCurrency] = useState<DisplayCurrency>("USD");
  const fx = useFxRate(currency);
  const [form, setForm] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [profiles, setProfiles] = useState<FreelancerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams();
    if (applied.search) query.set("search", applied.search);
    if (applied.category) query.set("category", applied.category);
    if (applied.country) query.set("country", applied.country);
    if (applied.minExperience) query.set("minExperience", applied.minExperience);
    fetch(`/api/profiles?${query.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { profiles?: FreelancerProfile[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Could not load freelancers.");
        if (active) {
          setProfiles(body.profiles ?? []);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load freelancers.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applied]);

  const update = (key: keyof Filters, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setApplied({ ...form, search: form.search.trim(), country: form.country.trim() });
  };

  const onReset = () => {
    setForm(emptyFilters);
    setLoading(true);
    setApplied(emptyFilters);
  };

  const me = wallet.address?.toLowerCase();

  const rate = (usd: number) =>
    fx.status === "ready"
      ? `${formatDisplayCurrency(convertUsdToDisplayCurrency(usd, fx.data.rate), currency)} per hour (≈ $${usd.toLocaleString("en-US")})`
      : `$${usd.toLocaleString("en-US")} per hour`;

  const input = "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white";

  return (
    <main className="flex-1 bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-teal-400">Find freelancer</p>
            <h1 className="mt-2 text-3xl font-semibold">Freelancers from around the world</h1>
            <p className="mt-2 text-sm text-slate-400">
              Pick someone, then pay safely through a SafePay agreement released by milestones.
            </p>
          </div>
          {wallet.authenticated && wallet.role !== "freelancer" ? null : (
            <Link href="/services/new" className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold hover:bg-teal-600">
              Create or edit my freelancer profile
            </Link>
          )}
        </div>

        <form onSubmit={onSearch} className="mt-6 grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs text-slate-400 lg:col-span-2">
            Name or skill
            <input
              value={form.search}
              onChange={(event) => update("search", event.target.value)}
              placeholder="Search by name or skill"
              className={`mt-1 w-full ${input}`}
            />
          </label>
          <label className="text-xs text-slate-400">
            Domain
            <select
              value={form.category}
              onChange={(event) => update("category", event.target.value)}
              className={`mt-1 w-full ${input}`}
            >
              <option value="">All domains</option>
              {serviceCategories.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Country
            <input
              value={form.country}
              onChange={(event) => update("country", event.target.value)}
              placeholder="Any country"
              className={`mt-1 w-full ${input}`}
            />
          </label>
          <label className="text-xs text-slate-400">
            Experience
            <select
              value={form.minExperience}
              onChange={(event) => update("minExperience", event.target.value)}
              className={`mt-1 w-full ${input}`}
            >
              {experienceOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
            <button type="submit" className="rounded-lg bg-teal-700 px-5 py-2 font-semibold hover:bg-teal-600">
              Search
            </button>
            <button
              type="button"
              onClick={onReset}
              className="rounded-lg border border-slate-700 px-5 py-2 font-semibold text-slate-200 hover:border-slate-500"
            >
              Reset filters
            </button>
          </div>
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
        {loading ? <p className="mt-6 text-slate-400">Loading freelancers…</p> : null}
        {!loading && !error ? (
          <p className="mt-6 text-sm text-slate-400">
            {profiles.length === 0 ? "No freelancers match your filters." : `${profiles.length} freelancer${profiles.length === 1 ? "" : "s"} found`}
          </p>
        ) : null}

        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {profiles.map((profile) => {
            const isMine = profile.address === me;
            const hireHref = `/create?provider=${profile.address}&title=${encodeURIComponent(`Work with ${profile.displayName}`)}&listing=${encodeURIComponent(profile.headline)}`;
            return (
              <li key={profile.address} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{profile.displayName}</h2>
                    <p className="text-sm text-teal-200">{profile.headline}</p>
                  </div>
                  {profile.isDemo ? (
                    <span className="shrink-0 rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-200">Demo</span>
                  ) : null}
                </div>
                <p className="mt-3 line-clamp-3 text-sm text-slate-400">{profile.bio}</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {profile.skills.map((skill) => (
                    <li key={skill} className="rounded-full border border-slate-700 px-2.5 py-0.5 text-xs text-slate-300">{skill}</li>
                  ))}
                </ul>
                <p className="mt-3 text-sm text-slate-300">
                  {profile.category} · {profile.country} · {profile.experienceYears} {profile.experienceYears === 1 ? "year" : "years"} experience
                </p>
                <p className="mt-1 text-sm font-semibold text-white">{rate(profile.hourlyRateUsd)}</p>
                <div className="mt-4">
                  {profile.isDemo ? (
                    <p className="text-xs text-slate-500">Demo profile: it can&apos;t be hired.</p>
                  ) : isMine ? (
                    <Link href="/services/new" className="text-sm font-semibold text-teal-300 hover:text-teal-200">This is your profile · Edit</Link>
                  ) : (
                    <Link href={hireHref} className="inline-block rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500">
                      Hire with SafePay
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}