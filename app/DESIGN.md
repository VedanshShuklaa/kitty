---
name: Kitty App
description: Website-inspired Kitty identity for clear rotating savings tasks.
colors:
  pink: "#AD245F"
  pink-soft: "#FCE5EF"
  pink-tile: "#FDEFF5"
  pink-bright: "#EC7BAD"
  ink: "#32232D"
  muted-ink: "#614451"
  slate: "#71636C"
  paper: "#FFFFFF"
  line: "#E8DEE3"
  mist: "#F4EEF1"
  room: "#F8E1D3"
  room-floor: "#EBBF9C"
  cream: "#FAFBE6"
  leaf: "#246448"
  leaf-soft: "#E4F2E9"
  clay: "#AC3434"
  clay-soft: "#FCE9E6"
typography:
  display:
    fontFamily: "Bricolage Grotesque"
    fontSize: "44px"
    fontWeight: 800
    lineHeight: "46px"
    letterSpacing: "-1.2px"
  welcome-display:
    fontFamily: "Bricolage Grotesque"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: "38px"
    letterSpacing: "-0.8px"
  greeting:
    fontFamily: "Bricolage Grotesque"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: "36px"
  title:
    fontFamily: "Bricolage Grotesque"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: "31px"
    letterSpacing: "-0.5px"
  heading:
    fontFamily: "Bricolage Grotesque"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: "24px"
    letterSpacing: "-0.2px"
  amount:
    fontFamily: "Bricolage Grotesque"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: "44px"
    letterSpacing: "-1px"
  body:
    fontFamily: "Figtree"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  small:
    fontFamily: "Figtree"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontFamily: "Figtree"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: "20px"
  field:
    fontFamily: "Figtree"
    fontSize: "17px"
    fontWeight: 400
  button:
    fontFamily: "Figtree"
    fontSize: "16px"
    fontWeight: 700
  tag:
    fontFamily: "Figtree"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: "18px"
rounded:
  control: "16px"
  card: "20px"
  hero: "28px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.pink}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "16px"
  button-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "16px"
  button-quiet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "16px"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.field}"
    rounded: "{rounded.control}"
    padding: "0 16px"
  choice-selected:
    backgroundColor: "{colors.pink-soft}"
    textColor: "{colors.pink}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
  card:
    backgroundColor: "{colors.pink-tile}"
    rounded: "{rounded.card}"
    padding: "16px"
  hero:
    backgroundColor: "{colors.pink-soft}"
    rounded: "{rounded.hero}"
    padding: "24px"
  nav-active:
    backgroundColor: "{colors.pink-soft}"
    textColor: "{colors.pink}"
    rounded: "{rounded.control}"
    padding: "8px 4px"
  companion:
    backgroundColor: "{colors.pink-tile}"
    rounded: "{rounded.hero}"
---
# Design System: Kitty App

## Overview

**Creative North Star: "The website comes home"**

Kitty extends its established website identity into a small-screen operating app: white space, deep pink actions, blush surfaces, expressive local type and a warm cat room. Friendly shapes frame financial information without obscuring amounts, obligations or next steps.

The welcome scene uses the website’s shaded pink brand cat. Account and standing surfaces retain the deterministic six-coat companion and six-stage model, using the original website cat’s facial geometry and seated proportions. These are distinct asset roles within one identity. The standing poses use a low supported crouch with staggered forepaws, a box peek with separate draped paws, a tucked loaf and a side recline with distinct shoulder and hip anatomy. This record describes the finished local web Wary and Family correction; native authentication, screen readers and device behavior require separate verification.

**Key Characteristics:**
- White canvas with blush task surfaces.
- Deep pink actions and explicit financial labels.
- Bricolage Grotesque headings paired with Figtree reading text.
- Flat controls, soft corners and warm companion scenery.

## Colors

Deep pink carries actions against white and two quiet blush surface levels. The frontmatter records reused values from `src/theme.ts`; legacy indigo and marigold names are aliases, not separate palette families.

### Primary

- **Deep Pink** (`pink`): primary actions, amounts, actionable summaries and selected controls.
- **Soft Blush** (`pink-soft`): balance and round-pot panels, selected tabs and choices.
- **Blush Tile** (`pink-tile`): circle summaries, identity, help and companion containers.
- **Bright Pink** (`pink-bright`): the quiet testnet marker and small supporting accents.

### Secondary

- **Room Peach / Floor Tan** (`room`, `room-floor`): companion scenery and the home cat strip.
- **Leaf / Pale Leaf** (`leaf`, `leaf-soft`): successful or paid states with written labels.
- **Clay / Pale Clay** (`clay`, `clay-soft`): errors, arrears and missed obligations with written labels.

### Neutral

- **Warm Ink** (`ink`): primary reading text and dark actions.
- **Muted Ink / Slate** (`muted-ink`, `slate`): secondary text and hints.
- **White Paper** (`paper`): screen, controls and list surfaces.
- **Soft Line** (`line`): dividers, list, quiet button and input strokes.
- **Mist** (`mist`): neutral status tag fill.
- **Pale Cream** (`cream`): supporting brand/art material.

**The Written Status Rule.** Pair every status color or progress bar with readable words or counts.

## Typography

**Display Font:** locally bundled Bricolage Grotesque, bold and extra bold.
**Body Font:** locally bundled Figtree, regular, medium and bold.

Rounded, compact display forms give headings personality while the reading face keeps obligations plain. Source font constants select actual bundled weight files; frontmatter uses portable family names and weight values.

### Hierarchy

- **Display:** the shared large display role; welcome applies the compact `welcome-display` variant.
- **Greeting:** extra-bold member greeting; the wordmark also uses the greeting size with its own tight tracking.
- **Title / Heading:** page and companion titles, then section headings.
- **Amount:** extra-bold balances and pot figures with tabular numerals.
- **Body / Small:** descriptions, terms, secondary information and hints.
- **Label / Field / Button / Tag:** sentence-case controls, input values and readable state labels. The testnet marker uses Figtree medium at 12px.

## Layout

Use a single centered scrolling column, full width up to 600dp. Shared screens use 16dp horizontal gutters, 8dp top inset, 32dp bottom inset and 16dp section gaps. Major money panels use 24dp padding; tiles use 16dp. The spacing scale is 4/8/16/24/32/48dp; frontmatter’s px notation represents React Native logical layout units.

Rows of money actions share available width. Metadata rows, country choices and section headings wrap; the stage guide wraps flexible cells with a minimum width of 82dp. This is not a desktop dashboard grid: wider windows retain the centered app column.

Footers sit outside the scroll region on regular displays, separated by a hairline. Below 650dp height or above 1.3 font scale they become inline scrolling content. Respect safe areas and keyboard avoidance. Web review covered phone through desktop widths; no width breakpoint is implemented for the app column.

## Elevation & Depth

The UI is flat: no shared card or button shadows. Blush surface changes, whitespace and light strokes establish grouping. Shaded cat artwork supplies illustrative depth; this does not imply UI shadow tokens. Welcome and companion scenes share the locally bundled painted room. SVG fur, muzzle and paws use coordinated per-coat gradients; the Rose coat follows the original website’s pink gradient values. Round pupils, the original iris ramps and paired eye highlights preserve the source character’s glossy eyes. Small ground shadows and stitched cushions anchor the standing poses.

**The Two Cats Rule.** Use the website brand scene for welcome; preserve the member’s deterministic standing cat on companion surfaces.

## Shapes

Controls have tighter rounded corners than cards; hero money and companion containers are softest. Pills are reserved for short status tags, circular beads for initials. Scene containers clip artwork at their rounded boundary; readable text is allowed to grow and wrap.

## Components

### Buttons

Confident filled actions with quiet outlined alternatives. Primary uses Deep Pink, dark uses Warm Ink and quiet uses White Paper with a Soft Line stroke. Full controls have a minimum height of 56dp and 16dp padding; row controls retain a 48dp minimum with 8dp vertical padding. Press squeezes the button to 0.97 over 100ms and releases over 160ms (strong ease-out, transform only, on an outer wrapper so it never changes layout), with 0.92 opacity; disabled or busy opacity is 0.45. Busy replaces the label with “Please wait…” and a spinner. Preserve visible web keyboard focus; no bespoke hover color is implemented.

### Chips

Country choices are wrapping outlined controls with a 48dp minimum height. Selection changes the fill to Soft Blush, stroke and text to Deep Pink, and weight to bold. Status tags are noninteractive pills with 10dp horizontal and 4dp vertical padding; color supplements the written status.

### Cards / Containers

Circle, identity and help tiles use Blush Tile; major balance and pot panels use Soft Blush. `Panel` names the three surfaces: `hero` (Soft Blush, hero radius, 24dp padding) for the one money summary a screen leads with, `tile` (Blush Tile, card radius, 16dp) for a quiet group such as a form section, progress steps or rules, and `outline` (white with a Soft Line stroke). Panels never nest. `Facts` sets two to four short labelled figures (each round, people, deposit, pot) side by side in heading type with tabular numerals; they wrap rather than truncate. Lists are white with a 1px Soft Line stroke, hairline separators and 16dp horizontal / 14dp vertical row padding. A pressable row ends in a Slate chevron and presses to Blush Tile. Circle summary press changes the tile to Soft Blush. Initials beads on a pink panel use the white `paper` tone; Mist beads would disappear there. A person shown on a panel is their initials or their own standing cat, never the brand logo (the Two Cats Rule). Keep pot, deadline, recipient and action information together and ahead of optional scenery.

### Inputs / Fields

Visible labels sit above white outlined fields. The input has a 54dp minimum height, 12dp vertical inset and 17dp Figtree text. Focus changes the border to Deep Pink at 2dp. Hints remain below; failures use a written notice and retry action. No distinct input error-border variant exists.

### Icons

Ionicons from the bundled font, outline weight by default: back chevron, row chevrons, notice close, checkbox tick, step done/failed marks, the Paste link kinds and Scan's code mark. Decorative icons are hidden from screen readers; the adjacent words carry the meaning. Unicode glyphs no longer stand in for icons.

### Navigation

Three evenly spaced, labelled destinations: Home, Join circle, Account. Each tab has a 56dp minimum height and control-radius corners. Active Home or Account uses a Soft Blush fill and Deep Pink label; inactive labels use Slate. Press opacity is 0.7. The footer participates in the short-screen/large-type layout behavior above.

### Notices and progress

Neutral status tags use the Mist fill (`#F4EEF1`) so they read on white. Notices use semantic pale fills with matching readable text, a 16dp radius and a labelled close control with a 48dp target. Progress is an 8dp rounded track with a Deep Pink fill; the adjacent written count remains authoritative.

### Companion and brand room

Welcome and account scenes use a 1.65 aspect ratio. Welcome retains hero-radius clipping and the website’s authored pink cat body; a small SVG eye overlay provides expressions. Account’s companion keeps a Blush Tile container, padded header, standing tag, next-step copy and optional pet button. Its six deterministic coats and stage poses retain the original website skull, tall ears, cheek tufts, compact two-lobed muzzle, mouth and whisker geometry. The Friendly pose uses the source seated body, chest and paw proportions; other poses adapt that same character. Wary crouches beneath the bench with a low chest, a visible bent near foreleg, forward staggered forepaws, a separate tucked hind thigh and a slender floor-resting tail. Shy holds its chin above the box rim with two separately draped forepaws. AtHome forms a fuller tucked loaf with a modest chest patch and tail curling around the near flank. Family reclines on a longer ribcage with differently curved forelegs attached at the shoulders, bent thighs and larger hindfeet, small forepaw ends and a thin tail outside the body. Individual limb contours replace the uniform curled-paw helper. Coat-specific head, body, muzzle, paw and ear ramps keep the materials coordinated; Midnight remains blue-charcoal with a silver muzzle and amber eyes. Both scenes use the existing local `assets/kitty-room.webp`; account places the standing SVG over the painted room using cover sizing. The room is reused artwork. The generated four-pose sheet at `../output/cat-poses/pose-concepts.png`, based on `base-reference.png` with prompt/provenance recorded alongside it, and the focused Wary/Family concept at `../output/cat-wary-family/pose-concept.png` with its adjacent prompt/provenance JSON are local body-mechanics references only; the runtime cats remain shared SVG artwork. `src/brandCat.ts` remains the welcome body source; `src/Cat.tsx` owns the standing artwork and the shared `CatEyes` used by both the standing head and welcome overlay, preserving the same resting eye geometry.

Large welcome and non-Away account scenes greet once with a blink after 1500ms: close over 110ms, hold for 70ms, open over 190ms. Small portraits, stage thumbnails and list cats have no idle greeting. `src/useCatExpression.ts` uses in-out quadratic easing and no loops. Pet/reaction feedback adds one 6-degree standing-head nuzzle over 180ms out and 260ms back. The welcome overlay animates eyes only. Expression values and pending greeting timers reset on unmount, app backgrounding or a live reduced-motion enable event; reduced motion skips animated expressions.

Welcome’s labelled “Say hello” control provides a static heart and “Kitty says hi ♡” for 1800ms under every motion preference, announced through a polite live region. Petting keeps its static smile, heart and readable purr message for 2200ms, including with reduced motion. These are local reactions: neither interaction changes standing or financial mood. Hiding the cat preserves standing and terms. The existing payment reaction remains one 8dp hop, rising for 180ms and settling for 270ms, skipped when reduced motion is enabled; no continuous decorative animation is used.

Current local browser evidence lives in `../.impeccable/review/cat-wary-family/`: 19 captures cover six-coat pose sheets, Wary and Family portraits and account screens at 390px/768px, phone/tablet galleries, desktop, small-phone and circle-resident views. `../output/cat-wary-family/checks.json` records 108 pose/thumbnail combinations, 12 layouts, normal/reduced-motion reactions, TypeScript, 71 tests and Android JS compilation. Independent finish review cleared this correction for local web. The user's feedback supersedes the earlier `cat-poses/` verdict for Wary and Family; those earlier portraits are anti-references for these two poses. The earlier `cat-correction/` comparisons remain the approved base-character reference. The QA gallery opens with Rose and shows the original website cat beside the corrected companion. The earlier `cat-art/` captures were rejected for shape and coloring and are not a fidelity reference. Browser evidence supplements source evidence and does not certify native SVG animation, passkeys or screen-reader behavior.

## Do's and Don'ts

### Do:

- **Do** use the shared theme and UI primitives for additional app surfaces.
- **Do** keep amounts, testnet disclosures, obligations and retry language readable.
- **Do** preserve wrapping, font scaling, labelled controls and at least 48dp interaction targets.
- **Do** keep standing terms and next steps available when the cat is hidden.

### Don't:

- **Don’t** substitute the welcome brand cat for a member’s standing cat.
- **Don’t** turn unknown amounts into zero or report success before confirmation.
- **Don’t** animate routine navigation or loop decorative balance or cat motion.
