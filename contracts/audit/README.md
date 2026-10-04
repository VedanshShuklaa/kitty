# Static analysis

Slither 0.11 (`slither . --filter-paths "lib/|test/|script/" --exclude-informational --exclude-optimization`)
and Aderyn 0.6.8 (`npx @cyfrin/aderyn@0.6.8 . -o audit/aderyn.md`), run on 4 Oct 2026 against
`src/` before the 4 Oct redeploy. Raw output: [slither.txt](slither.txt), [aderyn.md](aderyn.md).

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
| Missing zero-address checks (Slither missing-zero-check, Aderyn L-8) | All three are set by the factory or the deploy script, never by a user. |
| Centralisation (Aderyn L-1) | The owner can pause new circles and wire the vault once. Neither reaches an existing circle's money (SRS 7.1). |
| Literals, loops that revert, setters without events, public functions not called internally (Aderyn L-3, L-4, L-6, L-7, L-9) | Style. |
