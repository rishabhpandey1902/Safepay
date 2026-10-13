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
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState<DisplayCurrency>(defaultCurrency);

  const configured = Boolean(process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID);

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

  const profile = wallet.authenticated ? readProfile(wallet.address) : null;
  const needsOnboarding =
    modeReady && mode === "signup" && wallet.authenticated && Boolean(wallet.address) && !profile;

  const goNext = () => {
    const returnTo = window.sessionStorage.getItem("safepay-return-to");
    window.sessionStorage.removeItem("safepay-return-to");
    if (returnTo && !returnTo.startsWith("/signin") && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
      router.replace(returnTo);
      return;
    }
    router.replace("/dashboard");
  };

  // Send people back to what they were doing once they are signed in.
  useEffect(() => {
    if (!modeReady || !wallet.authenticated || needsOnboarding) return;
    if (!window.sessionStorage.getItem("safepay-return-to")) return;
    goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeReady, wallet.authenticated, needsOnboarding]);

  const sendCode = async (event?: FormEvent) => {
    event?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (!wallet.sendLoginCode) throw new Error("Sign-in is still starting. Try again in a moment.");
      await wallet.sendLoginCode(email.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the code.");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event?: FormEvent) => {
    event?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (!wallet.verifyLoginCode) throw new Error("Sign-in is still starting. Try again in a moment.");
      await wallet.verifyLoginCode(code.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify the code.");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = (event: FormEvent) => {
    event.preventDefault();
    if (!wallet.address) return;
    if (name.trim().length < 2 || country.trim().length < 2) {
      setError("Enter your name and country.");
      return;
    }
    try {
      window.localStorage.setItem(
        profileKey(wallet.address),
        JSON.stringify({ name: name.trim(), country: country.trim(), currency } satisfies Profile),
      );
    } catch {
      setError("Could not save your profile in this browser.");
      return;
    }
    setError(null);
    goNext();
  };

  const field = "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white";
  const alertBox = "rounded-lg border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200";

  return (
    <main className="flex flex-1 items-center justify-center bg-slate-950 px-6 py-10">
      <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8 text-slate-50 shadow-2xl shadow-violet-950/20">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-400">SafePay</p>
        <h1 className="mt-4 text-3xl font-semibold">
          {wallet.authenticated ? "You are signed in" : mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>

        {!configured ? (
          <p role="alert" className={`mt-6 ${alertBox}`}>
            Set NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID in web/.env.local, then restart the dev server.
          </p>
        ) : wallet.authenticated ? (
          needsOnboarding ? (
            <form onSubmit={saveProfile} className="mt-6 space-y-4">
              <p className="text-slate-300">One last step. This helps us show prices in your currency.</p>
              <label className="block text-sm text-slate-300">
                Your name
                <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className={field} />
              </label>
              <label className="block text-sm text-slate-300">
                Country
                <input value={country} onChange={(event) => setCountry(event.target.value)} autoComplete="country-name" className={field} />
              </label>
              <label className="block text-sm text-slate-300">
                Show prices in
                <select value={currency} onChange={(event) => setCurrency(event.target.value as DisplayCurrency)} className={field}>
                  {displayCurrencies.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              {error ? <p role="alert" className={alertBox}>{error}</p> : null}
              <button type="submit" className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500">
                Finish and continue
              </button>
            </form>
          ) : (
            <section className="mt-6 space-y-4">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                {profile ? <p className="text-base font-medium text-white">{profile.name}</p> : null}
                <p className="mt-1 break-all text-sm text-slate-200">{wallet.address ?? "Wallet initializing…"}</p>
                <p className="mt-1 text-sm text-slate-300">
                  {wallet.chainName ?? "Monad Testnet"} {wallet.chainId ? `(chain ${wallet.chainId})` : "(switching wallet network…)"}
                </p>
              </div>
              {wallet.error ? <p role="alert" className={alertBox}>{wallet.error}</p> : null}
              <nav className="grid gap-3 sm:grid-cols-2">
                <Link href="/dashboard" className="rounded-xl bg-violet-600 px-4 py-3 text-center font-semibold hover:bg-violet-500">My agreements</Link>
                <Link href="/create" className="rounded-xl border border-violet-500/50 bg-violet-500/10 px-4 py-3 text-center font-semibold text-violet-200 hover:bg-violet-500/20">Create SafePay</Link>
                <Link href="/services" className="rounded-xl border border-teal-500/50 bg-teal-500/10 px-4 py-3 text-center font-semibold text-teal-200 hover:bg-teal-500/20">Find freelancer</Link>
                <Link href="/projects" className="rounded-xl border border-teal-500/50 bg-teal-500/10 px-4 py-3 text-center font-semibold text-teal-200 hover:bg-teal-500/20">Find work</Link>
                <Link href="/services/new" className="rounded-xl border border-slate-600 px-4 py-3 text-center font-semibold text-slate-200 hover:border-slate-400 sm:col-span-2">My freelancer profile</Link>
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
        ) : (
          <section className="mt-6 space-y-4">
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
            <p className="text-sm text-slate-300">
              {mode === "signup"
                ? "Sign up with your email. We create a wallet for you. You can pay people, get paid, hire freelancers and offer your own services with the same account."
                : "Sign in with your email. Signing in with a new email creates an account, so use Sign up if you want to set up your profile."}
            </p>

            <form onSubmit={(event) => void (wallet.otpSent ? verifyCode(event) : sendCode(event))} className="space-y-4">
              <label className="block text-sm text-slate-300">
                Email
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  autoComplete="email"
                  required
                  className={field}
                />
              </label>
              {wallet.otpSent ? (
                <label className="block text-sm text-slate-300">
                  Code from your email
                  <input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className={field}
                  />
                </label>
              ) : null}
              {wallet.error ? <p role="alert" className={alertBox}>{wallet.error}</p> : null}
              {error ? <p role="alert" className={alertBox}>{error}</p> : null}
              <button
                type="submit"
                disabled={busy || !wallet.ready || !email || (wallet.otpSent && !code)}
                className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold hover:bg-violet-500 disabled:opacity-50"
              >
                {busy ? "Please wait…" : wallet.otpSent ? "Verify code" : "Send me a code"}
              </button>
            </form>
            <p className="text-center text-xs text-slate-500">Secured by Dynamic</p>
                        <div className="border-t border-slate-800 pt-4">
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Coming soon"
                className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-500"
              >
                Connect an existing wallet
                <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs">Coming soon</span>
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}