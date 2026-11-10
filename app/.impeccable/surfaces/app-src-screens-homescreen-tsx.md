---
version: 1
slug: "app-src-screens-homescreen-tsx"
primary_target: "app/src/screens/HomeScreen.tsx"
related_targets: ["app/src/screens/WelcomeScreen.tsx","app/src/screens/CircleScreen.tsx","app/src/screens/MeScreen.tsx"]
---

# Kitty app: the website comes home

The user approved a first local pass on welcome, home, circle and account, inheriting the existing website's visual world. This is an extension of that established identity, not a new brand selection. Mode: Operate. Build directly in the existing React Native components and review them through the isolated local web harness.

## Direction contract

**THESIS:** Bring Kitty's website home to the operating app. Money, obligations and the next action lead; the companion supports them.

**OWN-WORLD:** White canvas, deep pink controls, soft blush tiles, warm peach room, locally bundled website cat, Bricolage Grotesque and Figtree.

**STORY:** Understand what is due and who receives; pay through existing protections; visit the cat and read the terms that follow from standing.

**FIRST VIEWPORT:** Welcome: small brand, compact room, introduction and form. Home: identity, balance, money actions, circle obligations. Circle: pot, deadline, recipient and payment status. Account: identity, companion and next step; terms and security below.

**FORM:** Existing website identity, explicitly pinned by the user and confirmed for these four screens. No concept roll or new identity selection: composition follows the approved first-pass description. Code-first app build; no generated comp.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

White canvas; deep pink primary actions; soft blush tiles; warm peach scenery reserved for the cat; existing Bricolage Grotesque and Figtree. The website itself and `.playwright-mcp/website-reference.png` are the visual authority. No reference comp is being generated.

First viewport: welcome pairs a compact wordmark and the website cat room with a short introduction and labelled sign-in form. Home immediately exposes the member, available test dollars and real money actions, then their circles and next obligations; the companion follows the task. Circle leads with its name, pot, round progress and deadline/next-recipient information, with the action before scenery. Account leads with identity, companion and current terms; record and security remain discoverable below.

Signature interaction: reuse the website's cat artwork on welcome as a still, locally bundled scene; keep the existing account pet interaction and reduced-motion-aware payment hop. Buttons respond immediately on press. No decorative screen entrances or continuously moving balances/cats. Routine navigation stays immediate.

## Boundaries

Retain every existing financial, passkey, confirmation, polling and retry path. Do not add financial features or promises. Preserve error, empty, loading, cancelled/completed and hidden-cat states. Do not replace account standing with the welcome brand cat. Shared tokens/components may change to make these four screens coherent; smoke-check adjacent forms afterward. Do not change site source, launcher identity, contracts, deployment addresses or service behavior. Preserve all pre-existing uncommitted edits.

No push, deployment or APK publication. Existing app dependencies only. Browser tooling may be installed under `/tmp/kitty-ui-preview`. Real device verification is deferred at the user's request to test web locally first.

## Quality bar and verification

Match the current site's coherence and artwork fidelity while giving an operating app clearer task hierarchy. No cropped cat ears/tail, nested decorative cards, hidden financial details or decorative motion that delays a task. On 320px/390px phones, 768px tablet and 1440px desktop, content wraps without horizontal overflow and primary actions stay reachable. Check a short display, 1.6× text stress, failed reads, empty home, completed/cancelled circles and every account standing. Verify navigation, welcome validation, refresh, petting and hide-cat controls in the mocked web harness. No live payments.

Baseline: TypeScript and 71 Jest tests passed before changes. After changes, repeat both, run web behavior/layout checks and an Android JavaScript export as a compile check only. Review captured screenshots in one batch, fix material issues, confirm once, then request Impeccable's independent finish review and document the finished system.
