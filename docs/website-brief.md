# Kitty website — brief for mockups

Working notes for the new marketing site. Nothing here is built yet. Sources: `UI_GUIDE.md`,
`app/src/theme.ts`, `app/src/Cat.tsx`, `app/src/standing.ts`, `app/src/house.ts`, the current
`site/public/index.html`.

## 1. What Kitty is (one paragraph)

Kitty is a savings circle on your phone for people who already trust each other — the same thing
as a susu, chama, esusu, tontine or committee. Everyone puts in the same amount each round, and each
round one person takes the whole pot, until everyone has had a turn. Kitty takes the person in the
middle out: nobody holds the money (contracts on Monad do), sign-up is a fingerprint (passkey, no
seed phrase, no gas), invites go out on WhatsApp, a deposit covers a missed payment, and anyone
who needs the pot sooner can make a sealed offer to give up a little of it. Each member has a cat
whose trust grows when they pay on time; her stage decides payout order and deposit in the next
circle. Money can also be sent to family abroad and cashed out via Agora. Android only, testnet,
test dollars.

Current tagline on the live site: **"A savings circle for people who already trust each other.
Nobody holds the money."**

## 2. The story the page should tell

1. **Start a circle** — name it, add your people, pick amount and how often.
2. **Send the invites** — each person gets their own WhatsApp link; it opens Kitty and takes their seat.
3. **Everyone pays, one person takes the pot** — next in line, or whoever offers to give up a little to go sooner (sealed offers, revealed at close).
4. **Everyone gets a turn** — deposits cover a miss; at the end deposits come back.
5. **Feed the Kitty** — your cat's trust is your record. Pay on time and she moves in.
6. **One fingerprint, no wallet** — passkey sign-in, gas paid for you, restore on a new phone with the same passkey.
7. **Send home** — send test dollars to anyone, ready to cash out (Agora Instant Settlement).
8. **Download** — Android APK (`/download`, redirects to the latest GitHub release).

Proof points available: live on Monad testnet, contracts verified, Envio indexer (~1–3 s from
block to feed), 130 contract tests, real-phone demo videos in `../demo-claude/phone/exports/`.

Words to use: circle, round, pot, deposit, offer, test dollars. Avoid in headlines: wallet, gas,
token, blockchain, credit score, rating. Never call standing a score.

## 3. Brand

### Palette (from `theme.ts`)

| Role | Hex |
|---|---|
| Paper (page background) | `#F8F6F7` |
| Surface | `#FFFFFF` |
| Ink (text) | `#32232D` |
| Primary pink (buttons, active) | `#AD245F` |
| Soft pink (panels) | `#FCE5EF` |
| Bright pink (decoration only) | `#EC7BAD` |
| Logo cream | `#FAFBE6` |
| Secondary text | `#71636C` |
| Divider | `#E8DEE3` |
| Paid / success | `#246448` on `#E4F2E9` |
| Late / error | `#AC3434` on `#FCE9E6` |

White text on primary pink; dark text on soft pink. Bright pink never as small text on white.

### Type

- Headings: **Bricolage Grotesque** (500 / 700 / 800).
- Body and controls: **Figtree** (400 / 500 / 700).
- Both on Google Fonts.

### Shape

Spacing 4 / 8 / 16 / 24 / 32 / 48. Radii: controls 16, cards 22, hero blocks 28, pills.
The app avoids gradients, glass and heavy shadows; the site can be richer, but the colours above
should stay recognisable.

### Logo

Square, front-facing upper half of a pink cat on cream (`#FAFBE6`): rounded ears with pale-pink
inner ear, broad round cheeks, closed happy "^ ^" eyes, small dark-rose nose, "w" smile, three
whiskers per side, light muzzle patch, two chunky paws resting on the bottom edge. No lettering.
Files: `app/assets/kitty-icon.png` (1024), `kitty-logo.png` (384), `site/public/og.png`, icons
192/512. The wordmark on the site is lowercase **kitty**.

## 4. The cat

### Anatomy (from `Cat.tsx`, all SVG)

Flat vector, no outlines — shapes in fur colour with darker "shade" and lighter "light/muzzle"
tones. Head is wider than tall, cheeks bulge past the eyes, ears are rounded triangles, muzzle is
a wide pale oval, soft blush ovals on the cheeks. Eyes are tall dark ovals with one white
highlight (or curved lines when happy/closed). The 3D cat should keep these proportions so it reads
as the same character as the logo and the app.

### Six coats (each account gets one, derived from its address)

| Coat | Fur | Muzzle | Eyes |
|---|---|---|---|
| Rose (logo) | `#EC7CAB` | `#FBD2E2` | `#92204D` |
| Cream | `#DEBD90` | `#FAEDDA` | `#67442F` |
| Cocoa | `#906957` | `#E5C1AA` | `#34292A` |
| Smoke | `#969CAF` | `#E5E6ED` | `#38435D` |
| Ginger | `#E7A066` | `#FCE0BB` | `#704327` |
| Midnight | `#343B53` | `#B4BFD3` | amber `#EBC47B` with pupils |

Plus three markings: none, forehead stripes, one eye patch. The site cat should be **Rose** (it is
the brand). A coat switcher or a row of the six could be a nice extra.

### Six stages (standing) — the cat moves closer as trust grows

| Stage | Pose | Line in app | What it changes |
|---|---|---|---|
| Away | empty box + pawprints | "is staying with the neighbours" | owes money; can't join |
| Wary | under a bench, ears flat, narrow eyes | "keeps her distance" | paid last, double deposit, no offers |
| Shy | peeks out of a cardboard box, wide eyes | "is watching you from her box" | offers from second half |
| Friendly | sits, tail up, happy eyes | "walks up to greet you" | paid before newcomers |
| At home | loaf on a pink cushion, eyes closed | "is at home with you" | earlier payout, more circles |
| Family | belly-up on the cushion, paws in air | "is family" | paid first |

Points: up to +100 per finished circle (only with people new to you), a covered miss drops one
stage, a default drops to Away.

### Moods and props

- Bowl next to her: empty (a round is due), full (paid). Pink bowl, kibble.
- Petting in the app: happy eyes + a small pink heart.
- After paying she hops once.
- **The house**: a cardboard box that gains one piece per round where everyone paid, up to twelve.
- **Keepsakes**: Yarn ball (pay on time), Feather wand (3 on time in a row), Fish supper (receive a
  pot), Name box (finish a circle), Golden bowl (every round on time).

Good material for the room scene: cushion, bowl, cardboard box, bench, yarn ball, feather wand.

## 5. Site concept (to mock up)

**Hero: the cat's room.** A cosy 3D room in cream and pink (arched window like the app's
`CatScene`, warm floor, the pink cushion). The Rose cat sits Friendly on the cushion, bowl beside her.

- **Head tracking:** only the head turns (yaw/pitch, clamped ~±35° / ±20°) toward the pointer, with
  easing; body stays still. Eyes can lead slightly ahead of the head. Occasional blink.
- **Download hover:** eyes light up (emissive glow, pink or warm gold), maybe ears perk up; on
  click a happy "^ ^" squint. Keyboard focus on the button should trigger the same thing.
- **Idle:** when the pointer leaves or stops, head drifts back to centre; slow tail sway.
- **Touch / mobile:** no pointer, so follow scroll position or a tap point, or device tilt. Must
  still look good static.
- **Reduced motion:** static pose, no tracking.

**Below the hero**, possible sections: how a circle works (4 steps), the cat's six stages as a
scroll-driven sequence (she moves from box → bench → sitting → loaf → belly-up as you scroll),
sealed offers, passkey sign-in, send home, proof (testnet, verified contracts, indexer), download.

## 6. Must keep

- "Test dollars on Monad testnet" disclosure on the page; no real-money claims, no promised returns.
- Same honesty as the app: Android only, restore needs the same passkey, no iOS.
- The site is also the passkey RP (`kitty-circle.vercel.app`): `/.well-known/assetlinks.json`,
  `/j/*` invite pages, `/p/` `/s/` money pages, `/api/*`, `/download` and the headers in
  `site/vercel.json` must keep working. The new landing should replace only `index.html` and its
  assets, or keep those routes intact if the stack changes.
- The CSP in `site/vercel.json` limits scripts; a 3D library (e.g. three.js) needs it updated.
- Deploy only with `cd site && vercel --prod` (Git deploys are off).
- Page weight: the audience is on older Android phones and expensive data. Keep the 3D model small
  (compressed glTF), lazy-load it, and show the logo image while it loads.

## 7. Open questions

1. 3D model: model it (Blender, Spline) or build from primitives in three.js? Spline is fastest for mockups.
2. Stylised flat look (toon shading, matches the SVG) or soft clay/plush 3D?
3. Which stage sits in the hero — Friendly (sitting, best for head turns) or At home (loaf)?
4. Eye glow colour on Download: pink `#EC7BAD` or warm gold?
5. Mobile behaviour: tilt, scroll, or static?
6. Stack: keep plain HTML in `site/`, or move to Vite/Next with React Three Fiber?
7. Who is the page for first — hackathon judges, or circle members? (Changes tone and the proof section.)
