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
