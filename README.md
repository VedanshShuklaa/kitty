# Kitty

**Your circle, minus the collector.**

Kitty is a rotating savings circle (a *susu*, *chama*, *esusu* or ROSCA) on [Monad](https://monad.xyz)
testnet. A group of people who trust each other each put in the same amount every round, and each round
one of them takes the whole pot. A contract holds the money instead of a collector: it takes the
deposits, covers anyone who misses a round, hands out the pot in a fair order, and returns what's left
at the end. Members sign in with a **passkey** (fingerprint or screen lock). There is no seed phrase,
no wallet app, and no gas to find.

Everything runs on testnet with test dollars (Agora's testnet AUSD). It is a hackathon build, not a
financial product.

- Android app: <https://kitty-circle.vercel.app/download>
- Site, invite and money-link pages: <https://kitty-circle.vercel.app>
- Live contract addresses: [`deployments/10143.json`](deployments/10143.json) (verified on MonadVision)

## How a circle works

1. **Create.** The organizer picks the people, the amount and the cadence (monthly down to 1-minute
   practice rounds on testnet). Each seat gets a single-use invite link; names travel only in the
   link, never onchain.
2. **Join.** Each member puts down a deposit (one round's worth by default) and approves exactly what the
   circle can take. The circle starts when every seat is filled.
3. **Pay each round.** Pay by the due time; late payments count until the grace window ends.
4. **Offers (optional).** A member who needs the pot sooner seals an offer: the share of the pot they're
   willing to give up (capped at 30%). Offers are commit-reveal, so nobody sees them until the due
   time. The biggest offer wins; most of what they give up is shared with everyone else as credit
   toward later rounds, and a slice goes to a shared pool. Without offers, the pot goes in payout order.
5. **Misses.** A member who doesn't pay is covered from their own deposit, then from the pool, and
   catches up later. A member who stops paying after taking the pot has defaulted: their deposit and
   the part of their pot held back cover the rounds they still owe, and any shortfall becomes a debt.
6. **Finish.** When every round has run, everyone collects their deposit, their credits, their share of
   the pool and any (simulated) yield.

Rounds close by themselves: any member's app hands out a due pot, and `services/` has a keeper that
does it for everyone. If a round is closed late, the next round's due time moves so its members still
get a full window to pay.

### Standing: Feed the Kitty

Every account has a cat whose trust is the account's standing in `KittyRecord`, written only by circles.
There are six stages: Away, Wary, Shy, Friendly, At home and Family. Kept promises raise it slowly,
counting only people new to you. Misses and defaults lower it fast. Standing sets a member's terms in a
new circle: their place in the payout order, when they may make offers, their deposit (Wary puts down
two), and how much of an early pot is held back. A debt from a default sends the member to the back
of every other circle and pays itself out of their next pot. The cat is a locked (soulbound) ERC-721,
and no circle reads it.

## Architecture

A pnpm monorepo:

| Workspace   | Stack | What it does |
| ----------- | ----- | ------------ |
| `contracts` | Foundry, Solidity 0.8.30, OpenZeppelin | `CircleFactory` deploys each `Circle` as an EIP-1167 clone; `StakeVault` holds deposits and held-back pots per circle and places part of them in a yield adapter; `KittyRecord` keeps standing; `KittyCats` is the cat; `KittyEarnVault` is a testnet stand-in for earnAUSD with simulated yield |
| `app`       | Expo / React Native, viem, `@category-labs/mera` passkeys | Android app: create, join, pay, bid, collect, send and receive, cash out, the cat |
| `site`      | Static pages and Vercel functions | Landing, invite (`/j/`) and money-link (`/p/`, `/s/`) pages, Digital Asset Links for the passkey domain, and the API: gas sponsor, sealed roster and profile storage (Upstash), indexer proxy, cat metadata, exchange rates |
| `indexer`   | [Envio](https://envio.dev) HyperIndex | Circles, payments, standing history, keepsakes, Agora sends, and the earnAUSD rate (Monad mainnet) as one GraphQL API |
| `services`  | Node, viem | The round-closing keeper (`pnpm --filter services keeper`) |

### One passkey, many keys

A passkey's WebAuthn PRF output is the root secret. Every other key Kitty needs is derived from it with
domain-separated HKDF: the account key, each round's sealed-bid salt, each seat's invite key, the
roster key and its per-member wrap, the profile key, and the one-time keys behind send links. A
reinstall on a new phone signs in with the same passkey and gets everything back, including the
ability to open a sealed offer. Nothing secret is stored on the phone or the server.

### Money moves through Agora

Sending money can arrive as dollars (an AUSD transfer) or ready to cash out. Cash-out goes through
Agora's Instant Settlement pair, with the recipient as the swap's `to`, so conversion and delivery settle
in one transaction. Money can also be sent as a link: it waits at a one-time address the recipient
claims with a permit, and the sender can take it back until then.

### Shared test vectors

`test-vectors/` holds worked bid, holdback and pool numbers and cryptographic vectors (commitments,
signatures, derivations). The Foundry suite and the app's Jest suite both read them, so the Solidity
and TypeScript sides can't silently disagree.

## Security

- Contracts: Slither and Aderyn triage, plus a manual review with proof-of-concept tests, in
  [`contracts/audit/README.md`](contracts/audit/README.md). Invariant suites check that money is
  conserved across circles, the vault and the yield adapter.
- No admin power reaches an existing circle's money. The owner can pause new circles and wire the vault
  once.
- The app only joins circles Kitty's factory made, and gives the Agora pair a bounded allowance only
  when a swap needs it.
- The site serves a strict Content-Security-Policy and turns off passkey APIs for its own pages, since
  its domain is the passkey's relying party. Every API write is rate-limited, and signed where it can
  be.

## Getting started

Requires Node 24+, [pnpm](https://pnpm.io) 10 and [Foundry](https://getfoundry.sh).

```bash
pnpm install
cp contracts/.env.example contracts/.env.local
cp services/.env.example services/.env
cp app/.env.example app/.env
```

Tests:

```bash
pnpm test                 # app (Jest), indexer and services (Vitest)
pnpm test:contracts       # forge test, invariants included
```

Run things:

```bash
pnpm --filter app start            # Expo dev server (needs a development build on a phone)
pnpm --filter indexer codegen      # after a schema or config change
pnpm --filter services keeper      # close due rounds; needs KEEPER_PRIVATE_KEY with a little MON
node app/qa/preview.mjs            # sample-data browser preview of the screens (see app/qa/README.md)
```

Deploying contracts: see the header of `contracts/script/Deploy.s.sol`. Deploy the site with
`cd site && vercel --prod` (Git deploys are off on purpose). The indexer deploys from `main` on Envio
Cloud.

## License

Unlicensed / private for now.
