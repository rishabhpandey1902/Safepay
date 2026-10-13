"use client";

import { acceptanceTypedData, closureTypedData } from "@/lib/acceptance";
import { friendlyChainError } from "@/lib/chain-errors";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { isAddress, isHash, keccak256, toBytes, type Address } from "viem";

import { safePayEscrowAbi } from "@/lib/contracts";
import { formatTokenDisplay } from "@/lib/token";
import { useSafePayWallet } from "@/lib/wallet/useSafePayWallet";
import { RoleSignInLink } from "@/lib/wallet/role-sign-in-link";
import { useTokenConfig } from "../../token-provider";
import { ChatBox } from "@/app/chat-box";

const milestoneStatusLabels: Record<number, string> = {
  0: "Locked",
  1: "Submitted",
  2: "Released",
  3: "Disputed",
  4: "Refunded",
  5: "Split",
  6: "Cancelled",
};

const erc20Abi = [
  {
    type: "function",
    name: "allowance",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

type AgreementDetails = {
  client: Address;
  contractor: Address;
  token: Address;
  resolver: Address;
  totalAmount: bigint;
  remainingBalance: bigint;
  approvalWindow: bigint;
  disputeWindow: bigint;
  clientCancellationFee: bigint;
  createdAt: bigint;
  fundedAt: bigint;
  status: number;
  milestoneCount: bigint;
};

type MilestoneData = {
  amount: bigint;
  descriptionHash: `0x${string}`;
  descriptionURI: string;
  status: number;
  evidenceHash: `0x${string}`;
  evidenceURI: string;
  submittedAt: bigint;
  approvalDeadline: bigint;
  disputeDeadline: bigint;
  disputeRaisedBy: Address;
  disputeReasonHash: `0x${string}`;
  disputeReasonURI: string;
  contractorPayout: bigint;
  clientRefund: bigint;
};

type TxLog = {
  action: string;
  hash: `0x${string}`;
  status: "pending" | "confirmed" | "failed";
};

const equalsAddress = (left?: string, right?: string) =>
  Boolean(left && right && left.toLowerCase() === right.toLowerCase());

const explorerUrl = (hash: `0x${string}`) => `https://testnet.monadexplorer.com/tx/${hash}`;
function parseEvidence(value: string): { note: string; link: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { n?: unknown; l?: unknown };
    if (typeof parsed === "object" && parsed !== null) {
      return {
        note: typeof parsed.n === "string" ? parsed.n : "",
        link: typeof parsed.l === "string" && /^https?:\/\//i.test(parsed.l) ? parsed.l : "",
      };
    }
  } catch {
    // Older submissions stored a plain link.
  }
  return /^https?:\/\//i.test(value) ? { note: "", link: value } : { note: value, link: "" };
}

export default function AgreementPage() {
  const params = useParams<{ id: string }>();
  const agreementId = Number(params?.id ?? "0");
  const { ready, authenticated, address, walletClient, publicClient, logout, provider, getAuthToken } = useSafePayWallet();
  const tokenConfig = useTokenConfig();
  const [agreement, setAgreement] = useState<AgreementDetails | null>(null);
  const [milestones, setMilestones] = useState<MilestoneData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [txLogs, setTxLogs] = useState<TxLog[]>([]);
  const [submitForm, setSubmitForm] = useState<Record<number, { note: string; link: string }>>({});
  const [disputeForm, setDisputeForm] = useState<Record<number, { note: string; link: string }>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [chainTimestamp, setChainTimestamp] = useState<bigint | null>(null);
  const [details, setDetails] = useState<string[] | null>(null);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [closure, setClosure] = useState<"declined" | "withdrawn" | null>(null);

  const contractAddress = process.env.NEXT_PUBLIC_SAFE_PAY_ESCROW_ADDRESS as Address | undefined;
  const configurationError = !contractAddress || !isAddress(contractAddress) || contractAddress === "0x0000000000000000000000000000000000000000"
    ? "Set NEXT_PUBLIC_SAFE_PAY_ESCROW_ADDRESS before viewing an agreement."
    : null;
  const routeError = !Number.isSafeInteger(agreementId) || agreementId <= 0
    ? "This agreement id is not valid."
    : null;
  const visibleError = error ?? configurationError ?? routeError ??
    (tokenConfig.status === "error" ? tokenConfig.error : null);
  const formatAmount = (value: bigint) =>
    tokenConfig.status === "ready"
      ? formatTokenDisplay(value, tokenConfig.metadata)
      : "—";

  useEffect(() => {
    if (tokenConfig.status === "loading") return;
    if (tokenConfig.status === "error") return;
    if (configurationError || routeError || !contractAddress) return;

    const loadAgreement = async () => {
      // setLoading(true);
      try {

        const agreementData = (await publicClient.readContract({
          address: contractAddress,
          abi: safePayEscrowAbi,
          functionName: "getAgreement",
          args: [BigInt(agreementId)],
        })) as AgreementDetails;
        if (agreementData.token.toLowerCase() !== tokenConfig.metadata.address.toLowerCase()) {
          throw new Error("This agreement uses a token different from NEXT_PUBLIC_SAFE_PAY_TOKEN_ADDRESS.");
        }
        const latestBlock = await publicClient.getBlock();

        const milestoneReads = await Promise.all(
          Array.from({ length: Number(agreementData.milestoneCount) }, (_, index) =>
            publicClient.readContract({
              address: contractAddress,
              abi: safePayEscrowAbi,
              functionName: "getMilestone",
              args: [BigInt(agreementId), BigInt(index)],
            }),
          ),
        );

        setAgreement(agreementData);
        setMilestones(milestoneReads as MilestoneData[]);
        setChainTimestamp(latestBlock.timestamp);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load agreement details.");
      } finally {
        setLoading(false);
      }
    };

    void loadAgreement();
  }, [agreementId, configurationError, contractAddress, publicClient, refreshTick, routeError, tokenConfig]);


  useEffect(() => {
    const refresh = () => setRefreshTick((current) => current + 1);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 10_000);
    window.addEventListener("safepay:refresh", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("safepay:refresh", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    if (configurationError || routeError) return;
    let active = true;

    const readJson = async <T,>(url: string): Promise<T | null> => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return null;
        return (await response.json()) as T;
      } catch {
        return null;
      }
    };

    const loadOffChain = async () => {
      const [detailsBody, acceptanceBody, closureBody] = await Promise.all([
        readJson<{ descriptions?: string[] }>(`/api/agreement-details?id=${agreementId}`),
        readJson<{ accepted?: Record<string, { createdAt: string }> }>(`/api/acceptance?ids=${agreementId}`),
        readJson<{ closed?: Record<string, "declined" | "withdrawn"> }>(`/api/agreement-closure?ids=${agreementId}`),
      ]);
      if (!active) return;
      // A request that fails keeps what the page already knows instead of wiping it.
      if (detailsBody?.descriptions) setDetails(detailsBody.descriptions);
      if (acceptanceBody) setAcceptedAt(acceptanceBody.accepted?.[String(agreementId)]?.createdAt ?? null);
      if (closureBody) setClosure(closureBody.closed?.[String(agreementId)] ?? null);
    };

    void loadOffChain();
    return () => {
      active = false;
    };
  }, [agreementId, configurationError, routeError, refreshTick]);

  useEffect(() => {
    if (!contractAddress || !isAddress(contractAddress)) return;
    let active = true;
    const updateChainTime = async () => {
      try {
        const latestBlock = await publicClient.getBlock();
        if (active) setChainTimestamp(latestBlock.timestamp);
      } catch {
        if (active) setChainTimestamp(null);
      }
    };
    const timer = window.setInterval(() => void updateChainTime(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [contractAddress, publicClient]);

  const activeAddress = address?.toLowerCase();
  const isClient = Boolean(agreement && activeAddress && equalsAddress(activeAddress, agreement.client));
  const isContractor = Boolean(agreement && activeAddress && equalsAddress(activeAddress, agreement.contractor));
  const canAct = isClient || isContractor;
  const canFund = Boolean(agreement && isClient && agreement.status === 0);
  const canCancel = Boolean(agreement && canAct && agreement.status === 1);
  const hasOutstanding = milestones.some((item) => Number(item.status) === 1 || Number(item.status) === 3);
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/agreement/${agreementId}` : "";
  const shareText = `I created a SafePay agreement for you. Review and accept it here: ${shareUrl}`;
  const toDays = (seconds: bigint) => Number(seconds) / 86_400;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy the link. Select it and copy it manually.");
    }
  };

  const handleAccept = async () => {
    if (!agreement || !contractAddress || !isContractor) return;
    setBusyAction("accept");
    setError(null);
    try {
      const signer = await getWalletClient();
      if (!signer) throw new Error("Your wallet connection is not ready yet.");
      const typedData = acceptanceTypedData(contractAddress, {
        agreementId: BigInt(agreementId),
        client: agreement.client,
        contractor: agreement.contractor,
        token: agreement.token,
        resolver: agreement.resolver,
        totalAmount: agreement.totalAmount,
        approvalWindow: agreement.approvalWindow,
        disputeWindow: agreement.disputeWindow,
        clientCancellationFee: agreement.clientCancellationFee,
        milestones: milestones.map((milestone) => ({
          amount: milestone.amount,
          descriptionHash: milestone.descriptionHash,
        })),
      });
      const signature = await signer.signTypedData(typedData);
      const response = await fetch("/api/acceptance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreementId, signature }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not record your acceptance.");
            setAcceptedAt(new Date().toISOString());
      setRefreshTick((current) => current + 1);
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Could not accept the agreement.");
    } finally {
      setBusyAction(null);
    }
  };
  const handleClose = async (kind: "declined" | "withdrawn") => {
    if (!agreement || !contractAddress) return;
    setBusyAction("close");
    setError(null);
    try {
      const signer = await getWalletClient();
      if (!signer) throw new Error("Your wallet connection is not ready yet.");
      const typedData = closureTypedData(
        contractAddress,
        {
          agreementId: BigInt(agreementId),
          client: agreement.client,
          contractor: agreement.contractor,
          token: agreement.token,
          resolver: agreement.resolver,
          totalAmount: agreement.totalAmount,
          approvalWindow: agreement.approvalWindow,
          disputeWindow: agreement.disputeWindow,
          clientCancellationFee: agreement.clientCancellationFee,
          milestones: milestones.map((milestone) => ({
            amount: milestone.amount,
            descriptionHash: milestone.descriptionHash,
          })),
        },
        kind,
      );
      const signature = await signer.signTypedData(typedData);
      const response = await fetch("/api/agreement-closure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreementId, kind, signature }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not close the agreement.");
            setClosure(kind);
      setRefreshTick((current) => current + 1);
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "Could not close the agreement.");
    } finally {
      setBusyAction(null);
    }
  };

  const getWalletClient = async () => {
    if (!walletClient || !authenticated || !address) return null;
    if (!equalsAddress(walletClient.account?.address, address)) {
      throw new Error("The transaction wallet does not match the selected SafePay wallet.");
    }
    return walletClient;
  };

  const addTxLog = (action: string, hash: `0x${string}`) => {
    setTxLogs((current) => [{ action, hash, status: "pending" }, ...current]);
    return hash;
  };

  const updateTxLog = async (hash: `0x${string}`) => {
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setTxLogs((current) =>
        current.map((row) =>
          row.hash === hash ? { ...row, status: receipt.status === "success" ? "confirmed" : "failed" } : row,
        ),
      );
      return receipt.status === "success";
    } catch {
      setTxLogs((current) =>
        current.map((row) =>
          row.hash === hash ? { ...row, status: "failed" } : row,
        ),
      );
      return false;
    }
  };

  const handleAction = async (action: "approve" | "dispute" | "submit" | "release" | "fund" | "cancel", milestoneIndex?: number) => {
    if (!agreement || !contractAddress || !authenticated) {
      setError("Connect your wallet to continue.");
      return;
    }

    setBusyAction(action);
    setError(null);

    try {
      const walletClient = await getWalletClient();
      if (!walletClient) throw new Error("Your wallet connection is not ready yet.");
      let hash: `0x${string}`;

      if (action === "fund") {
        if (!address) throw new Error("Your wallet connection is not ready yet.");
        const allowance = await publicClient.readContract({
          address: agreement.token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, contractAddress],
        });
        if (allowance < agreement.totalAmount) {
          const approvalHash = await walletClient.writeContract({
            address: agreement.token,
            abi: erc20Abi,
            functionName: "approve",
            args: [contractAddress, agreement.totalAmount],
          }) as `0x${string}`;
          addTxLog("Approve token spending", approvalHash);
          if (!(await updateTxLog(approvalHash))) throw new Error("Token approval failed. The draft is still available to fund.");
        }
        hash = await walletClient.writeContract({
          address: contractAddress,
          abi: safePayEscrowAbi,
          functionName: "fundAgreement",
          args: [BigInt(agreementId)],
        }) as `0x${string}`;
      } else if (action === "approve") {
        if (milestoneIndex === undefined) return;
        hash = (await walletClient.writeContract({
          address: contractAddress,
          abi: safePayEscrowAbi,
          functionName: "approveMilestone",
          args: [BigInt(agreementId), BigInt(milestoneIndex)],
        })) as `0x${string}`;
      } else if (action === "submit") {
        if (milestoneIndex === undefined) return;
        const data = submitForm[milestoneIndex] ?? { note: "", link: "" };
        const note = data.note.trim();
        const link = data.link.trim();
        if (!note && !link) throw new Error("Add a note or a link describing what you delivered.");
        if (link && !/^https?:\/\//i.test(link)) throw new Error("Links must start with http:// or https://.");
        const packed = JSON.stringify({ n: note, l: link });
        if (new TextEncoder().encode(packed).length > 2000) {
          throw new Error("The note and link are too long. Shorten them, and share details in chat.");
        }
        const evidenceHash = keccak256(toBytes(packed));
        hash = (await walletClient.writeContract({
          address: contractAddress,
          abi: safePayEscrowAbi,
          functionName: "submitMilestone",
          args: [BigInt(agreementId), BigInt(milestoneIndex), evidenceHash, packed],
        })) as `0x${string}`;
      } else if (action === "dispute") {
        if (milestoneIndex === undefined) return;
        const data = disputeForm[milestoneIndex] ?? { note: "", link: "" };
        const note = data.note.trim() || "I am raising a dispute.";
        const link = data.link.trim();
        if (new TextEncoder().encode(link).length > 2048) throw new Error("Dispute links must be 2,048 bytes or fewer.");
        const reasonHash = keccak256(toBytes(note));
        hash = (await walletClient.writeContract({
          address: contractAddress,
          abi: safePayEscrowAbi,
          functionName: "raiseDispute",
          args: [BigInt(agreementId), BigInt(milestoneIndex), reasonHash, link],
        })) as `0x${string}`;
      } else if (action === "release") {
        if (milestoneIndex === undefined) throw new Error("Choose a milestone to release.");
        hash = (await walletClient.writeContract({
          address: contractAddress,
          abi: safePayEscrowAbi,
          functionName: "releaseMilestone",
          args: [BigInt(agreementId), BigInt(milestoneIndex)],
        })) as `0x${string}`;
      } else {
        hash = (await walletClient.writeContract({
          address: contractAddress,
          abi: safePayEscrowAbi,
          functionName: "cancelAgreement",
          args: [BigInt(agreementId)],
        })) as `0x${string}`;
      }

      addTxLog(action, hash);
      if (!(await updateTxLog(hash))) throw new Error("The transaction failed or could not be confirmed. Check its status below.");
      void fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreementId, txHash: hash }),
      }).catch(() => undefined);
      if (action === "cancel") {
        await fetch("/api/cancellation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agreementId, txHash: hash }),
        }).catch(() => undefined);
      }
      setRefreshTick((current) => current + 1);
    } catch (actionError) {
      setError(actionError instanceof Error ? friendlyChainError(actionError.message) : "The transaction could not be completed.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleTimeoutRelease = async (milestoneIndex: number) => {
    setBusyAction(`timeout-${milestoneIndex}`);
    setError(null);
    try {
      const response = await fetch("/api/timeout-release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreementId, milestoneIndex }),
      });
      const result: unknown = await response.json();
      const parsedResult = result as { error?: string; transactionHash?: string };
      if (!response.ok) throw new Error(parsedResult.error ?? "The keeper release request failed.");
      if (!parsedResult.transactionHash || !isHash(parsedResult.transactionHash)) {
        throw new Error("The keeper returned an invalid transaction hash.");
      }
      addTxLog("Released by SafePay keeper", parsedResult.transactionHash);
      setTxLogs((current) =>
        current.map((row) =>
          row.hash === parsedResult.transactionHash ? { ...row, status: "confirmed" } : row,
        ),
      );
      setRefreshTick((current) => current + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The keeper release request failed.");
    } finally {
      setBusyAction(null);
    }
  };

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 px-8 py-6 text-slate-50">
          <span className="text-lg font-medium">Loading SafePay agreement…</span>
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10">
        <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8 text-slate-50">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-400">SafePay</p>
          <h1 className="mt-4 text-3xl font-semibold">Sign in to view this agreement</h1>
          <p className="mt-3 text-slate-300">Use your email sign-in to access the agreement and approve or dispute work.</p>
          <RoleSignInLink className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-violet-500">Choose a wallet role and sign in</RoleSignInLink>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-50 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-400">SafePay</p>
            <h1 className="mt-2 text-3xl font-semibold">Agreement #{agreementId}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500">
              Home
            </Link>
            <button type="button" onClick={() => logout()} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500">
              Log out
            </button>
          </div>
        </div>

        {visibleError ? (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {visibleError}
          </div>
        ) : null}

        {loading && !visibleError ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 text-slate-200">Loading agreement details…</div>
        ) : agreement ? (
          <>
            {agreement.status === 0 && closure ? (
              <section className="mb-6 border border-slate-700 bg-slate-900 p-4">
                <h2 className="font-semibold text-white">
                  {closure === "declined" ? "The contractor declined this agreement" : "The client withdrew this agreement"}
                </h2>
                <p className="mt-1 text-sm text-slate-300">
                  It was never funded, so no money moved. Create a new agreement to try again.
                </p>
              </section>
            ) : null}

            {agreement.status === 0 && !closure && (isClient || isContractor) ? (
              <section className="mb-6 flex flex-wrap items-center justify-between gap-3 border border-slate-800 bg-slate-900 p-4">
                <p className="text-sm text-slate-300">
                  {isClient
                    ? "Changed your mind? Withdraw this agreement before it is funded. Nothing is locked yet."
                    : "Not interested? Decline this agreement. Nothing is locked yet."}
                </p>
                <button
                  type="button"
                  onClick={() => void handleClose(isClient ? "withdrawn" : "declined")}
                  disabled={busyAction !== null}
                  className="border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-60"
                >
                  {busyAction === "close" ? "Waiting for your signature…" : isClient ? "Withdraw agreement" : "Decline agreement"}
                </button>
              </section>
            ) : null}

            {isClient && agreement.status === 0 && !closure ? (
              <section className="mb-6 space-y-4 border border-amber-500/30 bg-amber-950/20 p-4">
                <div>
                  <h2 className="font-semibold text-white">
                    {acceptedAt ? "Contractor accepted. Ready to fund." : "Waiting for the contractor to accept"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-300">
                    {acceptedAt
                      ? `Accepted ${new Date(acceptedAt).toLocaleString()}. Funding transfers the full agreed amount into SafePay.`
                      : "Nothing is locked yet. Send the contractor this link. They sign in, review the terms and accept. Then you can fund."}
                  </p>
                </div>

                {!acceptedAt ? (
                  <div className="space-y-3">
                    <input
                      readOnly
                      value={shareUrl}
                      onFocus={(event) => event.currentTarget.select()}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void copyLink()}
                        className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500"
                      >
                        {copied ? "Copied" : "Copy link"}
                      </button>
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100 hover:border-slate-400"
                      >
                        WhatsApp
                      </a>
                      <a
                        href={`mailto:?subject=${encodeURIComponent("SafePay agreement to review")}&body=${encodeURIComponent(shareText)}`}
                        className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100 hover:border-slate-400"
                      >
                        Email
                      </a>
                    </div>
                    <p className="break-all text-xs text-slate-400">
                      The contractor must sign in with the wallet address you entered: {agreement.contractor}
                    </p>
                  </div>
                ) : null}

                {acceptedAt && canFund ? (
                  <button
                    type="button"
                    onClick={() => void handleAction("fund")}
                    disabled={busyAction !== null}
                    className="w-full bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {busyAction === "fund" ? "Funding agreement…" : "Fund agreement"}
                  </button>
                ) : null}
              </section>
            ) : null}

            {isContractor && agreement.status === 0 && !closure ? (
              <section className="mb-6 space-y-4 border border-teal-500/30 bg-teal-950/20 p-4">
                {acceptedAt ? (
                  <div>
                    <h2 className="font-semibold text-white">You accepted this agreement</h2>
                    <p className="mt-1 text-sm text-slate-300">
                      Waiting for the client to fund it. You can start work once it is funded.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <h2 className="font-semibold text-white">You were invited to this agreement</h2>
                      <p className="mt-1 text-sm text-slate-300">
                        Review the terms. Accepting signs a message with your wallet. It does not move any money.
                      </p>
                    </div>
                    <ul className="space-y-1 text-sm text-slate-200">
                      <li>Total: {formatAmount(agreement.totalAmount)}</li>
                      <li>Approval window: {toDays(agreement.approvalWindow)} days (then payment releases automatically)</li>
                      <li>Dispute window: {toDays(agreement.disputeWindow)} days</li>
                      <li>Client cancellation fee: {formatAmount(agreement.clientCancellationFee)}</li>
                    </ul>
                    <ol className="space-y-1 text-sm text-slate-200">
                      {milestones.map((milestone, index) => (
                        <li key={index} className="flex justify-between gap-4">
                          <span>{index + 1}. {details?.[index] ?? "Description not available"}</span>
                          <span className="shrink-0">{formatAmount(milestone.amount)}</span>
                        </li>
                      ))}
                    </ol>
                    {details === null ? (
                      <p className="text-xs text-amber-200">
                        The milestone descriptions were not saved. Check them with the client before accepting.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleAccept()}
                      disabled={busyAction !== null}
                      className="w-full bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      {busyAction === "accept" ? "Waiting for your signature…" : "Accept and sign"}
                    </button>
                  </>
                )}
              </section>
            ) : null}
            {agreement.status === 3 ? (
              <section className="mb-6 border border-emerald-500/40 bg-emerald-500/10 p-4">
                <h2 className="font-semibold text-emerald-200">Completed</h2>
                <p className="mt-1 text-sm text-emerald-100">All milestones are settled. This agreement is finished for both sides.</p>
              </section>
            ) : null}
            {agreement.status === 2 ? (
              <section className="mb-6 border border-slate-600 bg-slate-900 p-4">
                <h2 className="font-semibold text-slate-100">Cancelled</h2>
                <p className="mt-1 text-sm text-slate-300">This agreement was cancelled. See Wallet history for the amounts.</p>
              </section>
            ) : null}
            <section className="mb-8 grid gap-5 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Client</p>
                <p className="mt-2 break-all text-sm text-white">{agreement.client}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Contractor</p>
                <p className="mt-2 break-all text-sm text-white">{agreement.contractor}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Total</p>
                <p className="mt-2 text-xl font-semibold text-white">{formatAmount(agreement.totalAmount)}</p>
              </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
              <div className="overflow-x-auto">
                <table className="min-w-[900px] text-left text-sm">
                  <thead className="bg-slate-950/70 text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-medium">Milestone</th>
                      <th className="px-4 py-3 font-medium">Description</th>
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {milestones.map((milestone, index) => {
                      const statusNumber = Number(milestone.status);
                      const statusText = milestoneStatusLabels[statusNumber] ?? "Locked";
                      const evidence = statusNumber >= 1 ? parseEvidence(milestone.evidenceURI) : null;
                      const canSubmit = isContractor && statusNumber === 0 && agreement.status === 1;
                      const submitted = statusNumber === 1 && agreement.status === 1;
                      const canApprove = isClient && submitted && chainTimestamp !== null && chainTimestamp < milestone.approvalDeadline;
                      const canRelease = submitted && chainTimestamp !== null && chainTimestamp >= milestone.approvalDeadline;
                      const canDispute = canAct && submitted && chainTimestamp !== null && chainTimestamp < milestone.disputeDeadline;

                      return (
                        <tr key={index} className="border-t border-slate-800 align-top">
                          <td className="px-4 py-4 text-slate-200">#{index + 1}</td>
                          <td className="px-4 py-4 text-slate-200">
                            <div className="max-w-md break-words">{details?.[index] || milestone.descriptionURI || "No note on file"}</div>
                            {evidence && (evidence.note || evidence.link) ? (
                              <div className="mt-2 max-w-md rounded-lg border border-teal-500/30 bg-teal-950/20 p-3 text-xs">
                                <p className="font-semibold text-teal-200">Delivered by the contractor</p>
                                {evidence.note ? (
                                  <p className="mt-1 whitespace-pre-line break-words text-slate-200">{evidence.note}</p>
                                ) : null}
                                {evidence.link ? (
                                  <a
                                    href={evidence.link}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="mt-1 inline-block break-all text-violet-300 hover:text-violet-200"
                                  >
                                    Open delivered files
                                  </a>
                                ) : null}
                                {milestone.submittedAt > BigInt(0) ? (
                                  <p className="mt-1 text-slate-500">
                                    Submitted {new Date(Number(milestone.submittedAt) * 1000).toLocaleString()}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-4 text-slate-200">
                            {formatAmount(milestone.amount)}
                          </td>
                          <td className="px-4 py-4">
                            <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-200">
                              {statusText}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-3">
                              {canSubmit ? (
                                <div className="rounded-xl border border-slate-700 bg-slate-950/80 p-3">
                                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Submit milestone</p>
                                  <textarea
                                    value={submitForm[index]?.note ?? ""}
                                    onChange={(event) =>
                                      setSubmitForm((current) => ({
                                        ...current,
                                        [index]: { note: event.target.value, link: current[index]?.link ?? "" },
                                      }))
                                    }
                                    placeholder="Add evidence note or link"
                                    className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-violet-500"
                                    rows={3}
                                  />
                                  <input
                                    value={submitForm[index]?.link ?? ""}
                                    onChange={(event) =>
                                      setSubmitForm((current) => ({
                                        ...current,
                                        [index]: { note: current[index]?.note ?? "", link: event.target.value },
                                      }))
                                    }
                                    placeholder="https://..."
                                    maxLength={2048}
                                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-violet-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void handleAction("submit", index)}
                                    disabled={busyAction !== null}
                                    className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {busyAction === "submit" ? "Submitting…" : "Submit milestone"}
                                  </button>
                                </div>
                              ) : null}

                              {canApprove ? (
                                <button
                                  type="button"
                                  onClick={() => void handleAction("approve", index)}
                                  disabled={busyAction !== null}
                                  className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {busyAction === "approve" ? "Approving…" : "Approve"}
                                </button>
                              ) : null}

                              {canRelease ? (
                                <button
                                  type="button"
                                  onClick={() => void handleAction("release", index)}
                                  disabled={busyAction !== null}
                                  className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {busyAction === "release" ? "Releasing…" : "Release to contractor"}
                                </button>
                              ) : null}
                              {canRelease ? (
                                <button
                                  type="button"
                                  onClick={() => void handleTimeoutRelease(index)}
                                  disabled={busyAction !== null}
                                  className="inline-flex items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {busyAction === `timeout-${index}` ? "Requesting timeout release…" : "Release with SafePay keeper"}
                                </button>
                              ) : null}

                              {submitted && chainTimestamp === null ? <p className="text-xs text-slate-400">Checking Monad testnet deadlines…</p> : null}
                              {submitted && chainTimestamp !== null && chainTimestamp >= milestone.approvalDeadline && isClient ? (
                                <p className="text-xs text-slate-400">Approval window ended. Anyone can release this payment to the contractor.</p>
                              ) : null}

                              {statusNumber === 3 ? (
                                <Link
                                  href={`/dispute/${agreementId}`}
                                  className="inline-flex items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20"
                                >
                                  View dispute record
                                </Link>
                              ) : null}

                              {canDispute ? (
                                <div className="rounded-xl border border-slate-700 bg-slate-950/80 p-3">
                                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Raise dispute</p>
                                  <textarea
                                    value={disputeForm[index]?.note ?? ""}
                                    onChange={(event) =>
                                      setDisputeForm((current) => ({
                                        ...current,
                                        [index]: { note: event.target.value, link: current[index]?.link ?? "" },
                                      }))
                                    }
                                    placeholder="Reason for the dispute"
                                    className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-violet-500"
                                    rows={3}
                                  />
                                  <input
                                    value={disputeForm[index]?.link ?? ""}
                                    onChange={(event) =>
                                      setDisputeForm((current) => ({
                                        ...current,
                                        [index]: { note: current[index]?.note ?? "", link: event.target.value },
                                      }))
                                    }
                                    placeholder="https://..."
                                    maxLength={2048}
                                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-violet-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void handleAction("dispute", index)}
                                    disabled={busyAction !== null}
                                    className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {busyAction === "dispute" ? "Submitting…" : "Raise dispute"}
                                  </button>
                                </div>
                              ) : null}

                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {canCancel ? (
              <section className="mt-5 flex flex-wrap items-center justify-between gap-4 border border-slate-800 bg-slate-900 p-4">
                <p className="text-sm text-slate-300">Cancellation is blocked while any milestone awaits review or dispute resolution.</p>
                <button
                  type="button"
                  onClick={() =>
                    hasOutstanding
                      ? setError("A milestone is waiting for review or in dispute. Approve it, let it release, or resolve the dispute first, then cancel.")
                      : void handleAction("cancel")
                  } disabled={busyAction !== null}
                  className="w-full border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {busyAction === "cancel" ? "Cancelling agreement…" : "Cancel agreement"}
                </button>
              </section>
            ) : null}

            {canAct ? (
              <section id="chat" className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-lg font-semibold text-white">
                  Chat with the {isClient ? "contractor" : "client"}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Share project details and files here. Only the two of you can read this.
                </p>
                <div className="mt-4">
                  <ChatBox thread={`agreement:${agreementId}`} />
                </div>
              </section>
            ) : null}


            {txLogs.length > 0 ? (
              <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-lg font-semibold text-white">Recent transactions</h2>
                <div className="mt-4 space-y-3">
                  {txLogs.map((tx, index) => (
                    <div key={`${tx.hash}-${index}`} className="rounded-2xl border border-slate-700 bg-slate-950/70 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-medium text-slate-100">{tx.action}</p>
                        <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{tx.status}</span>
                      </div>
                      <a href={explorerUrl(tx.hash)} target="_blank" rel="noreferrer" className="mt-2 inline-block break-all text-sm text-violet-300 hover:text-violet-200">
                        {tx.hash}
                      </a>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
