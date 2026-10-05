import { keccak256, type Address } from "viem";

// "Feed the Kitty" (FR-TRU-11..20): every account's standing lives in
// KittyRecord, written only by circles. The rules live there too; this file
// only turns a stage and its progress into words, and works out the payout
// order members see before they join. Never a number out of a maximum, and
// never the words credit, score or rating.

// Same order as IKittyRecord.Stage
export const STAGES = ["Away", "Wary", "Shy", "Friendly", "AtHome", "Family"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_NAME: { [S in Stage]: string } = {
  Away: "Away",
  Wary: "Wary",
  Shy: "Shy",
  Friendly: "Friendly",
  AtHome: "At home",
  Family: "Family",
};

/** What the cat does at each stage: the sentence carries the meaning, the drawing only repeats it. */
export const STAGE_LINE: { [S in Stage]: string } = {
  Away: "Your cat is staying with the neighbours",
  Wary: "Your cat keeps her distance",
  Shy: "Your cat is watching you from her box",
  Friendly: "Your cat walks up to greet you",
  AtHome: "Your cat is at home with you",
  Family: "Your cat is family",
};

export type Progress = {
  stage: Stage;
  debt: bigint; // what a circle lost, until repaid
  points: number;
  onTimeBps: number;
  people: number;
  biggestClean: bigint;
  open: number;
};

export type Term = { label: string; value: string };

/** FR-TRU-13/14: the table in "The queue", in words, for the member's next circle. */
export function termsInWords(stage: Stage): Term[] {
  if (stage === "Away") {
    return [
      { label: "New circles", value: "Not until you pay back" },
      { label: "In circles you're in", value: "Paid behind everyone" },
    ];
  }
  const place: { [S in Exclude<Stage, "Away">]: string } = {
    Wary: "Last",
    Shy: "After members who have finished circles",
    Friendly: "After At home and Family",
    AtHome: "After Family",
    Family: "First among equals",
  };
  const offers = stage === "Wary" ? "None" : stage === "Shy" ? "From the second half" : "Any round";
  const owe: { [S in Exclude<Stage, "Away">]: string } = {
    Wary: "Nothing",
    Shy: "One round",
    Friendly: "Three rounds",
    AtHome: "Six rounds",
    Family: "The circle's own holdback",
  };
  const atOnce = { Wary: 1, Shy: 2, Friendly: 3, AtHome: 4, Family: 6 }[stage];
  return [
    { label: "You're paid", value: place[stage] },
    { label: "Offers to go earlier", value: offers },
    { label: "Deposit", value: stage === "Wary" ? "Two rounds" : "One round" },
    { label: "Most you can owe after the pot", value: owe[stage] },
    { label: "Circles at once", value: String(atOnce) },
  ];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function join(parts: string[]): string {
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const BARS = {
  Shy: { to: "Friendly", points: 100, bps: 9_000, people: 0 },
  Friendly: { to: "At home", points: 300, bps: 9_500, people: 6 },
  AtHome: { to: "Family", points: 600, bps: 9_800, people: 12 },
} as const;

/**
 * The one next step (FR-TRU-11). Thresholds mirror KittyRecord._stage: a
 * finished circle adds at most 100 points, so "at least N circles" is exact
 * as a floor.
 */
export function nextStep(p: Progress): string {
  if (p.stage === "Away") {
    return "Pay back what the circle lost. The money goes to the members who lost it. Until then you can't join a new circle.";
  }
  if (p.stage === "Wary") {
    const months = Math.max(1, Math.ceil(-p.points / 10));
    return `To win her back: finish circles without missing a round. She also warms up a little each month on her own, about ${plural(months, "month", "months")} if nothing else changes.`;
  }
  if (p.stage === "Family") return "She trusts you completely. Keep paying on time to keep her close.";
  const bar = BARS[p.stage];
  const parts: string[] = [];
  const need = bar.points - p.points;
  if (need > 0) parts.push(`finish at least ${plural(Math.ceil(need / 100), "more circle", "more circles")} with people you haven't saved with before`);
  if (p.people < bar.people) parts.push(`save with ${plural(bar.people - p.people, "more new person", "more new people")}`);
  if (p.onTimeBps < bar.bps) parts.push(`pay on time at least ${bar.bps / 1_000} times in 10`);
  if (parts.length === 0) return `For her to become ${bar.to}: keep your record clear. It comes with your next finished circle.`;
  return `For her to become ${bar.to}: ${join(parts)}.`;
}

// ------------------------------------------------------------ payout order

const RANK: { [S in Stage]: number } = { Away: 0, Wary: 1, Shy: 2, Friendly: 3, AtHome: 4, Family: 5 };

/** Circle._rank: stage first, best first; among equals, seat order. */
export function payoutOrder<T extends { seat: number; stage: Stage | null }>(members: T[]): T[] {
  return [...members].sort((a, b) => RANK[b.stage ?? "Shy"] - RANK[a.stage ?? "Shy"] || a.seat - b.seat);
}

/** The offer window a stage gives (Circle._canOffer). */
export function canOfferIn(offerFrom: number, round: number, memberCount: number): boolean {
  return offerFrom === 0 || (offerFrom === 1 && round > Math.floor(memberCount / 2));
}

/** First round a member with this window may make an offer, or null for never. */
export function firstOfferRound(offerFrom: number, memberCount: number): number | null {
  if (offerFrom === 0) return 1;
  if (offerFrom === 1) return Math.floor(memberCount / 2) + 1;
  return null;
}

// --------------------------------------------------------------- the cat

/** KittyCats.lookOf: coat and markings from keccak256(owner), so every phone draws the same cat. */
export function lookOf(owner: Address): { coat: number; pattern: number } {
  const h = keccak256(owner.toLowerCase() as Address);
  return { coat: parseInt(h.slice(2, 4), 16) % 6, pattern: parseInt(h.slice(4, 6), 16) % 3 };
}

// ------------------------------------------------------------- her mood

type MoodCircle = {
  title: string;
  state: "forming" | "active" | "completed" | "cancelled";
  due: number;
  mine: { standing: "none" | "good" | "behind" | "defaulted"; paid: boolean; arrears: bigint } | null;
  pay: bigint | null; // what this round asks of me, when payable
};

/**
 * Her mood follows this round; her trust follows the whole record. Worked out
 * from what the circle reads already return, so it needs no indexer. The
 * money words stay money words: "pay $10", never "feed her".
 */
export function moodOf(stage: Stage, circles: MoodCircle[], now: number, words: { money: (n: bigint) => string; countdown: (t: number, now: number) => string }): { line: string; detail: string } {
  if (stage === "Away") return { line: STAGE_LINE.Away, detail: "Pay back what you owe on Account and she comes home." };
  const behind = circles.find((c) => c.state === "active" && c.mine?.standing === "behind" && c.mine.arrears > 0n);
  if (behind) {
    return { line: "Her ears are back", detail: `The circle covered a round for you in ${behind.title}. Pay it back to settle up.` };
  }
  const due = circles.filter((c) => c.state === "active" && c.mine && !c.mine.paid && c.mine.standing !== "defaulted" && c.pay !== null).sort((a, b) => a.due - b.due)[0];
  if (due) {
    return { line: "She's waiting for dinner", detail: `${due.title}: pay ${words.money(due.pay!)} ${words.countdown(due.due, now)}.` };
  }
  const active = circles.some((c) => c.state === "active");
  return { line: STAGE_LINE[stage], detail: active ? "Every round you're in is paid. She's content." : "Finish circles with new people and she'll trust you more." };
}
