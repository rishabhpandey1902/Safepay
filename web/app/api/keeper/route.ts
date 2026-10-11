import { NextResponse } from "next/server";
import { createPublicClient, formatEther, http, type Address } from "viem";

import { monadTestnet } from "@/lib/monad";
import { createPrivyServerClient } from "@/lib/privy-server";
import { listKeeperReleases } from "@/lib/safepay-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(
    process.env.MONAD_RPC_URL ?? process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz",
  ),
});

export async function GET() {
  const releases = await listKeeperReleases(10).catch(() => []);
  const walletId = process.env.PRIVY_TIMEOUT_RELAYER_WALLET_ID;
  if (!walletId || !process.env.PRIVY_APP_SECRET) {
    return NextResponse.json({
      configured: false,
      message: "Set PRIVY_APP_ID, PRIVY_APP_SECRET and PRIVY_TIMEOUT_RELAYER_WALLET_ID to enable the keeper.",
      releases,
    });
  }

  try {
    const privy = createPrivyServerClient();
    const wallet = await privy.wallets().get(walletId);
    const policies = await Promise.all(wallet.policy_ids.map((id) => privy.policies().get(id)));
    const balance = await publicClient.getBalance({ address: wallet.address as Address });
    return NextResponse.json({
      configured: true,
      address: wallet.address,
      balanceMon: formatEther(balance),
      policies: policies.map((policy) => ({
        id: policy.id,
        name: policy.name,
        rules: policy.rules.map((rule) => ({
          name: rule.name,
          method: rule.method,
          action: rule.action,
          conditions: rule.conditions.map((condition) => ({
            field_source: condition.field_source,
            field: condition.field,
            operator: condition.operator,
            value: condition.value,
          })),
        })),
      })),
      releases,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read the keeper wallet from Privy.", releases },
      { status: 503 },
    );
  }
}