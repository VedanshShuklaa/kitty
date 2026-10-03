// SRS 8.4: standing is a view over events the circles already emit. Nothing
// here touches a contract, so the thresholds can be re-fitted later without a
// redeploy. Weights are kept x1000 so they stay integers in the database.

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

/** What a finished circle's member is worth to someone meeting them for the first time. */
export const WEIGHT: { [T in Tier]: number } = { Newcomer: 400, Steady: 700, Trusted: 1000, Anchor: 1000 };

/** On-time payments over every obligation: late, covered and defaulted ones count against it. */
export function onTimeBps(r: Pick<Track, "paidOnTime" | "paidLate" | "timesCovered" | "defaults">): number {
  const total = r.paidOnTime + r.paidLate + r.timesCovered + r.defaults;
  return total === 0 ? 0 : Math.floor((r.paidOnTime * 10_000) / total);
}

/**
 * The tier a record earns at time `now`. A record can only ever lift a member
 * above Newcomer (FR-TRU-02): an open default, or one cleared less than a year
 * ago, holds them there.
 */
export function tierOf(r: Track, now: bigint): Tier {
  if (r.openDefaults > 0) return "Newcomer";
  if (r.lastDefaultClearedAt !== undefined && now - r.lastDefaultClearedAt < YEAR) return "Newcomer";
  const rate = onTimeBps(r);
  if (r.cycleWeight >= 6_000 && rate >= 9_800 && r.counterparties >= 12 && r.defaults === 0) return "Anchor";
  if (r.cycleWeight >= 3_000 && rate >= 9_500 && r.counterparties >= 6) return "Trusted";
  if (r.cycleWeight >= 1_000 && rate >= 9_000) return "Steady";
  return "Newcomer";
}

/**
 * FR-TRU-06: a finished circle adds, for each member, the weight of the people
 * in it who were new to them, divided by memberCount - 1. Running the same
 * circle again with the same people adds nothing.
 */
export function cycleGain(newTiers: Tier[], memberCount: number): number {
  if (memberCount < 2) return 0;
  const sum = newTiers.reduce((s, t) => s + WEIGHT[t], 0);
  return Math.floor(sum / (memberCount - 1));
}

/**
 * Annualised rate, in basis points, between two share prices `seconds` apart.
 * Zero until a day has passed, so one early point can't print a wild rate.
 */
export function aprBps(from: bigint, to: bigint, seconds: bigint): number {
  if (from <= 0n || seconds < 86_400n) return 0;
  return Number(((to - from) * 10_000n * YEAR) / (from * seconds));
}
