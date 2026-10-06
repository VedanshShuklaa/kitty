// The earnAUSD rate, from two share prices. Kept as an integer in basis points.

const YEAR = 365n * 24n * 3600n;

/**
 * Annualised rate, in basis points, between two share prices `seconds` apart.
 * Zero until a day has passed, so one early point can't print a wild rate.
 */
export function aprBps(from: bigint, to: bigint, seconds: bigint): number {
  if (from <= 0n || seconds < 86_400n) return 0;
  const bps = ((to - from) * 10_000n * YEAR) / (from * seconds);
  // EarnRate.aprBps is a 32-bit Postgres INTEGER: a wild share price must clamp, not stall the indexer
  return Number(bps > MAX_BPS ? MAX_BPS : bps < -MAX_BPS ? -MAX_BPS : bps);
}

const MAX_BPS = 2_000_000_000n;
