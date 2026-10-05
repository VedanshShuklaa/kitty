import type { Stage } from "./standing";

// "Feed the Kitty": every circle has a house. It starts as a cardboard box and
// gains one piece for each round in which every member paid and nobody had to
// be covered, up to twelve. Nothing is ever taken away. The indexer counts the
// pieces (Circle.housePieces); the words below say what they mean.

export const PIECES = [
  "rug",
  "cushion",
  "window",
  "pot of cat grass",
  "scratching post",
  "lamp",
  "shelf",
  "plant",
  "picture",
  "toy mouse",
  "blanket",
  "cat tree",
] as const;

const article = (piece: string) => (/^[aeiou]/.test(piece) ? "an" : "a");

/** The house in one or two sentences, for every state of the circle. */
export function houseWords(o: {
  state: "forming" | "active" | "completed" | "cancelled";
  pieces: number | null; // null while Kitty's records are out of reach
  joined: number;
  memberCount: number;
  round: number;
}): string {
  if (o.state === "forming") return `${o.joined} of ${o.memberCount} cats have moved in.`;
  if (o.state === "cancelled") return "The cats moved out when the circle was called off.";
  if (o.pieces === null) return "The house will show again when Kitty's records are back.";
  const p = Math.min(o.pieces, PIECES.length);
  const have = p === 0 ? "The house is still a cardboard box." : `The house has ${p} ${p === 1 ? "piece" : "pieces"}.`;
  if (o.state === "completed") return `${have} It's in everyone's album now.`;
  if (p >= PIECES.length) return `${have} It's complete.`;
  const next = PIECES[p];
  return `${have} If everyone pays round ${o.round}, ${article(next)} ${next} arrives.`;
}

/** The piece a fully paid round added, in order; null when the round added none. */
export function pieceAdded(rounds: { everyonePaid: boolean }[], i: number): string | null {
  if (!rounds[i]?.everyonePaid) return null;
  const nth = rounds.slice(0, i + 1).filter((r) => r.everyonePaid).length;
  return nth <= PIECES.length ? PIECES[nth - 1] : null;
}

// ------------------------------------------------------------- keepsakes

export const KEEPSAKES = [
  { kind: "Yarn", name: "Yarn ball", rule: "Pay a round on time" },
  { kind: "Wand", name: "Feather wand", rule: "Pay 3 rounds on time in a row" },
  { kind: "Fish", name: "Fish supper", rule: "Receive a pot" },
  { kind: "Box", name: "Name box", rule: "Finish a circle" },
  { kind: "Gold", name: "Golden bowl", rule: "Pay every round of a circle on time" },
] as const;

export type KeepsakeKind = (typeof KEEPSAKES)[number]["kind"];

/** The cats on a circle's house, best stage first: the same order they're paid in. */
export type Resident = { owner: `0x${string}`; stage: Stage; name: string; mine: boolean };
