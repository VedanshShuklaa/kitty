---
version: 1
slug: "app-src-cat-tsx"
primary_target: "app/src/Cat.tsx"
related_targets: ["app/src/KittyRoom.tsx","app/src/CatCompanion.tsx","app/qa/CatGallery.tsx"]
---

# Cat artwork and expressions

## Active correction — Wary and Family

The user reports these two poses still look consistently off. Follow `docs/superpowers/specs/2026-10-20-wary-family-correction.md`: lower and support Wary's crouch, and distinguish Family's connected forelegs/hindquarters instead of four identical round paws. The previous natural-pose verdict is superseded for these two. Preserve all other pose branches, the approved face/palettes and existing expressions. New concepts/evidence belong in `output/cat-wary-family/` and `.impeccable/review/cat-wary-family/`; work remains local.

## Current refinement — natural poses, approved base

The user approved the corrected base cat and requested image-generated concepts before updating unnatural poses. Follow `docs/superpowers/specs/2026-10-20-natural-cat-poses.md` and the generated `output/cat-poses/pose-concepts.png`: crouch, tucked loaf, diagonal relaxed side-roll and box peek. Preserve Friendly, all face/palette paths and existing expression behavior. The concept guides body mechanics only; it does not replace the approved character. Evidence for this pass belongs in `.impeccable/review/cat-poses/`. Local web first, no commit/push/deploy.

## Current correction — source character is authoritative

The user rejected the first expression artwork as weird in shape and coloring. The website's original `brandCat.ts` is now the explicit fidelity reference, not the rejected `.impeccable/review/cat-art/` captures. Follow `docs/superpowers/specs/2026-10-20-cat-reference-correction.md`: original head paths, smaller muzzle, round pupils and seated proportions; consistent coat ramps; same poses and behavior. `?screen=Cats` includes the original and corrected companion together. Current review evidence belongs in `.impeccable/review/cat-correction/`. Prior design tokens and accessibility constraints still apply.

User request: “Can you make the art better? and animate some expressions onto the cats”. This is a refinement of the existing website-inspired identity on the local `design/website-inspired-app` branch. The earlier no-push/no-deploy and web-first requirements continue.

Art: preserve all six deterministic coats, three markings and six standing poses. Bring the standing cats closer to the website's plush shaded character with glossy eyes, soft fur volume, clearer muzzle and paws. Reuse the local website room as the portrait setting. No changes to standing, terms, financial copy or payment/authentication behavior.

Motion thesis: one slow hello blink on portrait arrival; a brief smile and small head nuzzle on petting or a confirmed payment reaction; welcome's “Say hello” triggers a blink and transient heart. Effects are local, bounded, interruptible and never loop. Small faces and house residents remain still. Each blink closes in110ms, holds70ms and opens in190ms; nuzzle turns gently in180ms and settles in260ms. No animation blocks an action.

Accessibility/performance: reuse existing React Native Animated and SVG, no new runtime dependency. Reduce Motion retains the immediate meaningful smile/text while skipping tweened expressions. Stop pending and active motion on background, preference change and unmount. Animation values affect only small SVG groups; no per-frame layout or network operations.

Verify the108 coat/marking/stage combinations, thumbnail bounds, smile/blink/nuzzle frames and settled states, repeated interactions, reduced motion and hidden/background views. Test account/home/welcome/circle layouts on local web, keep native certification explicitly deferred, run TypeScript and the existing app tests. Use one batched visual pass and one confirmation, then Impeccable finish review and targeted documentation update.
