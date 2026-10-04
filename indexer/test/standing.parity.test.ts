import { describe, expect, it } from "vitest";

import { tierOf, type Track } from "../src/lib/standing";
import { nextStep, tierOf as attestorTierOf } from "../../site/api/_lib/standing";

// The tier attestor (site/api/tier.ts) carries its own copy of the SRS 8.4
// rule, because Vercel only uploads site/. This keeps the two in step.

const YEAR = 365n * 24n * 3600n;
const NOW = 1_800_000_000n;

function* records(): Generator<Track> {
  let seed = 7;
  const rand = (n: number) => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed % n;
  };
  for (let i = 0; i < 2_000; i++) {
    const cleared = rand(3);
    yield {
      paidOnTime: rand(80),
      paidLate: rand(5),
      timesCovered: rand(4),
      defaults: rand(4) === 0 ? rand(2) : 0,
      openDefaults: rand(6) === 0 ? 1 : 0,
      lastDefaultClearedAt: cleared === 0 ? undefined : cleared === 1 ? NOW - YEAR / 2n : NOW - 2n * YEAR,
      counterparties: rand(20),
      cycleWeight: rand(8_000),
    };
  }
}

describe("tier attestor parity", () => {
  it("agrees with the indexer on every tier", () => {
    for (const r of records()) expect(attestorTierOf(r, NOW)).toBe(tierOf(r, NOW));
  });

  it("names the next tier, and what a default asks for first", () => {
    const fresh: Track = { paidOnTime: 0, paidLate: 0, timesCovered: 0, defaults: 0, openDefaults: 0, lastDefaultClearedAt: undefined, counterparties: 0, cycleWeight: 0 };
    expect(nextStep(fresh, NOW)).toMatchObject({ tier: "Steady", circles: 3, onTimeBps: 9_000, open: false, heldUntil: null });
    expect(nextStep({ ...fresh, paidOnTime: 10, cycleWeight: 1_000 }, NOW)).toMatchObject({ tier: "Trusted", circles: 5, newPeople: 6, onTimeBps: 0 });
    expect(nextStep({ ...fresh, defaults: 1, openDefaults: 1 }, NOW)).toMatchObject({ open: true });
    expect(nextStep({ ...fresh, defaults: 1, lastDefaultClearedAt: NOW - 10n }, NOW)?.heldUntil).toBe(NOW - 10n + YEAR);
    // Anchor never forgives a default, so a Trusted member with one has nowhere further to go
    const trusted = { ...fresh, paidOnTime: 100, defaults: 1, lastDefaultClearedAt: NOW - 2n * YEAR, counterparties: 12, cycleWeight: 7_000 };
    expect(tierOf(trusted, NOW)).toBe("Trusted");
    expect(nextStep(trusted, NOW)).toBeNull();
  });
});
