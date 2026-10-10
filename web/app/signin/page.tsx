"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { displayCurrencies, type DisplayCurrency } from "@/lib/currency";
import { useSafePayWallet } from "@/lib/wallet/useSafePayWallet";

type Mode = "signin" | "signup";
type Profile = { name: string; country: string; currency: DisplayCurrency };

const profileKey = (address: string) => `safepay-profile:${address.toLowerCase()}`;

function readProfile(address?: string): Profile | null {
  if (!address || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(profileKey(address));
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

const defaultCurrency: DisplayCurrency = (displayCurrencies as readonly string[]).includes("INR")
  ? ("INR" as DisplayCurrency)
  : displayCurrencies[0];

export default function SignIn() {
  const wallet = useSafePayWallet();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [modeReady, setModeReady] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState<DisplayCurrency>(defaultCurrency);

  const configured = wallet.provider === "privy"
    ? Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID)
    : wallet.provider === "dynamic"
      ? Boolean(process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID)
      : true;

  // The URL decides the mode. It survives the provider switch that remounts this page.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("mode");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(fromUrl === "signup" ? "signup" : "signin");
    setModeReady(true);
  }, []);

  const chooseMode = (next: Mode) => {
    setMode(next);
    window.history.replaceState(null, "", `/signin?mode=${next}`);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  savedAt;
  const profile = wallet.authenticated ? readProfile(wallet.address) : null;
  const needsOnboarding = modeReady && mode === "signup" && wallet.authenticated && Boolean(wallet.address) && !profile;

  const goNext = () => {
    const returnTo = window.sessionStorage.getItem("safepay-return-to");
    window.sessionStorage.removeItem("safepay-return-to");
    if (returnTo && !returnTo.startsWith("/signin") && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
      router.replace(returnTo);
      return;
    }
    router.replace(wallet.role === "freelancer" ? "/dashboard" : "/create");
  };

  // Returning users go straight back to what they were doing.
  useEffect(() => {
    if (!modeReady || !wallet.authenticated || needsOnboarding) return;
    const returnTo = window.sessionStorage.getItem("safepay-return-to");
    if (!returnTo) return;
    if (mode === "signup" && !profile) return;
    goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeReady, wallet.authenticated, needsOnboarding]);

  const handleLogin = async () => {
    setError(null);
    setBusy(true);
    try {
      if (wallet.provider === "privy") {
        if (!wallet.login) throw new Error("Sign-in is still starting. Try again in a moment.");
        await wallet.login();
      } else {
        if (!wallet.sendLoginCode) throw new Error("Sign-in is still starting. Try again in a moment.");
        await wallet.sendLoginCode(email);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setError(null);
    setBusy(true);
    try {
      if (!wallet.verifyLoginCode) throw new Error("Sign-in is still starting. Try again in a moment.");
      await wallet.verifyLoginCode(code);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify the email code.");
    } finally {
      setBusy(false);
    }
  };

  const handleOnboarding = (event: FormEvent) => {
    event.preventDefault();
    if (!wallet.address) return;
    if (name.trim().length < 2 || country.trim().length < 2) {
      setError("Enter your name and country.");
      return;
    }
    const nextProfile: Profile = { name: name.trim(), country: country.trim(), currency };
    try {
      window.localStorage.setItem(profileKey(wallet.address), JSON.stringify(nextProfile));
    } catch {
      setError("Could not save your profile in this browser.");
      return;
    }
    setError(null);
    setSavedAt(Date.now());
    goNext();
  };

  const heading = mode === "signup" ? "Create your account" : "Welcome back";
  const secured = wallet.provider === "privy" ? "Secured by Privy" : "Secured by Dynamic";

  return (
    <main className="flex flex-1 items-center justify-center bg-slate-950 px-6 py-10">
      <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8 text-slate-50 shadow-2xl shadow-violet-950/20">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-400">SafePay</p>
        <h1 className="mt-4 text-3xl font-semibold">{heading}</h1>

        {!wallet.role ? (
          <section className="mt-6">
            <div className="grid grid-cols-2 rounded-xl border border-slate-700 bg-slate-950 p-1" role="tablist">
              {(["signin", "signup"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={mode === option}
                  onClick={() => chooseMode(option)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                    mode === option ? "bg-violet-600 text-white" : "text-slate-300 hover:text-white"
                  }`}
                >
                  {option === "signin" ? "Sign in" : "Sign up"}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {mode === "signup"
                ? "New here? Choose what you want to do first. We'll set up your wallet and a short profile."
                : "Signing in with an email that has no account creates one. Use Sign up if you're new, so you can set up your profile."}
            </p>

            <h2 className="mt-6 text-lg font-semibold">What do you want to do?</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => wallet.selectRole("client")}
                className="rounded-xl bg-violet-600 px-4 py-4 text-left font-semibold hover:bg-violet-500"
              >
                I want to pay someone
                <span className="mt-1 block text-sm font-normal text-violet-100">
                  Fund agreements and approve milestones.
                </span>
              </button>
              <button
                type="button"
                onClick={() => wallet.selectRole("freelancer")}
                className="rounded-xl bg-teal-700 px-4 py-4 text-left font-semibold hover:bg-teal-600"
              >
                I want to get paid
                <span className="mt-1 block text-sm font-normal text-teal-100">
                  Accept agreements, submit work, offer services.
                </span>
              </button>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Paying and getting paid use separate accounts, so use the same choice each time you come back.
            </p>
          </section>
        ) : wallet.authenticated ? (
          needsOnboarding ? (
            <form onSubmit={handleOnboarding} className="mt-6 space-y-4">
              <p className="text-slate-300">
                One last step. This helps us show prices in your currency.
              </p>
              <label className="block text-sm text-slate-300">
                Your name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm text-slate-300">
                Country
                <input
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  autoComplete="country-name"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </label>
              <label className="block text-sm text-slate-300">
                Show prices in
                <select
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value as DisplayCurrency)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                >
                  {displayCurrencies.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              {error ? (
                <p role="alert" className="rounded-lg border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>
              ) : null}
              <button type="submit" className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500">
                Finish and continue
              </button>
            </form>
          ) : (
            <section className="mt-6 space-y-4">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
                  {wallet.role === "client" ? "Paying account" : "Getting-paid account"}
                </p>
                {profile ? <p className="mt-2 text-base text-white">{profile.name}</p> : null}
                <p className="mt-1 break-all text-sm text-slate-200">{wallet.address ?? "Wallet initializing…"}</p>
                <p className="mt-1 text-sm text-slate-300">
                  {wallet.chainName} {wallet.chainId ? `(chain ${wallet.chainId})` : "(switching wallet network…)"}
                </p>
              </div>
              {wallet.error ? (
                <p role="alert" className="rounded-xl border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">{wallet.error}</p>
              ) : null}
              <nav className="grid gap-3 sm:grid-cols-2">
                <Link href="/dashboard" className="rounded-xl bg-violet-600 px-4 py-3 text-center font-semibold hover:bg-violet-500">
                  My agreements
                </Link>
                <Link href="/create" className="rounded-xl border border-violet-500/50 bg-violet-500/10 px-4 py-3 text-center font-semibold text-violet-200 hover:bg-violet-500/20">
                  Create SafePay
                </Link>
                <Link href="/services" className="rounded-xl border border-teal-500/50 bg-teal-500/10 px-4 py-3 text-center font-semibold text-teal-200 hover:bg-teal-500/20">
                  Find freelancer
                </Link>
                {wallet.role === "freelancer" ? (
                  <Link href="/services/new" className="rounded-xl border border-teal-500/50 px-4 py-3 text-center font-semibold text-teal-200 hover:bg-teal-500/10">
                    Offer a service
                  </Link>
                ) : null}
              </nav>
              <button
                type="button"
                onClick={() => void wallet.logout()}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-semibold hover:border-slate-500"
              >
                Log out
              </button>
            </section>
          )
        ) : !configured ? (
          <section className="mt-6 rounded-xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200">
            {wallet.provider === "privy"
              ? "Set NEXT_PUBLIC_PRIVY_APP_ID to enable sign-in for paying accounts."
              : "Set NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID to enable sign-in for getting-paid accounts."}
            <button type="button" onClick={wallet.clearRole} className="ml-3 underline">Go back</button>
          </section>
        ) : (
          <section className="mt-6 space-y-4">
            <p className="text-slate-300">
              {mode === "signup" ? "Sign up with your email." : "Sign in with your email."}
            </p>
            {wallet.provider === "dynamic" ? (
              <>
                <label className="block text-sm text-slate-300">
                  Email
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    autoComplete="email"
                    required
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                </label>
                {wallet.otpSent ? (
                  <label className="block text-sm text-slate-300">
                    Email code
                    <input
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    />
                  </label>
                ) : null}
              </>
            ) : null}
            {wallet.error ? (
              <p role="alert" className="rounded-lg border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">{wallet.error}</p>
            ) : null}
            {wallet.provider === "dynamic" && wallet.otpSent ? (
              <button
                type="button"
                onClick={() => void handleVerify()}
                disabled={busy || !wallet.ready}
                className="w-full rounded-xl bg-teal-700 px-4 py-3 font-semibold hover:bg-teal-600 disabled:opacity-50"
              >
                {busy ? "Verifying…" : "Verify code"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleLogin()}
                disabled={busy || !wallet.ready || (wallet.provider === "dynamic" && !email)}
                className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500 disabled:opacity-50"
              >
                {busy
                  ? "Please wait…"
                  : wallet.provider === "dynamic"
                    ? "Send me a code"
                    : mode === "signup" ? "Sign up with email" : "Sign in with email"}
              </button>
            )}
            <p className="text-center text-xs text-slate-500">{secured}</p>
            <button type="button" onClick={wallet.clearRole} className="w-full text-sm text-slate-400 underline">
              Back
            </button>
            {error ? (
              <p role="alert" className="rounded-xl border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}