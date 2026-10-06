# Static analysis

Slither 0.11 (`slither . --filter-paths "lib/|test/|script/" --exclude-informational --exclude-optimization`)
and Aderyn 0.6.8 (`npx @cyfrin/aderyn@0.6.8 . -o audit/aderyn.md`), run on 4 Oct 2026 against
`src/` before the tier-attestation redeploy. Raw output: [slither.txt](slither.txt), [aderyn.md](aderyn.md).

## Fixed

| Finding | Tool | What changed |
| --- | --- | --- |
| `withdraw` ignored what `vault.take` paid | Slither unused-return | `Withdrawn` now reports what actually moved. Settlement leaves the vault liquid, so the amounts already matched in practice; the event no longer depends on that. |
| `setInstantRedemptionFeeBps` changed a fee silently | Slither events-maths | Emits `InstantRedemptionFeeSet`. |
| `createCircle` marked the circle after calling it | Aderyn H-1 | `_isCircle` is set before `initialize` and `registerCircle`. |
| `nonReentrant` after another modifier | Aderyn L-5 | Moved first on `payArrears`, `StakeVault.take`, `rebalance`, `settle`. |

## Reviewed, no change

| Finding | Why it stays |
| --- | --- |
| Reentrancy, state written after an external call (Slither reentrancy-no-eth/benign/events, Aderyn H-1) | Every Circle and StakeVault entry point that makes an external call is `nonReentrant`. The callees are AUSD, Kitty's own StakeVault (an immutable of the Circle implementation) and the vault's yield adapter, which the owner sets once (`setAdapter` reverts a second time). None of them can call back into a circle. |
| Strict equality on `totalShares == 0` (Slither incorrect-equality) | The first-deposit case of a share vault. Shares can't be donated, so the comparison can't be forced. |
| `block.timestamp` comparisons (Slither timestamp) | Rounds are minutes to months long; a validator's few seconds of drift don't change an outcome. |
| External calls in a loop (Slither calls-loop, Aderyn L-2) | Loops run over a circle's members, at most 12, against Kitty's own vault. `closeRound` with 12 members, bids, a miss and a default costs 623k gas against a 1.2M budget. |
| `tryRecover`'s third return ignored (Slither unused-return) | It's the error argument; the error code itself is checked. |
| Missing zero-address checks (Slither missing-zero-check, Aderyn L-8) | `setTierAttestor(0)` is how discounts are turned off. The other three are set by the factory or the deploy script, never by a user. |
| Centralisation (Aderyn L-1) | The owner can pause new circles, set the attestor, and wire the vault once. None of it reaches an existing circle's money (SRS 7.1). A bad attestor can only lower stakes inside a circle's own rule, never below 50% (SRS 7.11). |
| Literals, loops that revert, setters without events, public functions not called internally (Aderyn L-3, L-4, L-6, L-7, L-9) | Style. |

## Manual review, 5–6 Oct 2026

A line-by-line review of `src/`, with proof-of-concept tests run in a scratch copy. It found no
conservation bug and no way for a member to block `closeRound`. Regression tests are in
`test/Hardening.t.sol` (`ReviewFixesTest`, `KittyEarnVaultTest`).

### Fixed

| Finding | What changed |
| --- | --- |
| `KittyEarnVault.deposit` was open to anyone. With no shares out, a first depositor could take one share, donate to lift the price, and round StakeVault's next deposit down to zero shares, keeping a yield circle's collateral. Anyone could also farm the simulated-yield reserve. | Only depositors the owner sets can deposit; the deploy script sets StakeVault. |
| A frozen pot recipient (AUSD's issuer can freeze addresses) made `closeRound` revert forever, locking every member's stake. | The pot is sent with `trySafeTransfer`; if that fails it waits as the recipient's credit. |
| A round only opens when the previous one closes, but its due time was fixed. A late close (no keeper, an RPC outage) left no window, so every member was covered as a miss and lost a stage. | `dueTime` of the current round is at least `openedAt + commitWindow`, so a late-opened round gets a full window. An on-time close leaves the schedule unchanged. `services/` now has a keeper. |
| At exactly `due + grace` both a payment and `closeRound` were legal, so ordering within a block decided whether a payer was covered. | Payments and reveals stop when `closeRound` opens. |
| The instant-redemption fee could be set to 100%, letting the owner keep yield-circle collateral. | Capped at 100 bps (mainnet's is 20). |
| A repayment after settlement, with every other member defaulted, went to a pool that is never split again. | It goes back to the repayer's credit. |

### Open, by design or out of scope for testnet

| Finding | Status |
| --- | --- |
| Standing can be farmed: a ring of fresh accounts running 2-member circles with each other reaches Family in about two weeks on testnet (the PoC, at 600 s rounds), because collateral and contributions all come back to the ring. One ring member then took a real 12-member circle's first pot and defaulted. | A design question for the trust model, not a code bug. Options: count only circles of 6 or more toward points, age-gate At home and Family on real time, or weight points by money at risk over time. Practice circles in the demo rely on small circles earning points, so this is left for a deliberate decision. |
| `KittyRecord.arrearsCleared` forgives the account's latest miss even when it happened in a different circle. | Low. Fixing it changes the record, and redeploying the record resets everyone's standing; deferred. |
| On testnet `factoryDelay` is 0 and one key owns the vault, factory, record and earn vault. | Testnet convenience; a mainnet deploy uses the 48-hour delay and separate keys. |
| The record's 256-bit "met" filter gives false positives (about 5% at 30 people, 30% at 100), so long-lived accounts slowly earn less. | Known trade-off of a fixed-size filter. |
