"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { profileInputSchema, type FreelancerProfile } from "@/lib/profiles-schema";
import { submitSigned } from "@/lib/projects-client";
import { serviceCategories } from "@/lib/services-schema";
import { RoleSignInLink } from "@/lib/wallet/role-sign-in-link";
import { useSafePayWallet } from "@/lib/wallet/useSafePayWallet";

export default function FreelancerProfilePage() {
  const wallet = useSafePayWallet();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState("");
  const [category, setCategory] = useState<string>(serviceCategories[0]);
  const [country, setCountry] = useState("");
  const [experience, setExperience] = useState("");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const me = wallet.address?.toLowerCase();

  useEffect(() => {
    if (!me) return;
    let active = true;
    fetch("/api/profiles", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { profiles?: FreelancerProfile[] };
        const mine = body.profiles?.find((profile) => profile.address === me && !profile.isDemo);
        if (!active || !mine) return;
        setDisplayName(mine.displayName);
        setHeadline(mine.headline);
        setBio(mine.bio);
        setSkills(mine.skills.join(", "));
        setCategory(mine.category);
        setCountry(mine.country);
        setExperience(String(mine.experienceYears));
        setRate(String(mine.hourlyRateUsd));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [me]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!wallet.address || !wallet.walletClient) {
      setError("Your wallet is not ready yet. Please try again.");
      return;
    }
    const parsed = profileInputSchema.safeParse({
      displayName,
      headline,
      bio,
      skills: skills.split(",").map((skill) => skill.trim()).filter(Boolean),
      category,
      country,
      experienceYears: experience === "" ? Number.NaN : Number(experience),
      hourlyRateUsd: Number(rate),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    setBusy(true);
    try {
      await submitSigned<{ profile: FreelancerProfile }>({
        action: "save_profile",
        endpoint: "/api/profiles",
        address: wallet.address,
        walletClient: wallet.walletClient,
        payload: parsed.data,
      });
      router.push("/services");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your profile.");
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
          <h1 className="text-2xl font-semibold">Create your freelancer profile</h1>
          <p className="mt-3 text-slate-300">
            Sign up as someone who gets paid, so clients can find and hire you.
          </p>
          <RoleSignInLink className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-teal-700 px-4 py-3 font-semibold hover:bg-teal-600">
            Sign in or sign up
          </RoleSignInLink>
        </div>
      </main>
    );
  }

  const field = "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white";

  return (
    <main className="flex-1 bg-slate-950 px-6 py-10 text-slate-50">
      <form onSubmit={(event) => void onSubmit(event)} className="mx-auto max-w-2xl space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-8">
        <h1 className="text-2xl font-semibold">Your freelancer profile</h1>
        <p className="text-sm text-slate-400">
          Clients see this on Find freelancer. Payments go to this account&apos;s wallet:
          <span className="mt-1 block break-all text-xs text-slate-500">{wallet.address}</span>
        </p>
        <label className="block text-sm text-slate-300">
          Your name
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={field} />
        </label>
        <label className="block text-sm text-slate-300">
          Headline
          <input value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="Full-stack web developer" className={field} />
        </label>
        <label className="block text-sm text-slate-300">
          About you
          <textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={5} className={field} />
        </label>
        <label className="block text-sm text-slate-300">
          Skills (separate with commas)
          <input value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="React, Next.js, Node.js" className={field} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-slate-300">
            Domain
            <select value={category} onChange={(event) => setCategory(event.target.value)} className={field}>
              {serviceCategories.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-slate-300">
            Country
            <input value={country} onChange={(event) => setCountry(event.target.value)} className={field} />
          </label>
          <label className="block text-sm text-slate-300">
            Years of experience
            <input value={experience} onChange={(event) => setExperience(event.target.value)} type="number" min="0" max="60" step="1" className={field} />
          </label>
          <label className="block text-sm text-slate-300">
            Rate (USD per hour)
            <input value={rate} onChange={(event) => setRate(event.target.value)} type="number" min="1" step="0.01" className={field} />
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
          {busy ? "Waiting for your signature…" : "Sign and save profile"}
        </button>
        <p className="text-xs text-slate-500">Signing proves the profile is yours. It does not move any money.</p>
      </form>
    </main>
  );
}