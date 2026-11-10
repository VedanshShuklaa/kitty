# Natural cat poses — local refinement

The user approved the base character: “The base cat looks perfect.” They asked for more natural poses, with image-generated concept art first, then implementation. Preserve the Friendly pose, head geometry, coat colors, thumbnails, original brand artwork and expression engine. Keep all changes local on `design/website-inspired-app`; no commit, push or publication.

## Concept and implementation

`output/cat-poses/base-reference.png` is a browser capture of the original website cat, isolated without changing its artwork. The built-in image generator used it to create `output/cat-poses/pose-concepts.png`, a four-pose concept sheet. Its prompt and provenance are saved beside it. This is a pose reference, not a replacement brand asset or an app runtime bitmap.

- Wary: low bent forelegs below the shoulders, rounded hindquarters and a tail resting beside them, within the existing bench.
- At home: continuous rounded shoulders/haunch, tucked paws, modest chest patch and a tail curling around the near flank.
- Family: diagonal side-roll, cheek resting toward the cushion, a torso continuous with the neck, four short folded limbs at shoulder/pelvis and a tail attached at the rump.
- Shy: chin just above the rim, two separately draped forepaws. The existing box stays.

Use the current shared SVG palette and face to interpret the concept. Do not import the generated face, change standing meaning, or add idle animation. Existing blinks and nuzzles stay bounded and reduced-motion-safe.

## Verification

Compare all six stages at phone and tablet widths, all six coats and three markings, large account scenes and small circle residents. Verify original Friendly/head/palette source is unchanged. Run the existing 108-pose/thumbnail and expression browser checks, main-screen regression, TypeScript, Jest and Android JS export. Native appearance and accessibility remain a separate device step. Finish with Impeccable's independent review and targeted documentation.
