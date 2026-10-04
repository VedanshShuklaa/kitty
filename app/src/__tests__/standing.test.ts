import { encodeFunctionResult } from "viem";

jest.mock("../config", () => ({
  apiUrl: "https://kitty-circle.vercel.app",
  contracts: { chainId: 10143, circleFactory: "0x0000000000000000000000000000000000000001" },
}));

import { circleAbi, legacyRulesAbi } from "../abi";
import { decodeRules, depositOf, stakeBpsWithTier, type Rules } from "../kitty";
import { rulesInWords } from "../phase";
import { nextWords, usable, type Standing } from "../standing";

const rules: Rules = {
  memberCount: 3,
  stakeBps: 10_000,
  maxBidBps: 3_000,
  poolShareBps: 1_000,
  holdbackBps: 2_000,
  yieldOn: true,
  tierDiscountOn: true,
  contribution: 10_000000n,
  firstDue: 1_800_000_000n,
  period: 600,
  commitWindow: 240,
  revealWindow: 60,
  grace: 120,
  joinDeadline: 1_799_999_760n,
};

describe("rules, before and after SRS 7.11", () => {
  it("reads the new layout as it is", () => {
    const data = encodeFunctionResult({ abi: circleAbi, functionName: "rules", result: rules });
    expect(decodeRules(data)).toEqual(rules);
  });

  it("reads an older circle's rules without shifting a field", () => {
    const { tierDiscountOn: _, ...old } = rules;
    const data = encodeFunctionResult({ abi: legacyRulesAbi, functionName: "rules", result: old });
    expect(decodeRules(data)).toEqual({ ...rules, tierDiscountOn: false });
  });
});

describe("tier deposits (SRS 7.11)", () => {
  it("takes a share of the circle's own deposit, never under half", () => {
    expect(stakeBpsWithTier(rules, 8_500)).toBe(8_500);
    expect(stakeBpsWithTier({ ...rules, stakeBps: 12_000 }, 8_500)).toBe(10_200);
    expect(stakeBpsWithTier({ ...rules, stakeBps: 6_000 }, 5_000)).toBe(5_000);
    expect(depositOf({ contribution: 10_000000n, stakeBps: stakeBpsWithTier(rules, 7_000) })).toBe(7_000000n);
  });

  it("changes nothing where the organizer kept discounts off", () => {
    expect(stakeBpsWithTier({ ...rules, tierDiscountOn: false }, 5_000)).toBe(10_000);
  });

  it("sends an attestation only while it has time left", () => {
    const s: Standing = { tier: "Steady", tierBps: 8_500, next: null, attestation: "0x01", expiry: 1_000 };
    expect(usable(s, 800)).toBe("0x01");
    expect(usable(s, 900)).toBeNull();
    expect(usable({ ...s, attestation: null }, 0)).toBeNull();
    expect(usable(null, 0)).toBeNull();
  });

  it("tells members before they join", () => {
    expect(rulesInWords(rules).some((l) => /Smaller deposits/.test(l.lead))).toBe(true);
    expect(rulesInWords({ ...rules, tierDiscountOn: false }).some((l) => /Smaller deposits/.test(l.lead))).toBe(false);
  });
});

describe("standing in words (FR-TRU-11)", () => {
  const banned = /credit|score|rating|collateral|\d+\s*\/\s*\d+|%\s*complete/i;

  it("names the next step, never a number out of a maximum", () => {
    const lines = [
      nextWords({ tier: "Steady", circles: 3, newPeople: 0, onTimeBps: 9_000, open: false, heldUntil: null }),
      nextWords({ tier: "Trusted", circles: 1, newPeople: 6, onTimeBps: 0, open: false, heldUntil: null }),
      nextWords({ tier: "Steady", circles: 0, newPeople: 0, onTimeBps: 0, open: true, heldUntil: null }),
      nextWords({ tier: "Steady", circles: 0, newPeople: 0, onTimeBps: 0, open: false, heldUntil: 1_830_000_000 }),
      nextWords(null),
    ];
    expect(lines[0]).toBe("To become Steady: finish up to 3 more circles with people you haven't saved with before and pay on time at least 9 times in 10.");
    expect(lines[1]).toBe("To become Trusted: finish up to 1 more circle with people you haven't saved with before and save with 6 more new people.");
    expect(lines[2]).toMatch(/Pay back the round you missed/);
    expect(lines[3]).toMatch(/can rise again from/);
    for (const l of lines) expect(l).not.toMatch(banned);
  });
});
