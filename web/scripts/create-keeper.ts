import { PrivyClient } from "@privy-io/node";

async function main() {
  const appId = process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  const escrow = process.env.NEXT_PUBLIC_SAFE_PAY_ESCROW_ADDRESS;
  if (!appId || !appSecret || !escrow) {
    throw new Error("Set PRIVY_APP_ID, PRIVY_APP_SECRET and NEXT_PUBLIC_SAFE_PAY_ESCROW_ADDRESS in .env.local.");
  }

  const privy = new PrivyClient({ appId, appSecret });

  const policy = await privy.policies().create({
    name: "SafePay keeper: escrow only",
    version: "1.0",
    chain_type: "ethereum",
    rules: [
      {
        name: "Allow transactions to the SafePay escrow only",
        method: "eth_sendTransaction",
        conditions: [
          { field_source: "ethereum_transaction", field: "to", operator: "eq", value: escrow },
        ],
        action: "ALLOW",
      },
    ],
  });

  const wallet = await privy.wallets().create({
    chain_type: "ethereum",
    policy_ids: [policy.id],
  });

  console.log("Policy ID:  ", policy.id);
  console.log("Wallet ID:  ", wallet.id);
  console.log("Wallet address:", wallet.address);
  console.log("\nAdd this line to web/.env.local:");
  console.log(`PRIVY_TIMEOUT_RELAYER_WALLET_ID=${wallet.id}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});