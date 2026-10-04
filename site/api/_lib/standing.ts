// SRS 8.4, for the tier attestor. A copy of indexer/src/lib/standing.ts:
// Vercel only uploads site/, so the two can't share a file.
// indexer/test/standing.parity.test.ts checks they agree, so change both together.

export type Tier = "Newcomer" | "Steady" | "Trusted" | "Anchor";

export type Track = {
  paidOnTime: number;
  paidLate: number;
  timesCovered: number;
  defaults: number;
  openDefaults: number;
  lastDefaultClearedAt: bigint | undefined;
  counterparties: number;
  cycleWeight: number; // x1000
};

const YEAR = 365n * 24n * 3600n;

/** Share of the circle's own stake each tier posts (SRS 8.4's table). */
export const TIER_BPS: { [T in Tier]: number } = { Newcomer: 10_000, Steady: 8_500, Trusted: 7_000, Anchor: 5_000 };

/** What each tier above Newcomer asks for. */
const NEEDS: { tier: Exclude<Tier, "Newcomer">; cycleWeight: number; onTimeBps: number; counterparties: number }[] = [
  { tier: "Steady", cycleWeight: 1_000, onTimeBps: 9_000, counterparties: 0 },
  { tier: "Trusted", cycleWeight: 3_000, onTimeBps: 9_500, counterparties: 6 },
  { tier: "Anchor", cycleWeight: 6_000, onTimeBps: 9_800, counterparties: 12 },
];

/** A finished circle of strangers who are all new to Kitty: the least one can add. */
const LEAST_CYCLE_GAIN = 400;

export function onTimeBps(r: Pick<Track, "paidOnTime" | "paidLate" | "timesCovered" | "defaults">): number {
  const total = r.paidOnTime + r.paidLate + r.timesCovered + r.defaults;
  return total === 0 ? 0 : Math.floor((r.paidOnTime * 10_000) / total);
}

/** Why a record is held at Newcomer whatever else it has, if it is. */
function held(r: Track, now: bigint): "open" | "recent" | null {
  if (r.openDefaults > 0) return "open";
  if (r.lastDefaultClearedAt !== undefined && now - r.lastDefaultClearedAt < YEAR) return "recent";
  return null;
}

export function tierOf(r: Track, now: bigint): Tier {
  if (held(r, now)) return "Newcomer";
  const rate = onTimeBps(r);
  if (r.cycleWeight >= 6_000 && rate >= 9_800 && r.counterparties >= 12 && r.defaults === 0) return "Anchor";
  if (r.cycleWeight >= 3_000 && rate >= 9_500 && r.counterparties >= 6) return "Trusted";
  if (r.cycleWeight >= 1_000 && rate >= 9_000) return "Steady";
  return "Newcomer";
}

/**
 * FR-TRU-08 / FR-TRU-11: the next tier and what stands between the member and
 * it, as counts the app can put in plain words. `circles` is an upper bound:
 * circles with people who already have standing count for more.
 */
export type Next = {
  tier: Exclude<Tier, "Newcomer">;
  circles: number; // finished circles with new people, at most
  newPeople: number; // more distinct people to finish a circle with
  onTimeBps: number; // the on-time share still to reach, 0 if already there
  open: boolean; // an unpaid default holds the record at Newcomer
  heldUntil: bigint | null; // a default cleared under a year ago holds it until then
} | null;

export function nextStep(r: Track, now: bigint): Next {
  const h = held(r, now);
  if (h) {
    const heldUntil = h === "recent" ? r.lastDefaultClearedAt! + YEAR : null;
    return { tier: "Steady", circles: 0, newPeople: 0, onTimeBps: 0, open: h === "open", heldUntil };
  }
  const order: Tier[] = ["Newcomer", "Steady", "Trusted", "Anchor"];
  const current = order.indexOf(tierOf(r, now));
  const want = NEEDS.find((n) => order.indexOf(n.tier) > current);
  if (!want) return null;
  // Anchor also asks for no default ever, which can't be earned back
  if (want.tier === "Anchor" && r.defaults > 0) return null;
  return {
    tier: want.tier,
    circles: Math.max(0, Math.ceil((want.cycleWeight - r.cycleWeight) / LEAST_CYCLE_GAIN)),
    newPeople: Math.max(0, want.counterparties - r.counterparties),
    onTimeBps: onTimeBps(r) >= want.onTimeBps ? 0 : want.onTimeBps,
    open: false,
    heldUntil: null,
  };
}
