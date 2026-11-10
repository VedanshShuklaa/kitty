# Mobile design preview

This harness renders the **real React Native screen components** through React Native Web. All account, balance, storage, payment and authentication services are mocked. The tab title identifies sample data. Never ship this entry point.

```sh
npm install --prefix /tmp/kitty-ui-preview react@19.2.3 react-dom@19.2.3 react-native-web esbuild sharp
node app/qa/preview.mjs
```

Open the printed localhost address. Select a screen using `?screen=Welcome`, `Home`, `Circle`, `Create`, `Me`, `MeetCat`, `Cats`, `Paste`, or `Bid`. `Cats` shows the production vector artwork in a QA-only gallery. Use `?empty`, `?offline`, or `?screen=Circle&state=completed` to inspect states. To see Join, paste a structurally valid test invite on Paste. All financial actions are inert and passkey sign-in is mocked.

The development server rebuilds when screen sources change. Native-only keyboard, authentication, safe-area and screen-reader behavior still require a phone. Preview font enlargement is a layout stress test, not native Dynamic Type certification.

## Recorded checks — 2026-10-01

- TypeScript: passed.
- Existing logic/crypto Jest suite: 22 / 22 passed.
- Android Metro/Hermes export: passed. Existing noble/hashes package-export warnings remain nonfatal.
- Seven screens at widths 320, 390 and 768: no horizontal overflow; Join additionally checked at 320 and 768.
- Six screens at 320 × 568 with text enlarged 1.6×: a welcome wordmark overflow was found and corrected by wrapping the branding row.
- Home failed read exposes retry and an unknown balance instead of $0; empty home has a useful explanation.
- Create disabled until valid names and values; onboarding disabled until name and adult checkbox; invalid invite preserves form with guidance; valid invite opens the rules.
- Normal-text contrast pairs checked: ink/white 14.85:1, primary pink/white 6.57:1, slate/paper 5.27:1, slate/soft pink 4.75:1, pink/soft pink 5.51:1, success 6.08:1, error 5.44:1.

Screenshots are sample-data browser renders at 390 × 844, not phone captures:

- [Home](screenshots/home.png)
- [Welcome](screenshots/welcome.png)
- [Circle](screenshots/circle.png)

Before a release, verify native large text, TalkBack/VoiceOver, keyboard-open forms, Android adaptive icon masks, app resume, passkey authentication, and real testnet payment/reconnect behavior. This work does not publish an APK.

## Cat and standing UI — 2026-10-05

- `?screen=Me&stage=Away|Wary|Shy|Friendly|AtHome|Family` exercises each standing. `?screen=Me&standingError` and `?screen=MeetCat&standingError` exercise failed reads. `?screen=Home&paid` shows a full bowl; the default has a due round and an empty bowl.
- `cat-checks.js` is a Playwright page function. With the preview running, pass `app/qa/cat-checks.js` as `filename` to Playwright's `browser_run_code_unsafe`. It checks 320/390/768px layouts, all stages, repayment visibility, petting, keyboard stage selection, the hide-cat toggle, failed reads and 1.6× text at 320×568. It writes review screenshots to `output/cat-ui/`.
- Recorded run: no runtime errors, assertion failures or horizontal/text overflow. Browser adapter deprecation warnings are nonfatal. Mocked financial actions remain inert; this does not verify repayment against the network.
- Preview session references are stable across renders, SVG uses its web entry point, and icon glyphs use the bundled Ionicons font. Do not import QA adapters or `CatGallery` into the production app.
- Final native compilation: TypeScript and the 63-test Jest suite pass. Android Metro/Hermes export passes; existing noble/hashes export warnings remain nonfatal. Native touch, text scaling, screen readers and reduced-motion checks remain a device step.

### Coat and pose refinement — 2026-10-05

`?screen=Cats` now has six coat selectors and Plain/Tabby/Patched controls, backed by fixed addresses covering all 18 deterministic combinations. Each selection shows all six stages plus 32px faces. Midnight is selected initially.

Reviewed all 108 coat/marking/stage combinations and thumbnail SVG bounds: no clipped artwork or runtime errors. The existing cat interaction/large-text checks, TypeScript, 63 tests and Android export pass. Reference captures are in `output/cat-ui/refined-<coat>-<marking>.png`. Native visual confirmation remains a device step.

## Website-inspired app refresh — 2026-10-20

Local branch: `design/website-inspired-app`. Main review screens:

- <http://127.0.0.1:4174/?screen=Welcome>
- <http://127.0.0.1:4174/?screen=Home>
- <http://127.0.0.1:4174/?screen=Circle>
- <http://127.0.0.1:4174/?screen=Me>

The preview also supports `&returning` on Welcome and `&longName` for profile-name stress. Its navigation adapter preserves a route stack and supports Account's Home tab; authentication and financial actions remain mocked. No APK or site deployment is part of this review.

Run `website-refresh-checks.js` through Playwright's `browser_run_code_unsafe` filename argument. It checks the four screens at 320/390/768/1440px, 320×568 with 1.6× text and a long name, circle states, all account standings, welcome validation, selected country semantics, navigation, empty/failed reads, petting, keyboard stage selection, hide-cat and reduced motion. To rerun behavior checks without replacing screenshots, first navigate to `http://127.0.0.1:4174/?checksOnly`.

Recorded result: 29 layout/state cases, no horizontal or text overflow, no undersized controls and no page errors. Eight additional Create/Paste/Bid/MeetCat layouts pass at 320/390px. TypeScript and all 71 Jest tests pass; Android JavaScript export passes as a compilation check. Review captures are local in `.impeccable/review/`, with contact sheets and the browser report in `output/app-refresh/`. Native authentication, safe areas, accessibility and device gestures remain a separate verification step.

## Cat artwork and expressions — 2026-10-20

Open <http://127.0.0.1:4174/?screen=Cats> to select coats/markings and try **Slow blink** / **Happy hello**. Account has petting at `?screen=Me`; Welcome has **Say hello**. All expressions settle without looping. Under reduced motion, petting keeps its static smile/heart/text and welcome shows a static heart with “Kitty says hi ♡” for 1800ms.

Run `cat-expression-checks.js` through Playwright's `browser_run_code_unsafe` filename argument. Start at `?checksOnly` to preserve the captured evidence. It checks all 108 coat/marking/stage combinations, unique SVG fill IDs, 12 main-screen layouts at 320/390/768px, blink/nuzzle settling, repeated taps, reduced-motion preferences (including live changes), background cancellation and hide-cat behavior. The isolated web bundle defines `global` as `globalThis` so React Native Web can cancel animation frames when stopping reactions.

Result: zero browser errors or failed checks; TypeScript and all 71 Jest tests pass, with Android JS export passing as a compilation check. Impeccable's finish review returned ship for local browser review after the reduced-motion hello fix. Artwork and expression-frame captures are in `.impeccable/review/cat-art/`; report in `output/cat-expressions/`. Native animation performance, screen readers and actual phone appearance still need device verification. Nothing committed, pushed or published.

## Original-character correction — 2026-10-20

The user rejected the previous artwork's shape and coloring. That feedback supersedes its finish verdict. `?screen=Cats` now opens with Rose selected and the original website artwork beside the updated companion. Use the source character as the visual reference: same head/ear/muzzle paths, round pupils and seated proportions, with coordinated color ramps for each coat. The existing blink/nuzzle controls and reduced-motion behavior remain.

Current `cat-expression-checks.js` captures go to `.impeccable/review/cat-correction/`. Its expression selectors target the labelled preview rather than the new static reference. All 108 pose combinations and 108 thumbnail combinations fit, fill IDs remain unique, 12 layout cases pass, and expression/accessibility checks report zero errors/failures. The main 29-case browser regression, 71 Jest tests, TypeScript and Android JS export also pass. Reports are in `output/cat-correction/`; native phone verification remains separate. All changes remain local and uncommitted.

## Natural poses from generated concepts — 2026-10-20

The corrected base cat is now user-approved. The built-in image generator produced `output/cat-poses/pose-concepts.png` from the original character before source edits. Its exact prompt/provenance is beside it; this is a local concept, not a bundled bitmap. Wary now crouches with bent forelegs and a rounded rump, At home has a fuller tucked loaf, Family reclines diagonally with four curled limbs, and Shy drapes separate paws over the box rim. Friendly, the face, palettes, portraits and expression engine are unchanged.

Current expression-check captures go to `.impeccable/review/cat-poses/`. Pose-sheet captures temporarily use a taller viewport so all six cells and thumbnails are visible. Review all poses at `?screen=Cats`, or a larger portrait at `?screen=Me&stage=Wary|Shy|AtHome|Family`. Existing tests pass: 108 pose and 108 thumbnail combinations, unique SVG IDs, 12 layout/expression cases, 29 main screen/state cases, TypeScript, 71 Jest tests and Android JS export. Additional local checks confirm petting settles and preserves standing for all four changed poses with normal and reduced motion. Evidence and report: `output/cat-poses/checks.json`. Native phone verification remains pending. Nothing committed, pushed or published.

## Focused Wary / Family correction — 2026-10-20

The user identified these two poses as still unnatural. A new two-pose concept was generated before rebuilding only their body geometry. Wary now reaches forward on bent forelegs with a lower chest, visible elbow, tucked hind thigh and slender resting tail. Family has a longer reclining ribcage, connected curved forelegs, distinct bent thighs/larger hind feet and a thin tail resting outside the body. The old uniform `CurledPaw` helper is removed. Source comparison verifies the face, palette, other four poses, wrappers and expression behavior are unchanged.

Current expression-check captures go to `.impeccable/review/cat-wary-family/`; concept, exact prompt and results are in `output/cat-wary-family/`. TypeScript, all 71 tests, Android JavaScript export, 108 pose/thumbnail combinations, unique gradient IDs and 12 layout/expression checks pass. Petting in both changed poses settles and retains standing with normal and reduced motion. Review directly at `?screen=Me&stage=Wary` and `?screen=Me&stage=Family`. Device verification remains pending; no publication or push.

## Remaining screens in the website identity — 2026-10-23

Create, Join, Bid, Paste, MeetCat, Send, Receive, Scan and Claim now share the Welcome/Home/Circle/Account language through `ui.tsx`: Ionicons replace the old text glyphs (back, close, ticks, step states, row chevrons), lists carry a 1px line border, pressable rows show a chevron, buttons squeeze to 0.97 on press (transform only), and the new `Panel` (hero / tile / outline) and `Facts` components hold money summaries and short labelled figures. No financial logic, copy claim or flow changed.

The preview now renders every screen. Extra flags: `?screen=Send`, `Receive` (`&links` for uncollected send links, `&cashOut` for a cash-out balance), `Scan` (`&camera` granted, `&cameraOff` blocked), `Claim` (`&collected` for an emptied link), and `Join` (opens a sample forming circle; `&already` for an existing member).

Run `screens-checks.js` the same way as the other check files. It covers those screens at 320/390/768px and 320×568 with 1.6× text (no horizontal overflow, every control at least 48px), plus Create validation and summary, Paste's wrong-link notice, Join's terms before money, Bid's adjustment, Send's pick/change, Receive's take-back rows, Scan's permission states and Claim's receipt. Recorded result: 48 layout cases, zero failures and zero page errors; `website-refresh-checks.js` (29 cases) and `cat-expression-checks.js` still pass; TypeScript, 71 Jest tests and the Android JS export pass. These are browser renders, not phone captures.

Review fixes: Join's invite shows the organizer's own standing cat (initials if the cat is hidden) instead of the brand logo, Claim shows the sender's initials, Bid's sealed-offer rule is an outline panel so the money summary stays the only pink hero, four `Facts` sit as a 2×2 grid, initials on pink panels use the white `paper` bead, and the testnet dot centres on the first line at any system text size. Checks re-run afterwards: same results, Android JS export passes.

## Living cats — 2026-11-10

The cats now move like the website cat. `src/catLife.ts` ports `site/public/js/kitty.js`: springs, a 2.5D head turn, eyes that lead, blinks, ear flicks, tail, breathing, and an idle look-around between spots in the room. New reactions: pet (Pet button or a tap on her), dinner on Home after a payment, hello on Welcome, and look-where-you-tap. `src/useCatLife.ts` runs it only while she is visible and Reduce Motion is off, and sheds work on slow phones. `src/WebsiteCat.tsx` draws the website cat (12-joint tail) for Welcome. Small faces under 100px stay still.

Preview flags: `?screen=Home&paid&fed` plays dinner; `?screen=Me` pets on tap. `cat-expression-checks.js` now samples the drawn SVG over time:
- idle motion; blink, pet and hello that settle; dinner crumbs that end; tap-to-pet
- a still cat with Reduce Motion, including when it is switched on mid-motion
- a pause on backgrounding and a resume on return

Recorded: all four check files pass with zero failures and no page errors; TypeScript, 81 Jest tests (10 new in `catLife.test.ts`) and the Android JS export pass. Native frame rate on a low-end Android is not measured yet; the shedding is there for it, but it needs a device check.
