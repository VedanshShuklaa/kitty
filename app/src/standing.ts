import type { Address, Hex } from "viem";

import { apiUrl, contracts } from "./config";
import { when } from "./format";
import { timedFetch } from "./net";

// SRS 6.13 / 7.11 / 8.4: standing across circles. The indexer keeps the
// record; /api/tier works out the tier now and signs the smaller deposit it
// earns. Everything here is optional: if it can't be reached, a member joins
// with the full deposit, which is what everyone posts without standing.

export type Tier = "Newcomer" | "Steady" | "Trusted" | "Anchor";

export type Next = {
  tier: Exclude<Tier, "Newcomer">;
  circles: number;
  newPeople: number;
  onTimeBps: number;
  open: boolean;
  heldUntil: number | null;
} | null;

export type Standing = {
  tier: Tier;
  tierBps: number; // share of a circle's usual deposit this tier puts down
  next: Next;
  attestation: Hex | null; // null for a Newcomer, or when the attestor is off
  expiry: number | null; // unix seconds
};

type Wire = Omit<Standing, "next" | "expiry"> & {
  next: (Omit<NonNullable<Next>, "heldUntil"> & { heldUntil: string | null }) | null;
  expiry: string | null;
};

export async function standingOf(account: Address): Promise<Standing> {
  const res = await timedFetch(`${apiUrl}/api/tier?account=${account}&factory=${contracts.circleFactory}`, {}, 8_000);
  if (!res.ok) throw new Error("Couldn't check your standing.");
  const w = (await res.json()) as Wire;
  return {
    ...w,
    next: w.next && { ...w.next, heldUntil: w.next.heldUntil === null ? null : Number(w.next.heldUntil) },
    expiry: w.expiry === null ? null : Number(w.expiry),
  };
}

/** An attestation worth sending: present and with time left to land a join. */
export const usable = (s: Standing | null, nowSec: number): Hex | null =>
  s?.attestation && s.expiry !== null && s.expiry - nowSec > 120 ? s.attestation : null;

// FR-TRU-11: a named tier and the next step in plain words. Never a number
// out of a maximum, and never "credit", "score", "rating" or "collateral".

export const TIER_LINE: { [T in Tier]: string } = {
  Newcomer: "Where everyone starts. You put down the full deposit.",
  Steady: "In circles that allow it, you put down 85% of the usual deposit.",
  Trusted: "In circles that allow it, you put down 70% of the usual deposit.",
  Anchor: "In circles that allow it, you put down half the usual deposit.",
};

export function nextWords(next: Next): string {
  if (!next) return "You're at the highest standing your record reaches. Keep paying on time to stay here.";
  if (next.open) return "Pay back the round you missed. Once it's paid, your standing can start to rise again.";
  if (next.heldUntil !== null) return `You paid back a missed round. Your standing can rise again from ${when(next.heldUntil)}.`;
  const parts: string[] = [];
  if (next.circles > 0) {
    parts.push(`finish up to ${next.circles} more ${next.circles === 1 ? "circle" : "circles"} with people you haven't saved with before`);
  }
  if (next.newPeople > 0) parts.push(`save with ${next.newPeople} more new ${next.newPeople === 1 ? "person" : "people"}`);
  if (next.onTimeBps > 0) parts.push(`pay on time at least ${next.onTimeBps / 1_000} times in 10`);
  if (parts.length === 0) return `You're almost ${next.tier}. Your next finished circle should do it.`;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `To become ${next.tier}: ${list}.`;
}
