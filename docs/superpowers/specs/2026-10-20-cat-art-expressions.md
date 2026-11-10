# Cat artwork and expressions

User request: “Can you make the art better? and animate some expressions onto the cats”. This is a refinement of the existing website-inspired identity on the local `design/website-inspired-app` branch. The earlier no-push/no-deploy and web-first requirements continue.

Art: preserve all six deterministic coats, three markings and six standing poses. Bring the standing cats closer to the website's plush shaded character with glossy eyes, soft fur volume, clearer muzzle and paws. Reuse the local website room as the portrait setting. No changes to standing, terms, financial copy or payment/authentication behavior.

Motion thesis: one slow hello blink on portrait arrival; a brief smile and small head nuzzle on petting, plus blink/nuzzle on an existing confirmed-payment reaction without overriding the actual current mood. Welcome's “Say hello” triggers a blink and a static heart/acknowledgement for 1800ms, including with reduced motion. Effects are local, bounded, interruptible and never loop. Small faces remain still and house residents stay quiet at rest. Each blink closes in 110ms, holds 70ms and opens in 190ms; nuzzle turns gently in 180ms and settles in 260ms. No animation blocks an action.

Accessibility/performance: reuse existing React Native Animated and SVG, no new runtime dependency. Reduce Motion retains the immediate meaningful smile/text while skipping tweened expressions. Stop pending and active motion on background, preference change and unmount. Animation values affect only small SVG groups; no per-frame layout or network operations.

Verify the 108 coat/marking/stage combinations, thumbnail bounds, smile/blink/nuzzle frames and settled states, repeated interactions, reduced motion and hidden/background views. Test account/home/welcome/circle layouts on local web, keep native certification explicitly deferred, run TypeScript and the existing app tests. Use one batched visual pass and one confirmation, then Impeccable finish review and targeted documentation update.
