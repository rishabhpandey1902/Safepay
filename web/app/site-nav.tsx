"use client";

import Link from "next/link";
import { useState } from "react";

import { RoleSignInLink } from "@/lib/wallet/role-sign-in-link";
import { useWalletSession } from "@/lib/wallet/session";
import { NotificationBell } from "./notification-bell";


const links = [
  { href: "/create", label: "Create SafePay" },
  { href: "/services", label: "Find freelancer" },
  { href: "/projects", label: "Find work" },
  { href: "/dashboard", label: "My agreements" },
  { href: "/activity", label: "Activity" },
  { href: "/keeper", label: "Keeper" },
  { href: "/history", label: "Wallet history" },
  { href: "/messages", label: "Messages" },
];

function shortAddress(address?: string) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Wallet connecting…";
}

function AuthControls({ onNavigate }: { onNavigate?: () => void }) {
  const { authenticated, address, logout } = useWalletSession();

    if (!authenticated) {
    return (
      <div className="flex items-center gap-2">
        <RoleSignInLink
          onClick={onNavigate}
          className="rounded-lg border border-slate-700 px-4 py-1.5 text-sm font-semibold text-slate-200 hover:border-slate-500"
        >
          Sign in
        </RoleSignInLink>
        <Link
          href="/signin?mode=signup"
          onClick={onNavigate}
          className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-500"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <NotificationBell />
      <span className="text-xs text-slate-400">{shortAddress(address)}</span>
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          void logout().catch(() => undefined);
        }}
        className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500"
      >
        Log out
      </button>
    </div>
  );
}

export function SiteNav() {
  const { address } = useWalletSession();
  const resolver = process.env.NEXT_PUBLIC_SAFE_PAY_RESOLVER_ADDRESS?.toLowerCase();
  const isResolver = Boolean(address && resolver && address.toLowerCase() === resolver);
  const navLinks = isResolver ? [...links, { href: "/resolver", label: "Resolve disputes" }] : links;

  const [open, setOpen] = useState(false);

  return (
    <header className="border-b border-slate-800 bg-slate-950">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-wide text-white">
          SafePay
        </Link>

        <ul className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="text-sm text-slate-300 transition hover:text-white">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden md:block">
          <AuthControls />
        </div>

        <button
          type="button"
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 md:hidden"
          aria-expanded={open}
          aria-label="Toggle menu"
          onClick={() => setOpen((value) => !value)}
        >
          Menu
        </button>
      </nav>

      {open ? (
        <div className="border-t border-slate-800 px-4 pb-4 md:hidden">
          <ul>
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block py-2 text-sm text-slate-200"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <AuthControls onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </header>
  );
}