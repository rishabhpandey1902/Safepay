"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useWalletSession } from "@/lib/wallet/session";

type ApiSession = {
  ready: boolean;
  authedFetch: (input: string, init?: RequestInit) => Promise<Response>;
};

const ApiSessionContext = createContext<ApiSession | null>(null);

const storageKey = (address: string) => `safepay-api-session:${address.toLowerCase()}`;

function readToken(address: string): string | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(address));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string; expiresAt?: number };
    return parsed.token && (parsed.expiresAt ?? 0) > Date.now() / 1000 + 60 ? parsed.token : null;
  } catch {
    return null;
  }
}

const unauthorized = (message: string) =>
  new Response(JSON.stringify({ error: message }), { status: 401, headers: { "Content-Type": "application/json" } });

export function ApiSessionProvider({ children }: { children: ReactNode }) {
  const { address, walletClient, authenticated } = useWalletSession();
  const pending = useRef<Promise<string | null> | null>(null);
  const [readyFor, setReadyFor] = useState<string | null>(null);

  const createToken = useCallback((): Promise<string | null> => {
    if (!address || !walletClient) return Promise.resolve(null);
    if (pending.current) return pending.current;
    const run = (async () => {
      try {
        const challengeResponse = await fetch("/api/session/challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });
        const challenge = (await challengeResponse.json()) as { nonce?: string; message?: string };
        if (!challengeResponse.ok || !challenge.nonce || !challenge.message) return null;

        const signature = await walletClient.signMessage({ message: challenge.message });

        const response = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nonce: challenge.nonce, address, signature }),
        });
        const body = (await response.json()) as { token?: string; expiresAt?: number };
        if (!response.ok || !body.token) return null;
        window.sessionStorage.setItem(
          storageKey(address),
          JSON.stringify({ token: body.token, expiresAt: body.expiresAt }),
        );
        return body.token;
      } catch {
        return null;
      } finally {
        pending.current = null;
      }
    })();
    pending.current = run;
    return run;
  }, [address, walletClient]);

  // Open the secure session automatically once the wallet is connected.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!authenticated || !address || !walletClient) {
      setReadyFor(null);
      return;
    }
    const lower = address.toLowerCase();
    if (readToken(address)) {
      setReadyFor(lower);
      return;
    }
    let active = true;
    void createToken().then((token) => {
      if (active && token) setReadyFor(lower);
    });
    return () => {
      active = false;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [authenticated, address, walletClient, createToken]);

  const authedFetch = useCallback(
    async (input: string, init: RequestInit = {}): Promise<Response> => {
      if (!address) return unauthorized("Sign in first.");
      const token = readToken(address) ?? (await createToken());
      if (!token) return unauthorized("Could not start a secure session.");

      const send = (value: string) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${value}` },
        });

      let response = await send(token);
      if (response.status === 401) {
        window.sessionStorage.removeItem(storageKey(address));
        const fresh = await createToken();
        if (fresh) response = await send(fresh);
      }
      return response;
    },
    [address, createToken],
  );

  const value = useMemo<ApiSession>(
    () => ({ ready: Boolean(address) && readyFor === address?.toLowerCase(), authedFetch }),
    [address, readyFor, authedFetch],
  );

  return <ApiSessionContext.Provider value={value}>{children}</ApiSessionContext.Provider>;
}

export function useApiSession(): ApiSession {
  const context = useContext(ApiSessionContext);
  if (!context) throw new Error("ApiSessionProvider is missing.");
  return context;
}