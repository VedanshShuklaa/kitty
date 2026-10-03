import { privateKeyToAccount } from "viem/accounts";
import { hexToBytes, zeroHash, type Address, type Hex } from "viem";

import vectors from "../../../test-vectors/crypto.json";

jest.mock("../config", () => ({
  rpId: "kitty-circle.vercel.app",
  siteUrl: "https://kitty-circle.vercel.app",
  apiUrl: "https://kitty-circle.vercel.app",
  contracts: {
    chainId: 10143,
    circleFactory: "0x0000000000000000000000000000000000000001",
    ausd: "0x0000000000000000000000000000000000000002",
    ausdFaucet: "0x0000000000000000000000000000000000000003",
  },
}));

// only the pure remindersFor is under test here
jest.mock("expo-notifications", () => ({}));

import { bidSalt } from "../account/keys";
import { countdown, money, parseMoney, span } from "../format";
import { buildRules, CADENCES, commitmentFor, joinDigest, recoverBid, type Member, type Snapshot } from "../kitty";
import { inviteLink, parseInvite } from "../links";
import { plan, rulesInWords } from "../phase";
import { remindersFor } from "../reminders";

describe("format", () => {
  it("shows dollars, dropping .00 and grouping thousands", () => {
    expect(money(10_000000n)).toBe("$10");
    expect(money(12_500000n)).toBe("$12.50");
    expect(money(1_234_567_890000n)).toBe("$1,234,567.89");
    expect(money(4_999n)).toBe("$0");
    expect(money(5_000n)).toBe("$0.01");
  });

  it("parses what people type", () => {
    expect(parseMoney("12.5")).toBe(12_500000n);
    expect(parseMoney("$1,200")).toBe(1_200_000000n);
    expect(parseMoney("12.345")).toBeNull();
    expect(parseMoney("ten")).toBeNull();
  });

  it("says time in plain units", () => {
    expect(span(45)).toBe("45 sec");
    expect(span(240)).toBe("4 min");
    expect(span(2 * 3600 + 300)).toBe("2 h 5 min");
    expect(countdown(1_000 + 600, 1_000)).toBe("in 10 min");
    expect(countdown(1_000, 1_120)).toBe("2 min ago");
  });
});

describe("invite links", () => {
  const invite = {
    circle: "0x1111111111111111111111111111111111111111" as Address,
    seat: 3,
    key: `0x${"ab".repeat(32)}` as Hex,
    title: "Àdùké's susu & friends",
    names: ["Ama", "Kofi", "Ẹniọlá", "Wanjiru"],
    roster: `0x${"cd".repeat(32)}` as Hex,
  };

  it("round-trips the circle, seat, key, names and roster key", () => {
    const link = inviteLink(invite);
    expect(link.startsWith("https://kitty-circle.vercel.app/j/0x1111111111111111111111111111111111111111/3#k=0x")).toBe(true);
    expect(parseInvite(link)).toEqual(invite);
  });

  it("keeps everything secret after the #", () => {
    const [path] = inviteLink(invite).split("#");
    expect(path).not.toContain("ab".repeat(32));
    expect(path).not.toContain("Kofi");
    expect(path).not.toContain("cd".repeat(32));
  });

  it("rejects links that are not invites", () => {
    expect(parseInvite("https://kitty-circle.vercel.app/j/0x1111111111111111111111111111111111111111/3")).toBeNull();
    expect(parseInvite("https://kitty-circle.vercel.app/j/0x1111111111111111111111111111111111111111/3#k=0x12")).toBeNull();
    expect(parseInvite(inviteLink({ ...invite, seat: 0 }))).toBeNull();
  });
});

describe("shared vectors (test-vectors/crypto.json)", () => {
  const v = vectors.bidCommitment;

  it("commitment matches Solidity's abi.encode hash", () => {
    expect(commitmentFor(v.circle as Address, v.round, v.member as Address, v.discountBps, v.salt as Hex)).toBe(v.expected);
  });

  it("recovers the sealed discount from the commitment alone", () => {
    expect(recoverBid(v.circle as Address, v.round, v.member as Address, v.salt as Hex, 3_000, v.expected as Hex)).toBe(800);
    expect(recoverBid(v.circle as Address, v.round, v.member as Address, v.salt as Hex, 700, v.expected as Hex)).toBeNull();
  });

  it("join digest and invite signature match", async () => {
    const j = vectors.joinDigest;
    expect(joinDigest(j.circle as Address, j.seat, j.joiner as Address)).toBe(j.expected);
    // anvil's second default key, the labelled example signer
    const signer = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    expect(signer.address).toBe(vectors.inviteSignature.signerAddress);
    expect(await signer.signMessage({ message: { raw: j.expected as Hex } })).toBe(vectors.inviteSignature.expected);
  });

  it("bid salt matches", () => {
    const b = vectors.bidSalt;
    const salt = bidSalt(hexToBytes(b.prfOutput as Hex), BigInt(b.chainId), b.circle as Address, b.round);
    expect(`0x${Buffer.from(salt).toString("hex")}`).toBe(b.expected);
  });
});

describe("rules", () => {
  it("every cadence passes the factory's window checks", () => {
    for (const [k, c] of Object.entries(CADENCES)) {
      for (const start of c.starts) {
        const now = 1_800_000_000;
        const r = buildRules(
          { title: "t", names: ["a", "b", "c"], contribution: 10_000000n, cadence: k as keyof typeof CADENCES, startIn: start.seconds, maxBidBps: 3_000, yieldOn: false },
          now,
        );
        expect(r.grace).toBeGreaterThanOrEqual(r.revealWindow);
        expect(r.commitWindow + r.grace).toBeLessThanOrEqual(r.period);
        expect(Number(r.joinDeadline)).toBeGreaterThan(now);
        expect(r.joinDeadline + BigInt(r.commitWindow)).toBeLessThanOrEqual(r.firstDue);
        expect(r.period).toBeGreaterThanOrEqual(300);
      }
    }
  });
});

describe("plan", () => {
  const me = "0x2222222222222222222222222222222222222222" as Address;
  const other = "0x3333333333333333333333333333333333333333" as Address;
  const third = "0x4444444444444444444444444444444444444444" as Address;
  const due = 10_000;
  const rules = buildRules(
    { title: "t", names: ["a", "b", "c"], contribution: 10_000000n, cadence: "demo", startIn: 900, maxBidBps: 3_000, yieldOn: true },
    due - 900,
  );
  const member = (seat: number, address: Address, over: Partial<Member> = {}): Member => ({
    seat,
    address,
    standing: "good",
    received: false,
    arrears: 0n,
    credit: 0n,
    paid: false,
    revealed: false,
    ...over,
  });
  const snap = (over: Partial<Snapshot> = {}, meOver: Partial<NonNullable<Snapshot["me"]>> = {}): Snapshot => ({
    address: "0x1111111111111111111111111111111111111111",
    rules,
    state: "active",
    round: 1,
    organizer: me,
    pot: 0n,
    members: [member(0, me), member(1, other), member(2, third)],
    recipients: [null, null, null],
    due,
    chainNow: due,
    yield: null,
    me: { seat: 0, pay: 10_000000n, creditUsed: 0n, holdbackReleased: 0n, commitment: zeroHash, revealedBps: 0, withdrawable: 0n, balance: 0n, ...meOver },
    ...over,
  });
  const kinds = (s: Snapshot, now: number) => plan(s, now).actions.map((a) => a.kind);

  it("before the commit window: only pay", () => {
    expect(kinds(snap(), due - rules.commitWindow - 1)).toEqual(["pay"]);
  });

  it("in the commit window: pay first, then bid", () => {
    expect(kinds(snap(), due - rules.commitWindow)).toEqual(["pay", "bid"]);
    expect(kinds(snap(), due - 1)).toEqual(["pay", "bid"]);
  });

  it("no bidding at the due time, or when bidding is off, or with one eligible member", () => {
    expect(kinds(snap(), due)).toEqual(["pay"]);
    expect(kinds(snap({ rules: { ...rules, maxBidBps: 0 } }), due - 10)).toEqual(["pay"]);
    const received = [member(0, me), member(1, other, { received: true }), member(2, third, { received: true })];
    expect(kinds(snap({ members: received }), due - 10)).toEqual(["pay"]);
  });

  it("a sealed offer must be opened in the reveal window, before anything else", () => {
    const committed = snap({}, { commitment: `0x${"11".repeat(32)}` });
    expect(kinds(committed, due)[0]).toBe("reveal");
    expect(kinds(committed, due + rules.revealWindow)[0]).toBe("reveal");
    expect(kinds(committed, due + rules.revealWindow + 1)).not.toContain("reveal");
  });

  it("late payment is allowed through grace; then the round can close", () => {
    expect(kinds(snap(), due + rules.grace - 1)).toEqual(["pay"]);
    expect(kinds(snap(), due + rules.grace)).toEqual(["pay", "close"]);
    expect(kinds(snap(), due + rules.grace + 1)).toEqual(["close"]);
  });

  it("forming: waits, then offers to call off after the join deadline", () => {
    const forming = snap({ state: "forming", round: 0, members: [member(0, me), member(1, other), { ...member(2, third), address: null }] });
    expect(plan(forming, Number(rules.joinDeadline) - 1).headline).toBe("Waiting for 1 more person");
    expect(kinds(forming, Number(rules.joinDeadline))).toEqual(["cancel"]);
  });

  it("finished: collect what's owed", () => {
    expect(kinds(snap({ state: "completed" }, { withdrawable: 12_000000n }), due)).toEqual(["withdraw"]);
    expect(kinds(snap({ state: "completed" }), due)).toEqual([]);
  });

  // FR-NOT-01: a demo circle reminds 2 minutes before the due time, when
  // bidding opens, and when the round can close; nothing already past
  it("reminders: pay, bid and close for the current round, future only", () => {
    const ids = (s: Snapshot, now: number) => remindersFor(s, "Susu", now).map((x) => x.id.split(":").slice(2).join(":"));
    expect(ids(snap(), due - rules.commitWindow - 60)).toEqual(["pay:120", "bid", "close"]);
    expect(ids(snap(), due - 60)).toEqual(["close"]);
    const paid = snap({ members: [member(0, me, { paid: true }), member(1, other), member(2, third)] });
    expect(ids(paid, due - rules.commitWindow - 60)).toEqual(["bid", "close"]);
    expect(ids(snap({}, { commitment: "0x01" as Hex }), due - 200)).toEqual(["pay:120", "reveal", "close"]);
    expect(remindersFor(snap({ state: "completed" }), "Susu", due)).toEqual([]);
  });

  it("rules in words mention simulated yield only when it is on", () => {
    expect(rulesInWords(rules).some((l) => /simulated testnet yield/.test(l.text))).toBe(true);
    expect(rulesInWords({ ...rules, yieldOn: false }).some((l) => /yield/.test(l.text))).toBe(false);
  });
});
