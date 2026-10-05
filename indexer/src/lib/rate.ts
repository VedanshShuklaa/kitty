// The earnAUSD rate, from two share prices. Kept as an integer in basis points.

const YEAR = 365n * 24n * 3600n;

/**
 * Annualised rate, in basis points, between two share prices `seconds` apart.
 * Zero until a day has passed, so one early point can't print a wild rate.
 */
export function aprBps(from: bigint, to: bigint, seconds: bigint): number {
  if (from <= 0n || seconds < 86_400n) return 0;
  return Number(((to - from) * 10_000n * YEAR) / (from * seconds));
}
