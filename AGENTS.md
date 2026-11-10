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

**2026-10-01 — C2 mobile UI refreshed in Kitty pink.**
Redesigned welcome, home and circle summaries; themed all flows; added generated kitty logo/launcher assets, larger accessible controls, keyboard handling and clearer failed-read/retry states. `UI_GUIDE.md` and `app/CLAUDE.md` define frontend rules. TypeScript, 22 tests and Android export pass; browser layout checks cover small phones/tablets.
Next: build a new preview APK and check native text scaling, keyboard, screen readers, launcher masks and two-phone payment flows. No APK published in this change.


**2026-10-05 — Cat and standing UI rebuilt from “Feed the Kitty”.**
Added logo-inspired vector cats in six poses/coats, shared house residents and portraits, a companion panel with harmless petting, an explorable stage guide, keepsake tiles and clearer standing-read/debt states. Repaired sample preview; TypeScript, 63 tests, Android export and browser layout/interaction checks pass.
Next: review `?screen=Cats` and Account in the preview, then check native text scaling, screen readers, reduced motion and live payment reactions on phones. No APK published.


**2026-10-05 — Cat artwork polish, including Midnight.**
Refined all six palettes, face/body proportions, crouch/loaf poses and four-paw belly pose; Midnight now has blue-charcoal fur, a silver muzzle and amber eyes with dark pupils. Gallery covers every coat/marking; 108 stage combinations fit their bounds, with app checks still green.
Next: review the coat selectors in `?screen=Cats`, then confirm the vector artwork at native phone sizes.

**2026-10-06 — Android naming and Play release preparation.**
Confirmed Kitty's native name is correct; Expo supplies the numbered APK filename and the current artifact expires October 20. Saved a named APK copy locally; made production AAB/versioning and internal-draft submission explicit; added `app/RELEASE.md`.
Next: host `Kitty.apk` permanently and update `/download`; set up Play Console, privacy/deletion pages and declarations, build/upload an AAB, add the Play signing fingerprint and test on phones. No website or store deployment performed.


**2026-10-06 — Generalized story and camera-free production kit.**
Added the HTML research, scripts, submission answers and AI production guide at `docs/index.html`; generalized preview/helper names and circle copy. Built a 90-second motion study with verified landscape/portrait MP4 exports and captions; 71 app tests, TypeScript and Android export pass.
Next: review the HTML pack, add optional narration and genuine device/sponsor evidence, then confirm current submission requirements. No publication or live transaction performed.

**2026-10-08 — Monad research and Kitty follow-up posts.**
Added `docs/monad-field-notes.html` with six sourced pitch/demo/public-build cases, historical-status qualifications and Kitty takeaways; added `docs/kitty-followups.html` plus text download with ten short posts, two feedback templates and media directions. Reused the existing docs styling; local links, 320/390/1440px layouts, character limits and clipboard/fallback checks pass.
Next: start with the round explainer; confirm the Android download before inviting testers and capture a genuine native payment before using the proof draft. Nothing posted, scheduled or deployed.

**2026-10-09 — First recorded demo draft in demo-GPT.**
Built a 6:56 silent 1080p film and Claude-derived six-reel deck with cropped native onboarding, a secure-prompt privacy card, new circle/Agora recordings and 34 verified Monad testnet receipts. All 57 slides, responsive review pages and full MP4 decode pass; app and Claude source are unchanged.
Next: review `demo-GPT/draft/README.html`, add voiceover, capture WhatsApp Message yourself and remaining native lock/recovery/two-device proof, then trim to the confirmed submission limit. No message, publication or submission performed.

**2026-10-10 — Demo shortened to the three-minute limit.**
Added `demo-GPT/draft-02/`: preserved the opening, removed the browser pointer, shortened navigation/waits, and wrote a conversational 330-word script. Exported 3:30 at 1× and 2:55 at 1.2×; 13 slides, both full video decodes and responsive review checks pass.
Next: review the shorter cut and record voiceover over the 2:55 file at normal player speed. Existing WhatsApp/native proof capture slots remain; this edit uses the same verified testnet session and performs no new transactions or publication.

**2026-10-20 — Website-inspired app first pass, local review only.**
On `design/website-inspired-app`, refreshed welcome, home, circle and account with the website's white/pink surfaces and local cat-room artwork; put payment status before scenery and improved web accessibility states. TypeScript, 71 tests, 37 browser layout/state checks and Android JS export pass; Impeccable's independent local-web review returned ship.
Next: review the four screens at localhost:4174, then refine from feedback and verify native devices. Existing local edits were preserved; nothing committed, pushed, deployed or published. User's final go-ahead is required before any push.

**2026-10-20 — Plush cat artwork and bounded expressions, local review.**
Refined six coats with shaded fur, glossy eyes and clearer paws; added greeting blinks, petting nuzzles and a reduced-motion-safe welcome hello. TypeScript, 71 tests, 108 art combinations, browser interactions/layouts and Android JS export pass; Impeccable's local-web finish review is clear.
Next: review Cats, Account and Welcome at localhost:4174, then verify native animation/accessibility on phones. No commit, push, APK publication or deployment; final go-ahead still required before pushing.

**2026-10-20 — Cat artwork restored to the original character.**
After user feedback on the prior shapes/colors, reused the website cat's face paths, round pupils, seated proportions and pink ramps; coordinated all six coats and compacted the reclining pose. Added an original/updated comparison; TypeScript, 71 tests, 108 pose/thumbnail combinations, browser checks and Android JS export pass. A fresh Impeccable review returned ship for local browser fidelity.
Next: review `?screen=Cats` and Account at localhost:4174, then verify on phones. The previous artwork verdict is superseded; nothing committed, pushed, deployed or published.

**2026-10-20 — Natural poses from generated concepts.**
Kept the user-approved base cat, generated a four-pose concept sheet, then refined Wary, Shy, At home and Family with supported crouching, draped paws, a tucked loaf and a diagonal side-roll. TypeScript, 71 tests, 108 pose/thumbnail combinations, web interactions/layouts and Android JS export pass; independent Impeccable review returned ship for local web.
Next: review `?screen=Cats` or `?screen=Me&stage=Family` at localhost:4174, then verify native devices. Concepts and prompt are in `output/cat-poses/`; face, colors and Friendly remain fixed. Nothing committed, pushed, deployed or published.

**2026-10-20 — Wary and Family anatomy corrected.**
Generated focused concepts and rebuilt only Wary/Family with supported forelegs, connected shoulder/hip anatomy and slimmer tails; approved base and four other poses preserved. TypeScript, 71 tests, 108 pose/thumbnail combinations, web expressions/layouts and Android JS export pass; fresh independent Impeccable review returned ship for local web.
Next: review `?screen=Me&stage=Wary` and `?screen=Me&stage=Family` at localhost:4174, then verify phones. Evidence is in `output/cat-wary-family/`; the previous verdict is superseded for these two poses. Nothing committed, pushed, deployed or published.
