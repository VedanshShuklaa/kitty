import type { Address } from "viem";

import { canOfferIn, firstOfferRound, lookOf, moodOf, nextStep, payoutOrder, termsInWords, type Progress } from "../standing";

const base: Progress = { stage: "Shy", debt: 0n, points: 0, onTimeBps: 0, people: 0, biggestClean: 0n, open: 0 };

describe("the cat's look (KittyCats.lookOf)", () => {
  it("matches keccak256(abi.encodePacked(owner)) in Solidity, whatever the case", () => {
    // expected values from `cast keccak <address>`
    expect(lookOf("0x2222222222222222222222222222222222222222")).toEqual({ coat: 0, pattern: 2 });
    expect(lookOf("0x0cdF60D04d67B6b6B1D9bD8C5bBfC7cC0C3fC1aB")).toEqual({ coat: 4, pattern: 1 });
    expect(lookOf("0x0CDF60D04D67B6B6B1D9BD8C5BBFC7CC0C3FC1AB" as Address)).toEqual({ coat: 4, pattern: 1 });
  });
});

describe("payout order (Circle._rank)", () => {
  it("puts better stages first and breaks ties by seat", () => {
    const order = payoutOrder([
      { seat: 0, stage: "Shy" as const },
      { seat: 1, stage: "Wary" as const },
      { seat: 2, stage: "Friendly" as const },
      { seat: 3, stage: "Shy" as const },
      { seat: 4, stage: "Family" as const },
    ]);
    expect(order.map((m) => m.seat)).toEqual([4, 2, 0, 3, 1]);
  });
});

describe("offer windows (Circle._canOffer)", () => {
  it("opens any round, the second half, or never", () => {
    expect(canOfferIn(0, 1, 4)).toBe(true);
    expect(canOfferIn(1, 2, 4)).toBe(false);
    expect(canOfferIn(1, 3, 4)).toBe(true);
    expect(canOfferIn(1, 3, 5)).toBe(true);
    expect(canOfferIn(2, 4, 4)).toBe(false);
    expect(firstOfferRound(1, 6)).toBe(4);
    expect(firstOfferRound(2, 6)).toBeNull();
  });
});

describe("standing in words (FR-TRU-11)", () => {
  const banned = /credit|score|rating|collateral|points?\b/i;

  it("never uses a number out of a maximum or the banned words", () => {
    for (const p of [
      base,
      { ...base, points: 40, onTimeBps: 8_000 },
      { ...base, stage: "Friendly" as const, points: 140, onTimeBps: 9_600, people: 4 },
      { ...base, stage: "AtHome" as const, points: 420, onTimeBps: 9_700, people: 8 },
      { ...base, stage: "Family" as const, points: 700 },
      { ...base, stage: "Wary" as const, points: -300 },
      { ...base, stage: "Away" as const, points: -300, debt: 6_000000n },
    ]) {
      expect(nextStep(p)).not.toMatch(banned);
    }
  });

  it("names the one next step", () => {
    expect(nextStep({ ...base, points: 40, onTimeBps: 8_000 })).toBe(
      "For her to become Friendly: finish at least 1 more circle with people you haven't saved with before and pay on time at least 9 times in 10.",
    );
    expect(nextStep({ ...base, stage: "Friendly", points: 140, onTimeBps: 9_600, people: 4 })).toBe(
      "For her to become At home: finish at least 2 more circles with people you haven't saved with before and save with 2 more new people.",
    );
    expect(nextStep({ ...base, stage: "Wary", points: -300 })).toMatch(/about 30 months/);
    expect(nextStep({ ...base, stage: "Away", debt: 1n })).toMatch(/^Pay back/);
  });

  it("states the terms each stage sets (the queue table)", () => {
    const wary = Object.fromEntries(termsInWords("Wary").map((t) => [t.label, t.value]));
    expect(wary).toMatchObject({ "You're paid": "Last", "Offers to go earlier": "None", Deposit: "Two rounds", "Most you can owe after the pot": "Nothing" });
    const shy = Object.fromEntries(termsInWords("Shy").map((t) => [t.label, t.value]));
    expect(shy).toMatchObject({ "Offers to go earlier": "From the second half", Deposit: "One round", "Circles at once": "2" });
    expect(termsInWords("Away")[0]).toEqual({ label: "New circles", value: "Not until you pay back" });
  });
});

describe("her mood", () => {
  const words = { money: (n: bigint) => `$${n / 1_000000n}`, countdown: () => "in 2 hours" };
  const circle = { title: "Lagos Savers", state: "active" as const, due: 100, mine: { standing: "good" as const, paid: false, arrears: 0n }, pay: 10_000000n };

  it("waits for dinner while a round is unpaid, in money words", () => {
    expect(moodOf("Shy", [circle], 0, words)).toEqual({ line: "She's waiting for dinner", detail: "Lagos Savers: pay $10 in 2 hours." });
  });

  it("puts a covered round ahead of a due one", () => {
    const behind = { ...circle, title: "Market Women", mine: { standing: "behind" as const, paid: true, arrears: 10_000000n } };
    expect(moodOf("Shy", [circle, behind], 0, words).line).toBe("Her ears are back");
  });

  it("is content when everything is paid", () => {
    expect(moodOf("Friendly", [{ ...circle, mine: { ...circle.mine, paid: true }, pay: null }], 0, words).detail).toMatch(/content/);
  });
});
