# Kitty

**Your circle, minus the collector.**

Kitty is a rotating savings circle (ROSCA / *chit fund*) on [Monad](https://monad.xyz) testnet. A group
of friends contributes a fixed stake every round; each round the pot is auctioned off via sealed
bid to whoever needs it most (lowest bid wins a discount, everyone else earns interest on the
holdback); the contract — not a trusted organizer — enforces contributions, covers shortfalls from
stake, and pays out the pot. Members join and sign with a **passkey**, no seed phrase, no app-store
wallet extension.

## Why

Traditional ROSCAs run on trust in a human collector. Kitty replaces the collector with a smart
contract: stakes, bids, holdbacks and payouts are all on-chain and auditable, while the app layer
stays as close to "just a phone number and a passkey" as possible.

## How it works

1. An **organizer** deploys a `Circle` via `CircleFactory` with the circle's rules (round length,
   stake amount, discount bounds, member count) and a list of invite signers.
2. Invited members **join**, staking collateral into the circle's `StakeVault`.
3. Each round, members **commit** a sealed bid (a discount they're willing to accept to take the
   pot early), then **reveal** it. The lowest revealed bid wins the round's pot.
4. Members **contribute** their round payment — on time, late, or covered automatically from stake
   if they miss it (`Covered` / `Defaulted`).
5. The winner is **paid out** (`PotPaid`), any arrears are settled, and the round **closes**
   permissionlessly — the app (or anyone) can trigger it, so there's no single point of failure.
6. When every round has run, the circle **completes** and remaining stake, plus any yield accrued
   in the `StakeVault`, is settled back to members.

## Architecture

A pnpm monorepo, one workspace per concern:

| Workspace   | Stack                                                    | Role                                                                 |
| ----------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| `contracts` | Foundry, Solidity 0.8.30, OpenZeppelin                    | `CircleFactory`, `Circle`, `StakeVault` — the source of truth        |
| `indexer`   | [Envio](https://envio.dev) HyperIndex                     | Indexes circle/member/round/payment events into a GraphQL API        |
| `services`  | Fastify, viem, Postgres                                   | Gas-sponsorship for invited joiners, a permissionless round-closing keeper, reminder push notifications |
| `app`       | Expo / React Native, viem, passkeys via `@category-labs/mera` | The member-facing app: create/join circles, bid, pay, no seed phrase |
| `site`      | Static HTML                                                | Join-link landing page + app-site-association files for passkey deep links |

Deployed to **Monad testnet** (chain id `10143`).

### Keys, without a seed phrase

The app never asks for a seed phrase. A passkey's PRF output is the root secret; every other key
Kitty needs (an EVM signing key, a bid's commitment salt, the roster's wrap key) is derived from it
via domain-separated HKDF, so one passkey unlocks the whole account (`app/src/account/`).

### Shared test vectors

`test-vectors/` holds worked numeric and cryptographic vectors (bid/holdback/cover-pool math,
commitment digests, signatures) that both the Foundry suite (`contracts/test`) and the Jest suite
(`app/src/__tests__`) read, so the Solidity and TypeScript implementations can never silently
disagree on an encoding.

## Status

Toolchain wired and green. `Circle.sol`, `CircleFactory.sol` and `StakeVault.sol` are written and
tested (16 Foundry tests, invariants included) — join, contribute, sealed bids, ordered payouts,
covers and defaults, holdback withhold/release, and completion/withdrawal. Not yet deployed to
testnet: that, plus the physical-device passkey checklist, is next. See `CLAUDE.md` for the
running build log.

## Getting started

Requires Node 24+, [pnpm](https://pnpm.io) 10, and [Foundry](https://getfoundry.sh).

```bash
pnpm install
forge install --root contracts   # vendor contracts/lib if not already present

cp contracts/.env.example contracts/.env
cp services/.env.example services/.env
cp indexer/.env.example indexer/.env
cp app/.env.example app/.env
```

Run everything's tests:

```bash
pnpm test              # app, indexer, services (vitest/jest)
pnpm --filter contracts test   # forge test, from contracts/
```

Run a workspace directly:

```bash
pnpm --filter app start        # Expo dev server
pnpm --filter services exec tsx src/api/server.ts   # local API
pnpm --filter indexer codegen  # regenerate Envio types after a schema/config change
```

## License

Unlicensed / private for now.
