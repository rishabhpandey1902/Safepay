# SafePay

**Pay now. Release when it's done.**

SafePay is a consumer app for protected payments on **Monad testnet**. A payer funds an agreement, the other person delivers the work in milestones, and a smart contract releases the money as each milestone is approved, or automatically when the payer does not respond in time. It works for anyone: a contractor, a tutor, a freelancer found through the built-in marketplace, or a friend.

- **Live app:** https://safepay-beta.vercel.app
- **Demo video:** [ADD VIDEO LINK]
- **Track:** Consumer Products & Payments
- **Sponsor technology used:** Monad, Privy, Dynamic
- **Network:** Monad testnet (chain ID 10143). Test tokens only. No real money.

---

## The problem

Paying someone you do not fully trust yet gives you two bad choices: pay upfront and risk losing the money, or do not pay and the work never starts. Traditional escrow is slow, expensive, or unavailable for everyday amounts.

## What SafePay does

1. **Agree.** The payer sets the amount, the milestones, the approval window, the dispute window and the cancellation fee.
2. **Accept.** The other person reviews the terms and signs an acceptance with their wallet. Nothing is locked yet.
3. **Fund.** The payer deposits the full amount into the SafePay contract.
4. **Deliver.** The contractor submits each milestone with a note and a link. The payer sees it on the agreement page.
5. **Release.** The payer approves and the contract pays the contractor. If the payer stays silent past the approval window, anyone can trigger the release, and the SafePay keeper (a Privy server wallet) does it automatically.

If there is a disagreement, either person can dispute a submitted milestone. The money stays locked until a resolver decides: release, refund, or split.

## Features

| Area | What works | Status |
|---|---|---|
| Escrow | Create, accept, fund, submit, approve, release in milestones | Live |
| Auto-release | Approval window, then permissionless release; keeper wallet sends it | Live <!-- VERIFY: run one keeper release on the live site and check the Keeper page lists it --> |
| Disputes | Dispute a submitted milestone, funds stay locked, resolver releases, refunds or splits | Live <!-- VERIFY: one dispute resolved by the resolver account --> |
| Cancellation | Client cancels and pays the agreed fee; contractor cancels with no fee; remainder returns to the client | Live |
| Accept and sign | Contractor signs the agreement terms (EIP-712) before funding | Live |
| Decline / withdraw | Contractor can decline, payer can withdraw, before funding | Live (enforced by the app, see limitations) |
| Delivery details | Contractor's note and link are stored on-chain with the milestone and shown to the payer | Live <!-- VERIFY --> |
| Hire by the hour | Pick hours and number of payments; the agreement is pre-filled from the freelancer's hourly rate | Live <!-- VERIFY --> |
| Freelancer profiles | Create a profile; search by name or skill, domain, country and experience | Live |
| Projects | Post a project, apply with a price, choose a freelancer and open a pre-filled agreement | Live |
| Chat | Chat on every agreement; direct chat from freelancer profiles and project pages; up to 3 files of 1 MB per message | Live <!-- VERIFY --> |
| Notifications | Bell icon with unread count and an inbox. On-chain actions are checked against the blockchain before anyone is notified | Live |
| Wallet history | What you paid, received, were refunded, and cancellation fees, per agreement | Live <!-- VERIFY --> |
| Activity | Platform-wide recent agreements and totals, read from the contract | Live |
| Prices in your currency | Display conversion (INR, USD, EUR and others) with the rate and its timestamp | Live (display only) |
| Describe in words | Type a sentence and get an editable draft agreement (Google Gemini free tier). It never creates or funds anything | Live <!-- VERIFY or remove this row if the box is hidden --> |
| Cross-network funding screen | Static preview of funding from another network | Preview (no real bridging) |
| Bank deposit and withdrawal | Described on the Wallet page as a roadmap item | Planned |
| Dispute room | Client, contractor and resolver share one chat, see the delivery and the written reason, and can remind the resolver | Live |

## Try it (for judges)

1. Open https://safepay-beta.vercel.app and choose **Sign up**. Sign in with an email code. A wallet is created for you.
2. Get a little test **MON** (for gas) from the Monad testnet faucet, then press **Get test tokens** in the top bar to receive test payment tokens.
3. Open a second browser profile and sign up with another email. You now have a payer and a contractor.
4. As the payer: **Find freelancer**, hire the second account for a few hours (or use **Create SafePay**). As the contractor: open **My agreements**, then **Accept and sign**.
5. Payer: **Fund agreement**. Contractor: submit a milestone with a note. Payer: **Approve**. Check **Wallet history** and the bell icon on both sides.
6. To see automatic release, create an agreement with a short approval window (the form accepts a few minutes), submit work, wait, then press **Release with SafePay keeper**. The release appears on the **Keeper** page with an explorer link.

## Sponsor integrations

### Monad
The escrow contract and every payment settle on Monad testnet. Many small state changes (create, fund, submit, approve, release) are cheap and fast enough to feel like a normal payment app. Reads avoid event log queries, because the public RPC limits `eth_getLogs` to 100 blocks, and are throttled to stay under the 15 requests per second limit.

### Privy: beyond login
Privy is not used for sign-in. It powers the **SafePay keeper**:

- A Privy **server wallet** that SafePay owns and no user can sign into.
- A Privy **policy** attached to that wallet that allows `eth_sendTransaction` only to the SafePay escrow contract.
- A server route that checks the contract state and the approval deadline, then asks the Privy wallet to send `releaseMilestone`. It records each release and notifies both parties.
- A public **Keeper** page that reads the wallet, its gas balance, the policy rules and past releases live from Privy.

The policy limits the keeper to calls to the escrow contract. It does not restrict the function. The contract itself only pays out after the deadline.

### Dynamic
Dynamic is the only sign-in and the user's wallet:

- Email-code sign-in with a Dynamic embedded wallet on Monad testnet.
- Transactions signed by the Dynamic wallet (create, fund, submit, approve, release, cancel, dispute).
- **EIP-712 typed-data signing** for accepting, declining and withdrawing agreements, verified on the server against the on-chain agreement.
- Message signing to prove ownership when saving a profile, posting a project or applying.
- A short signed message to open a private session for chat and notifications.

Test transactions from a Dynamic wallet: `0x2d1d6e78a1a2bdaa36fb2d7a46ab9d7445c150320412e555a70f7e5e0bd27150`, `0x8f656feeb195b5d5d9bd042576a51d45d71d20df86c50a925c08148f5d49f124`, `0x07b154b994cbede1c99d227db7faa0a3a8f7fa36409e161e15b8f1d6b679ae06`.

### Not included in this submission
Agora AUSD and Instant Settlement, Mera passkey onboarding, Chainlink CRE and NEAR Intents are **not integrated**. SafePay settles in a test ERC-20 token (E20M), not AUSD.

## Deployed contracts (Monad testnet)

| Item | Address |
|---|---|
| SafePayEscrow | [`0x15Ff720De219A9dFF8CC928Fe4F9839c58b74061`](https://testnet.monadexplorer.com/address/0x15Ff720De219A9dFF8CC928Fe4F9839c58b74061) |
| Test payment token (E20M, 18 decimals, open mint) | [`0xA661c5895b5C749118AC51837c7D5C5fdB01Cf27`](https://testnet.monadexplorer.com/address/0xA661c5895b5C749118AC51837c7D5C5fdB01Cf27) |
| SafePay keeper (Privy server wallet) | [`0x25F8FD280DCeb36D935b5Ee4aC11dc32B3A43a1B`](https://testnet.monadexplorer.com/address/0x25F8FD280DCeb36D935b5Ee4aC11dc32B3A43a1B) |

Deployment transaction: [ADD DEPLOYMENT TX HASH]

## Architecture

```
Browser (Next.js, viem)
   |  Dynamic embedded wallet signs transactions and messages
   v
Next.js API routes (Vercel)
   |-- verify signatures and on-chain transactions
   |-- Turso (libSQL): profiles, projects, chat, notifications, acceptances
   |-- Privy server wallet + policy: keeper releases
   v
SafePayEscrow on Monad testnet
```

- **contracts/**: Solidity (Foundry, OpenZeppelin). `src/SafePayEscrow.sol`, tests, deploy and mint scripts.
- **web/**: Next.js app. Pages for agreements, marketplace, chat, notifications, history, activity and the keeper.
- **cre/**: reserved folder, not used in this submission.

## The smart contract

Main functions: `createAgreement`, `fundAgreement`, `submitMilestone`, `approveMilestone`, `releaseMilestone`, `cancelAgreement`, `raiseDispute`, `resolveDispute`, plus `getAgreement`, `getMilestone` and `agreementCount` for reading.

- Agreement states: Draft, Active, Cancelled, Settled. Milestone states: Pending, Submitted, Released, Disputed, Refunded, Split, Cancelled.
- Only the payer funds and approves; only the contractor submits. Only the agreement's resolver can resolve a disputed milestone.
- `releaseMilestone` works for anyone, but only after the milestone's approval deadline.
- Cancellation is blocked while a milestone is waiting for review or is in dispute. A client cancellation pays the contractor the agreed fee, capped at the remaining balance, and returns the rest. A contractor cancellation pays no fee.
- The dispute window cannot be longer than the approval window.
- Milestone amounts must add up to the total. Tokens come from an allowlist.
- Reentrancy protection and safe ERC-20 transfers. Fee-on-transfer tokens are rejected because the received amount must match.
- Custom errors and events for state changes.

## Security and design decisions

- **Secrets stay on the server.** The Privy secret, the Turso token and the Gemini key are never sent to the browser.
- **No trusted browser claims.** Notifications are created only after the server reads the transaction on-chain and checks who sent it and what it did. Acceptances and closures are verified against the contractor's or payer's wallet and the on-chain terms.
- **Private chat.** Reading a chat or notification needs a session proven by a wallet signature, and the server checks that the wallet is one of the two people in the conversation. Files always download and are never rendered in the page.
- **One-time signatures.** Each signed request uses a nonce that is deleted when used.
- **Rate limits.** Blockchain reads are throttled client-side, and the AI helper is limited per visitor.
- **Honest labels.** Demo profiles and projects are marked as demo data and cannot be hired.

## Limitations
  
- **No on-chain "request changes".** A submitted milestone is approved, disputed, or released after its approval deadline. Change requests and updated deliveries are sent in the agreement chat and do not pause the deadline.  
- **Testnet only, unaudited.** Do not use real money. The contract has not been professionally audited.
- **Test token, not AUSD.** Payments settle in a mock token. Display prices in other currencies are conversions for reading only and assume the token is worth about one US dollar.
- **Accept, decline and withdraw are enforced by the app, not the contract.** Someone calling the contract directly could fund an agreement the contractor has not accepted. A declined or withdrawn draft holds no funds.
- **Chat is not end-to-end encrypted.** Messages and files are stored in the database and are readable by the operator. Files are limited to 1 MB each.
- **Marketplace data is off-chain.** Profiles, projects, applications, chat and notifications live in a hosted database. Agreement and payment data live on-chain.
- **No bank connection.** Adding or withdrawing money from a bank account is not available. It would need licensed on-ramp providers.
- **The keeper acts on request.** It sends a release when a milestone is past its deadline and someone asks for it. It is not a continuously running scheduler.
- **Delivery notes are public on-chain.** The contractor's note and link are stored in the milestone's evidence field (about 2,000 bytes), visible to anyone reading the contract.
- **The resolver has no deadline.** Disputed money stays locked until the resolver decides. The app notifies the resolver and allows reminders, but the contract cannot force a decision.

## Run it locally

Requirements: Node 20 or newer, pnpm, Foundry.

```bash
# contracts
cd contracts
forge build
forge test

# deploy (testnet key with MON for gas)
export RPC_URL=https://testnet-rpc.monad.xyz
export PRIVATE_KEY=0x...        # use a throwaway testnet wallet
export RESOLVER_ADDRESS=0x...   # the account that decides disputes
forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast

# mint test tokens to an address
export CLIENT_ADDRESS=0x...
export MOCK_TOKEN_ADDRESS=0x...
forge script script/MintMock.s.sol:MintMockTokens --rpc-url "$RPC_URL" --broadcast

# web app
cd ../web
corepack pnpm install
corepack pnpm dev
```

Create `web/.env.local` with these names (values are yours):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_MONAD_RPC_URL` | Monad testnet RPC |
| `NEXT_PUBLIC_SAFE_PAY_ESCROW_ADDRESS` | Deployed escrow |
| `NEXT_PUBLIC_SAFE_PAY_TOKEN_ADDRESS` | Payment token |
| `NEXT_PUBLIC_SAFE_PAY_RESOLVER_ADDRESS` | Resolver wallet for new agreements |
| `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` | Dynamic project |
| `PRIVY_APP_ID`, `PRIVY_APP_SECRET` | Privy app (server only) |
| `PRIVY_TIMEOUT_RELAYER_WALLET_ID` | Keeper wallet ID (server only) |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Database (server only) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Optional, for the draft helper |

Create the keeper wallet and its policy once:

```bash
cd web
corepack pnpm exec tsx --env-file=.env.local scripts/create-keeper.ts
```

Tests: `forge test` in `contracts/` covers approval and release, cancellation, disputes, timeout release, permissions, milestone totals, window rules and fee-on-transfer tokens. `corepack pnpm test:unit` in `web/` covers currency conversion, token amounts and input validation.

## Roadmap and business model

Nothing below is built yet. It is what SafePay would add next, in rough priority order. Items that move real money depend on licensed partners and local regulation.

### 1. Money in and out
- **Withdraw in your local currency.** Receive a payment in a stablecoin, then cash out to a bank account or UPI in rupees, euros, pesos and more, through licensed off-ramp providers.
- **Add money from a bank or UPI.** The same in reverse, so a payer never needs to know what a token is.
- **Settle in AUSD or another regulated stablecoin** instead of the test token, with fees and rates shown before you confirm.
- **Real exchange rates** from a regulated provider, locked for a short time at the moment you create an agreement, and a clear fee breakdown for cross-border payments.

### 2. Sign in your way
- **Log in with any wallet.** Let people who already have a wallet (MetaMask, Rabby, WalletConnect wallets) sign in with it, so their existing address and funds work in SafePay.
- **Passkey sign-in** (Face ID, Touch ID, or a security key) with no password and no seed phrase.
- **Google and other social sign-in**, plus **linking several sign-in methods to one account**, so a person keeps one wallet whichever way they sign in.
- **Wallet recovery and export** for people who want full control of their keys.

### 3. Trust and disputes
- **Reviews, ratings and reputation** that follow a wallet, with verified past agreements.
- **An independent resolver network** instead of a single resolver, with evidence timelines and appeal.
- **Evidence storage** for photos and documents (for example on decentralised storage), referenced from the milestone.
- **Optional identity checks** for larger amounts, and stronger spam and fraud controls on the marketplace.
- **A professional smart-contract audit**, a bug bounty, and a pause and upgrade plan before any real funds are used.
- **Reject and resubmit on-chain.** Let a payer send a milestone back for changes, with a limit on rejections, so the contractor can deliver again without opening a dispute.
- **Resolver deadlines and backup resolvers**, so a dispute that is ignored is passed on or settled by a default rule.

### 4. A better experience
- **A mobile app** (installable web app first, then native) built around one-tap payments.
- **Alerts by email, WhatsApp and push**, plus reminders before an approval window ends.
- **End-to-end encrypted chat**, voice notes and larger files.
- **Milestone templates** for common jobs (painting, renovation, design, tutoring) and invoices and receipts as PDFs.
- **More languages and currencies** across the whole app.

### 5. More ways to pay
- **Recurring payments**, for example a tutor paid monthly with a release after each session.
- **Teams and multi-party agreements** (a contractor with subcontractors, split payouts).
- **Tips, bonuses and change requests** that add a milestone to a running agreement.
- **Payment links and QR codes** a seller can share, which open a ready-made agreement.
- **Cross-chain funding**, so a payer can fund from the network where they already hold money.

### 6. Automation
- **Scheduled releases** with Chainlink CRE or a dedicated scheduler, so the keeper acts the moment a deadline passes without anyone asking.
- **Webhooks** that tell a platform when an agreement is funded, delivered, released or disputed.

### 7. Business model
- Free for small payments, so everyday people can try it.
- A small protection fee (about 0.25 to 0.75 percent) on larger agreements, paid out of the payment itself.
- An **API and widget for marketplaces and service platforms**, such as home services, freelance sites and tutoring, who want protected payments without building escrow themselves, with a transaction fee.
- Premium features for professionals: branded payment pages, team accounts, reporting and accounting exports.

## Disclaimer

SafePay is a hackathon prototype running on a test network with tokens that have no value. It is not financial or legal advice.