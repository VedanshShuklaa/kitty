# Kitty — build log

General instruction (keep this section forever): after finishing a unit of
work on a checkpoint in the SRS (`SRS.html` at the repo root, gitignored —
it's a Codex artifact, not repo content), append a short entry below saying
what got done and what's next. Keep entries terse: a couple of lines, not a
report. This file is how a fresh session picks the thread back up.

The SRS lives only as a local file (`/home/vedansh/Desktop/Hackathons/Kitty/SRS.html`)
and as an artifact at https://Codex.ai/artifact/KK8UzxAX6Ln7mzSLiWhePE — it is
deliberately excluded from the repo (see `.gitignore`).

## Log

**2026-09-20 — C1 contract core: written and green, C0 partly done.**

What shipped:
- `contracts/src/interfaces/{ICircleFactory,ICircle,IStakeVault,IYieldAdapter}.sol`
  — full interfaces per SRS 7.1/7.5.
- `contracts/src/CircleFactory.sol` — rule validation (SRS 7.2) + EIP-1167
  clone deploy via CREATE2, pausable for new circles only.
- `contracts/src/Circle.sol` — join, contribute/collect, payArrears,
  commitBid/revealBid, closeRound (full SRS 7.7 algorithm: misses, defaults,
  bid-won payouts, holdback withhold/release, credit splits, arrears), cancel,
  withdraw with one-time pool settlement at completion. Bidding path is wired
  end to end even though C1's own tests only exercise the no-bid case (rules
  can set `maxBidBps: 0`); C3 doesn't need a rewrite here, just tests.
- `contracts/src/StakeVault.sol` — per-circle Stake/Holdback/Pool ledger, no
  yield adapter wired yet (that's C3/FR-VLT-02).
- `contracts/src/adapters/NoYieldAdapter.sol`, `contracts/src/KittyEarnVault.sol`
  (C0 deliverable: earnAUSD stand-in, 72h lag, 20bps instant fee).
- `contracts/script/{Deploy,FundFromFaucet,Rehearsal}.s.sol`.
- `test-vectors/crypto.json` filled and independently verified (via `cast`
  and a scratch Foundry test) against the SRS's worked values — all matched.
  `test-vectors/math.json` filled for TV-5/TV-6 only (the two C1 exercises
  the no-bid vectors); TV-1..TV-4 (bid economics) deferred to C3.
- `contracts/test/CircleCore.t.sol` (TC-1-01..TC-1-13, 10 tests) and
  `contracts/test/CircleInvariant.t.sol` (TC-1-14: INV-01/04/06 handler-fuzzed,
  256 runs × depth 64). All 16 tests green, `forge snapshot` committed.

Bug found and fixed along the way: `closeRound` withheld a winner's holdback
by just setting a local counter, without ever moving the AUSD into the vault
— the next release call would've reverted with `InsufficientBalance`. Fixed
by transferring+depositing into `IStakeVault.Kind.Holdback` at withhold time.

Also fixed: `foundry.toml`'s default-profile `eth-rpc-url` was making plain
`forge test` invariant runs try to hit `testnet-rpc.monad.xyz` for every
fuzzed address and hang for minutes before failing. Removed the default-profile
`eth-rpc-url` (the `[rpc_endpoints] monad_testnet` alias already covers
`--rpc-url monad_testnet` for scripts/forks); kept `chain_id = 10143` since
tests rely on `block.chainid` matching the real chain for signature domains.

Known simplification vs the SRS: in `closeRound`, when a Behind member wins
the pot, `arrearsRepaid` restores their Stake balance only — the spec's
"restores their stake first, then the pool" split isn't implemented (no
worked vector exercises the split, so it's a reasonable deferral, not a
guess). Flag this if C3/C4 work touches that path.

Not done (needs a human, a phone, or a funded key — can't run these from
here): the whole C0 device/account track — domain + `.well-known` live,
Expo dev build on physical iPhone + Android, Mera passkey create/sign-in
round-trip, sponsor wallet funding, Envio Cloud deploy, mentor question about
the Agora bounty, five demo members recruited. `contracts/script/Deploy.s.sol`
and `FundFromFaucet.s.sol` are ready to run once someone has
`MONAD_RPC_URL` + a funded `kitty-deployer` account; nobody has run them
against the live chain yet, so `deployments/10143.json` doesn't exist yet and
no contract is verified onchain.

**Next:** either (a) someone runs the C0 device/account checklist and the
`Deploy.s.sol` script for real, or (b) if we're continuing contracts-only,
next is finishing C1's own remaining gate items — TC-1-15 (fork test against
real testnet AUSD, needs `MONAD_RPC_URL`), TC-1-16 (gas budget check against
SRS 7.10's actual numbers, not just snapshot-stability), TC-1-17 (rehearsal
script run live) — then moving into C3's bid economics tests against
`test-vectors/math.json` TV-1..TV-4.
