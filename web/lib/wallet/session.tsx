"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Account, Address, Chain, PublicClient, Transport, WalletClient } from "viem";

export type SafePayWalletClient = WalletClient<Transport, Chain, Account>;

export type SafePayRole = "client" | "freelancer";
export type SafePayProvider = "privy" | "dynamic";

type WalletState = {
  address?: Address;
  walletClient?: SafePayWalletClient;
  chainName?: string;
  chainId?: number;
  authenticated: boolean;
  sdkReady: boolean;
  error?: string;
  login?: () => Promise<void>;
  getAuthToken?: () => Promise<string | null>;
  sendLoginCode?: (email: string) => Promise<void>;
  verifyLoginCode?: (code: string) => Promise<void>;
  logoutSdk?: () => Promise<void>;
};

type SessionContextValue = WalletState & {
  role: SafePayRole | null;
  provider: SafePayProvider | null;
  ready: boolean;
  publicClient: PublicClient;
  otpSent: boolean;
  selectRole: (role: SafePayRole) => void;
  clearRole: () => void;
  setOtpSent: (sent: boolean) => void;
  setWalletState: (state: WalletState | ((current: WalletState) => WalletState)) => void;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function WalletSessionProvider({
  children,
  publicClient,
}: {
  children: ReactNode;
  publicClient: PublicClient;
}) {
  const [role, setRole] = useState<SafePayRole | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [walletState, setWalletStateValue] = useState<WalletState>({
    authenticated: false,
    sdkReady: false,
  });
  const [otpSent, setOtpSent] = useState(false);

  useEffect(() => {
    // Every account signs in with Dynamic. This is set after the page loads so
    // the server and browser markup stay identical.
    /* eslint-disable react-hooks/set-state-in-effect */
    setRole("freelancer");
    setRoleLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // There is only one sign-in option now, so choosing a role does nothing.
  const selectRole = useCallback((): void => undefined, []);

  // Clears the signed-in wallet but keeps the sign-in functions for the next login.
  const clearRole = useCallback(() => {
    setOtpSent(false);
    setWalletStateValue((current) => ({
      ...current,
      authenticated: false,
      address: undefined,
      walletClient: undefined,
      chainId: undefined,
      chainName: undefined,
      error: undefined,
    }));
  }, []);

  // Skips updates that change nothing, which prevents render loops.
  const setWalletState = useCallback((state: WalletState | ((current: WalletState) => WalletState)) => {
    setWalletStateValue((current) => {
      const next = typeof state === "function" ? state(current) : state;
      const keys = new Set([...Object.keys(current), ...Object.keys(next)]) as Set<keyof WalletState>;
      for (const key of keys) {
        if (current[key] !== next[key]) return next;
      }
      return current;
    });
  }, []);

  const logoutSdk = walletState.logoutSdk;
  const logout = useCallback(async () => {
    await logoutSdk?.();
    clearRole();
  }, [clearRole, logoutSdk]);

  const provider: SafePayProvider | null =
    role === "client" ? "privy" : role === "freelancer" ? "dynamic" : null;

  const value = useMemo<SessionContextValue>(() => ({
    ...walletState,
    role,
    provider,
    ready: roleLoaded && (!provider || walletState.sdkReady),
    publicClient,
    otpSent,
    selectRole,
    clearRole,
    setOtpSent,
    setWalletState,
    logout,
  }), [walletState, role, provider, roleLoaded, publicClient, otpSent, selectRole, clearRole, setOtpSent, setWalletState, logout]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useWalletSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("WalletSessionProvider is missing.");
  return context;
}