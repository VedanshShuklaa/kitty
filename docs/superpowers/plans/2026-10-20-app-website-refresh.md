# Kitty App Website Refresh Implementation Plan

> Execute in this session using the approved design, preserving existing local edits. Impeccable's finish reviewer checks the complete first pass independently.

**Goal:** Carry the updated website into the four main app screens and provide a locally tested browser review.

**Architecture:** Keep existing screen components and all service/authentication behavior. Extend shared theme and brand primitives; reuse local website artwork for welcome. The QA entry remains a separate mocked browser harness.

**Tech Stack:** Existing Expo, React Native, react-native-svg and React Native Web preview.

**Spec:** `docs/superpowers/specs/2026-10-20-app-website-refresh-design.md`

## Global constraints

Local branch only; no push/deploy/APK. No new app runtime dependencies. Preserve existing uncommitted work. Test dollars and mocked preview remain clearly labelled.

## Implementation

1. Establish theme and welcome: add white/blush/peach semantic tokens; reuse existing website room and cat in one presentation-only brand component; restyle welcome without changing form/authentication behavior. Verify compilation and welcome validation in the browser.
2. Update home, circle and account: adjust visual hierarchy, shared navigation, spacing, circle summaries and companion surfaces. Keep financial computations and action handlers unchanged. Verify local navigation, circle states and account standing controls.
3. Complete web QA and handoff: fix preview history only if needed to exercise real navigation; add a repeatable browser check for the approved journey, 320/390/768/1440 layouts, short screens, large text, offline/empty and all standings. Run TypeScript, Jest and Android export. Capture valid screenshots, use the finish reviewer, document the shipped design and append AGENTS.md.

## Review focus

- Large text and long names must wrap without clipping money or action labels.
- Failed reads must show unknown or last-loaded amounts with recovery controls.
- Circle primary actions must appear before decorative scenery and retain duplicate/busy protections.
- Welcome validation and returning-account unlock must stay intact.
- Account standing, debts and hide-cat behavior must retain their meaning and accessibility.
