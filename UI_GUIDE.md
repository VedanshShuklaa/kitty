# Kitty mobile UI guide

Read this before changing any frontend code. This is the implementation contract for Claude, Codex, and human contributors. The current direction is **a friendly pink savings app, with clarity before decoration**. The reference is a clean mobile finance dashboard; it is not permission to add charts, cards, services, or balances that do not exist.

## People and purpose

Kitty helps people who already trust each other save in a rotating circle. Design for a wide range of reading confidence, older Android phones, small displays, expensive mobile data, and interrupted connections. Do not assume one language, currency, financial habit, or device capability across African countries. Validate with people in the actual launch market. English is currently the only implemented language; country selection does not imply localization or local payment support.

The questions every circle screen must answer are: How much do I pay? When? Who receives next? Who has paid? What happens if someone misses? Keep financial information explicit and calm. The kitty belongs in onboarding and branding, not over a payment confirmation or an error.

## Source of truth

- `app/src/theme.ts`: all color, type, spacing, and radius tokens.
- `app/src/ui.tsx`: typography, buttons, fields, choices, notices, shared screen layout.
- `app/src/Brand.tsx`: bundled Kitty logo and labelled bottom navigation (Ionicons from `@expo/vector-icons`, outline when inactive, filled when active; the font ships in the bundle).
- `app/src/phase.ts`: financial action availability and shared rules in words. Do not reproduce its logic in a decorative component.
- `app/src/kitty.ts`: real amounts and actions. Never replace live data with preview values.
- `app/qa/preview.mjs`: isolated browser preview of actual screens with sample data. Not a working web wallet, payment app, or production entry point. Its mocks predate the send, indexer and standing modules (4 Oct), so it needs new mocks before it renders Home, Me or Join again.

Legacy token names (`indigo`, `marigold`, etc.) remain as compatibility aliases. New styling should use `ink`, `pink`, `pinkSoft`, and semantic status colors. Do not bring the previous blue/gold theme back.

## Palette

| Role | Token | Hex | Use |
|---|---|---|---|
| Background | `paper` | `#F8F6F7` | Screen canvas |
| Surface | `surface` | `#FFFFFF` | Cards and fields |
| Main text | `ink` | `#32232D` | Balances, headings, body |
| Primary pink | `pink` | `#AD245F` | Primary buttons, active navigation, selected controls |
| Soft pink | `pinkSoft` | `#FCE5EF` | Balance and pot summaries |
| Bright pink | `pinkBright` | `#EC7BAD` | Decorative details; never small text on white |
| Logo cream | `cream` | `#FAFBE6` | Logo backdrop and quiet explanation panels |
| Secondary text | `slate` | `#71636C` | Supporting text |
| Divider | `line` | `#E8DEE3` | Card boundaries and separators |
| Paid / success | `leaf` / `leafSoft` | `#246448` / `#E4F2E9` | Always pair with a word such as “Paid” |
| Error / late | `clay` / `claySoft` | `#AC3434` / `#FCE9E6` | Explain what happened and what to do |

Use white text on primary pink, and dark text on soft pink. Main text and meaningful status text must meet WCAG AA contrast (4.5:1 for normal text). Color alone must never communicate paid, late, selected, or failed. Do not use gradients, glass effects, low-contrast grey body text, floating decorative graphs, or shadows on every card.

## Typography and space

Bricolage Grotesque gives headings a friendly character; Figtree is the reading and controls font. Import individual font weights so unused font files do not enter the app bundle. Fonts and logo are local assets; the app must not download them at launch.

| Element | Size / line height |
|---|---|
| Welcome display | 34 / 40 |
| Screen title | 26 / 31 |
| Section heading | 18 / 24 |
| Body | 16 / 24 |
| Supporting text | 14 / 20 |
| Main amount | 40 / 44, tabular figures |
| Buttons | 16, bold |

Keep operating-system text scaling enabled. Do not shrink text to fit a long name or amount. Wrap text and let content grow. Important names, amounts, errors and actions must not use single-line truncation. The 12px testnet marker is the exception to the 14px supporting-text floor.

Use the 4 / 8 / 16 / 24 / 32 / 48 spacing scale. Default horizontal screen padding is 16. Controls have 16px corners, cards 22px, hero summaries 28px. Round shapes should group related information, not turn every line into a separate card.

## Layout and hierarchy

Use the shared `Screen`, which supplies safe areas, keyboard avoidance, pull-to-refresh support, and a centered 600px maximum content width on tablets. Footers are fixed on ordinary phone screens; on screens below 650px height or with font scale above 1.3 they join the scroll content so the body stays accessible. Never overlay a payment button over unreadable content.

Home:

```text
Test-dollar marker
Kitty · greeting · account
Available test dollars + Add test dollars
Start a circle | Join a circle
Your circles + attention count
Circle name, next action, paid/joined progress
How saving together works
Home | Join circle | Account
```

Circle:

```text
Back + test-dollar marker
Circle name
Pot amount, round, paid count, next recipient
Current status + due time
Other available actions
Members with written payment states
Invites (when forming), rounds, rules
Primary payment / collect action
```

Keep the pot summary compact. The previous large decorative bead ring must not displace the amount or due status. Progress bars supplement the written counts. Bottom navigation always has text labels and only real destinations. Avoid invented notifications, cash-out controls, support buttons or local mobile-money integration.

## Controls and accessibility

- Touch targets are at least 48 × 48 logical pixels. Main buttons are at least 56px high, expanding with text.
- Use `Button`, `Field`, `Label`, `Choice`, `Check`, `Notice`, `Tag`, `Progress` and `LinkText` before adding another control style. A button inside a list row is `size="row"` (48px tall), never a one-off `minHeight`. Links out of the app (the public record) are `LinkText`, which keeps a 48px target.
- Selected states are pink everywhere: choices, checkboxes, the active tab, the bid slider. Tags are 14px.
- Progress is `Progress`: a written count beside it, an accessible label and value, 8px tall; `onSoft` on a pink summary.
- Initials beads are decorative and hidden from screen readers; the written name beside them is what gets read. Each `Steps` row reads as "Step 2, Approving payments: in progress".
- One clearly dominant action per task. Action labels describe the result: “Pay $10”, “Join and put down $10”, “Create circle”.
- Persistent input labels; placeholders are examples, not labels. `Field` sets an accessible name and visible pink focus border.
- Choices use radio semantics and checked state. Buttons expose disabled/busy state and remain labelled while waiting.
- Do not rely on precision dragging: the bid slider also has “Give up less / more” buttons.
- Preserve back navigation, keyboard access, VoiceOver/TalkBack labels, and visible focus. Test actual native focus order before release.
- Keep motion optional. No continuous mascot animation, confetti, pulsing controls, or animated balances. Existing ring animation respects reduced motion if reused.

## Standing (SRS 6.13, FR-TRU-11)

Standing is a named tier (Newcomer, Steady, Trusted, Anchor) with the one plain next step that raises it, never a number out of a maximum, a bar or a percentage complete, and never the words credit, score, rating or collateral. It only ever helps: copy must not imply a penalty below where a newcomer starts. Before joining a circle that allows smaller deposits, show the deposit this member will put down, the usual one, and who is already in with their standing.

## Copy and financial trust

Use short, direct sentences. Consistently use “circle”, “round”, “pot”, “deposit”, and “test dollars”; explain unfamiliar terms in context. Avoid wallet, gas, token, transaction and blockchain in the main flows. Technical account details belong on Account.

Show the exact “Test dollars on Monad testnet” marker on every screen. Never mix demo and real-money claims. Available balance is not the same as accumulated savings. A missing balance is “—”, never $0. Bidding estimates must state their assumptions. Deposit return can be reduced by missed payments; do not promise an unconditional refund or guaranteed returns.

Before commitment, show the amount, timing, deposit, bid cost, and missed-payment rules. Keep existing confirmation, passkey, allowance, retry, and duplicate-payment protections intact. Never add a second payment call to make a button feel more responsive.

Account recovery is not complete: signing in with the same passkey restores the account, but missing circles may require reopening their invite links. Do not claim automatic roster recovery.

## Connections and device cost

Distinguish loading, no circles, failed reads, and last-loaded values. Show a useful retry action or pull-to-refresh path. Keep input after a failure. A success notice follows confirmed success; no optimistic financial balances or fake progress percentages. No payment is supported offline; do not claim otherwise.

Home prevents overlapping reads, polls only while active and focused, and refreshes on app resume. Avoid increasing request frequency or adding remote assets. Full pending-payment recovery after reconnect, local-currency estimates, push reminders, translations, and indexer history remain separate product work, not features implied by this redesign.

## Logo assets

The identity is a square, front-facing upper half of a pink kitty on one light cream background. No full body, lettering, extra scenery, or non-pink fur. Preserve its proportions and surrounding space.

- `app/assets/kitty-icon.png`: 1024 × 1024 master for launcher/splash, about 287 KB.
- `app/assets/kitty-logo.png`: 384 × 384 optimized in-app asset, about 31 KB.
- `app/assets/kitty-favicon.png`: 64 × 64.
- `app/assets/kitty-adaptive.png`: padded Android launcher foreground so mask shapes have room around ears and whiskers.

`app/app.config.ts` wires these into the launcher and splash. Android adaptive icon mask behavior still needs a device check. The older assets are unused historical files, not the current identity.

## Verification before shipping frontend edits

Run `pnpm exec tsc --noEmit` and `pnpm exec jest --runInBand` from `app/`. Build an Android bundle with `pnpm exec expo export --platform android --output-dir /tmp/kitty-android-export`.

For browser layout review, use the commands at the top of `app/qa/preview.mjs`. It bundles the real screens with local mocks and no payment calls. Supported examples: `?screen=Welcome`, `?screen=Circle`, `?screen=Create`, `?screen=Bid`, `?empty`, `?offline`, and `?screen=Circle&state=completed`. This preview is for layout and interaction only; never infer native passkey success from it.

Check 320px and 390px phones, a 768px tablet, short displays, large text, long names, keyboard-open forms, empty and failed reads, disabled/busy controls, and all payment states. Test on actual Android/iOS devices for text scaling, keyboard, safe areas, screen readers, icon masks, and interrupted payments. A web screenshot does not certify these.

Do not publish a new APK or change the download link unless requested. Record frontend work in the root build log and update this guide when the shipped design changes.
