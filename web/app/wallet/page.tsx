"use client";

import { RoleSignInLink } from "@/lib/wallet/role-sign-in-link";
import { useSafePayWallet } from "@/lib/wallet/useSafePayWallet";

const steps = [
  { title: "Add money", text: "Pay from a bank account or UPI to a licensed on-ramp provider, which sends a stablecoin to your SafePay wallet." },
  { title: "Use SafePay", text: "Fund agreements, release milestones, and receive payments in the stablecoin." },
  { title: "Withdraw", text: "Send the stablecoin to a licensed off-ramp provider, which pays out to your bank account in your local currency." },
];

export default function WalletPage() {
  const wallet = useSafePayWallet();

  return (
    <main className="flex-1 bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-400">Wallet</p>
          <h1 className="mt-2 text-3xl font-semibold">Your SafePay wallet</h1>
        </div>

        {wallet.authenticated ? (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Wallet address</p>
            <p className="mt-2 break-all text-sm text-white">{wallet.address ?? "Wallet connecting…"}</p>
            <p className="mt-1 text-sm text-slate-400">{wallet.chainName ?? "Monad Testnet"}</p>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-slate-300">Sign in to see your wallet.</p>
            <RoleSignInLink className="mt-4 inline-flex rounded-xl bg-violet-600 px-4 py-2 font-semibold hover:bg-violet-500">
              Sign in
            </RoleSignInLink>
          </section>
        )}

        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-100">
          <p className="font-semibold">Preview: not available in this prototype</p>
          <p className="mt-2">
            This app runs on Monad testnet with test tokens that have no value. Bank deposits and withdrawals
            are not connected, and no real money can be added or withdrawn.
          </p>
          <p className="mt-2">
            What we plan to add, including withdrawing in your local currency and signing in with any wallet, is in the{" "}
            <a
              href="https://github.com/rishabhpandey1902/Safepay"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              roadmap in the README
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">How bank access would work in a real product</h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs text-violet-300">Step {index + 1}</p>
                <h3 className="mt-1 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-300">
          <h2 className="font-semibold text-white">Getting test funds</h2>
          <p className="mt-2">
            Test MON for transaction fees comes from the Monad testnet faucet. Use <strong>Get test tokens</strong> in the
            top bar to receive test payment tokens.
          </p>
        </section>
      </div>
    </main>
  );
}