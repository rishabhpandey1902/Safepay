import type { SafePayWalletClient } from "./wallet/session";

export async function submitSigned<T>(args: {
  action: "create_project" | "apply" | "save_profile";
  endpoint: string;
  address: `0x${string}`;
  walletClient: SafePayWalletClient;
  payload: unknown;
}): Promise<T> {
  const challengeResponse = await fetch("/api/projects/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: args.action, address: args.address, payload: args.payload }),
  });
  const challenge = (await challengeResponse.json()) as { nonce?: string; message?: string; error?: string };
  if (!challengeResponse.ok || !challenge.nonce || !challenge.message) {
    throw new Error(challenge.error ?? "Could not start the signing step.");
  }

  const signature = await args.walletClient.signMessage({ message: challenge.message });

  const response = await fetch(args.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nonce: challenge.nonce,
      address: args.address,
      signature,
      payload: args.payload,
    }),
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The request failed.");
  return body;
}