"use client";

import { useCallback, useEffect, useState } from "react";
import { formatEther, parseEther, parseUnits, type Address } from "viem";

import { formatTokenDisplay } from "@/lib/token";
import { useWalletSession } from "@/lib/wallet/session";

import { useTokenConfig } from "./token-provider";

const tokenAbi = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "mint",
    inputs: [
      { name: "account", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

type Snapshot = { address: string; mon: bigint; token: bigint | null };

export function WalletBalance() {
  const { address, authenticated, publicClient, walletClient } = useWalletSession();
  const tokenConfig = useTokenConfig();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const metadata = tokenConfig.status === "ready" ? tokenConfig.metadata : null;
  const tokenAddress = metadata?.address as Address | undefined;

  const load = useCallback(async () => {
    if (!address) return;
    try {
      const [mon, token] = await Promise.all([
        publicClient.getBalance({ address }),
        tokenAddress
          ? publicClient.readContract({
              address: tokenAddress,
              abi: tokenAbi,
              functionName: "balanceOf",
              args: [address],
            })
          : Promise.resolve(null),
      ]);
      setSnapshot({ address: address.toLowerCase(), mon, token });
    } catch {
      // Keep the last known values if the RPC is busy.
    }
  }, [address, publicClient, tokenAddress]);

  useEffect(() => {
    if (!authenticated || !address) return;
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [authenticated, address, load]);

  if (!authenticated || !address) return null;

  const current = snapshot && snapshot.address === address.toLowerCase() ? snapshot : null;
  const lowGas = current !== null && current.mon < parseEther("0.02");

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setMessage("Could not copy. Select the address and copy it manually.");
    }
  };

  const getTestTokens = async () => {
    if (!walletClient || !metadata || !tokenAddress) return;
    setBusy(true);
    setMessage(null);
    try {
      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: tokenAbi,
        functionName: "mint",
        args: [address, parseUnits("1000", metadata.decimals)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setMessage("1,000 test tokens added.");
      await load();
    } catch (cause) {
      const text = cause instanceof Error ? cause.message.split("\n")[0] : "";
      setMessage(text ? `Could not add test tokens: ${text}` : "Could not add test tokens.");
    } finally {
      setBusy(false);
    }
  };

  const chip = "rounded-lg border border-slate-700 px-2 py-1";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={chip} title="Payment token balance">
        {current ? (metadata && current.token !== null ? formatTokenDisplay(current.token, metadata) : "—") : "…"}
      </span>
      <span
        className={`rounded-lg border px-2 py-1 ${lowGas ? "border-amber-500/60 text-amber-200" : "border-slate-700"}`}
        title="Gas balance, paid in MON"
      >
        {current ? `${Number(formatEther(current.mon)).toFixed(3)} MON` : "…"}
      </span>
      <button type="button" onClick={() => void copyAddress()} className={`${chip} hover:border-slate-500`}>
        {copied ? "Copied" : "Copy address"}
      </button>
      {metadata ? (
        <button
          type="button"
          onClick={() => void getTestTokens()}
          disabled={busy}
          className={`${chip} hover:border-slate-500 disabled:opacity-50`}
        >
          {busy ? "Adding…" : "Get test tokens"}
        </button>
      ) : null}
      {lowGas ? (
        <span className="text-amber-200">Low on gas. Get MON from the Monad testnet faucet.</span>
      ) : null}
      {message ? <span className="text-slate-300">{message}</span> : null}
    </div>
  );
}