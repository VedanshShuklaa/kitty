import { describe, expect, it } from "vitest";
import { createTestIndexer } from "envio";

import { AUSD, CTK, FAUCET, KITTY_RECORD, PAIR } from "../src/lib/addresses";
import { aprBps } from "../src/lib/rate";

// SRS 15.6 tests: factory registration, the record across two circles
// (TC-2-12), filtering transfers down to Kitty accounts, and
// the earn rate. Addresses are lowercase, as the indexer stores them.

const FACTORY = "0x99a7c36046d6ae7835942fc48b6afeefecf6b846";
const C1 = "0x1111111111111111111111111111111111111111";
const C2 = "0x1212121212121212121212121212121212121212";
const ANA = "0x2222222222222222222222222222222222222222";
const BEN = "0x3333333333333333333333333333333333333333";
const CAL = "0x4444444444444444444444444444444444444444";
const STRANGER = "0x5555555555555555555555555555555555555555";
const OTHER_TOKEN = "0x6666666666666666666666666666666666666666";

const T0 = 1_790_000_000;
const PERIOD = 600n;

let n = 0;
const tx = () => ({ hash: `0x${(++n).toString(16).padStart(64, "0")}` });
const B0 = 67_100_000; // between the testnet start block and the earn vault's
const at = (block: number) => ({ number: B0 + block, timestamp: T0 + block * 10 });

function rules(memberCount: number, contribution = 10_000000n) {
  const firstDue = BigInt(T0 + 2_000);
  return {
    0: BigInt(memberCount), 1: 10_000n, 2: 3_000n, 3: 1_000n, 4: 2_000n, 5: true,
    6: contribution, 7: firstDue, 8: PERIOD, 9: 240n, 10: 60n, 11: 120n, 12: firstDue - 240n,
  };
}

const created = (circle: string, organizer: string, members: number, block: number) => ({
  contract: "CircleFactory" as const,
  event: "CircleCreated" as const,
  srcAddress: FACTORY,
  params: { circle, organizer, rules: rules(members), inviteSigners: [] },
  block: at(block),
  transaction: tx(),
});

const ev = (circle: string, event: string, params: Record<string, unknown>, block: number) => ({
  contract: "Circle" as const,
  event,
  srcAddress: circle,
  params,
  block: at(block),
  transaction: tx(),
});

const joined = (c: string, who: string, seat: number, b: number) => ev(c, "Joined", { member: who, seat: BigInt(seat), stake: 10_000000n }, b);
const paid = (c: string, who: string, round: number, b: number, late = false) =>
  ev(c, "Contributed", { member: who, round: BigInt(round), paid: 10_000000n, creditUsed: 0n, holdbackReleased: 0n, late, autopay: false }, b);
const pot = (c: string, who: string, round: number, b: number) =>
  ev(c, "PotPaid", { recipient: who, round: BigInt(round), gross: 20_000000n, paid: 20_000000n, discount: 0n, holdback: 0n, arrearsRepaid: 0n }, b);
const closed = (c: string, round: number, b: number) => ev(c, "RoundClosed", { round: BigInt(round), closer: ANA }, b);

/** A two-person circle that runs to completion; the second member pays round 2 late. */
function twoPersonCircle(c: string, a: string, b: string, start: number) {
  return [
    created(c, a, 2, start),
    joined(c, a, 0, start + 1),
    joined(c, b, 1, start + 2),
    ev(c, "Activated", { firstDue: BigInt(T0 + 2_000) }, start + 2),
    paid(c, a, 1, start + 3),
    paid(c, b, 1, start + 3),
    pot(c, a, 1, start + 4),
    closed(c, 1, start + 4),
    paid(c, a, 2, start + 5),
    paid(c, b, 2, start + 5, true),
    pot(c, b, 2, start + 6),
    closed(c, 2, start + 6),
    ev(c, "Completed", { at: BigInt(T0 + 5_000) }, start + 6),
  ];
}

describe("circles", () => {
  it("registers a circle from the factory and follows it to completion", async () => {
    const indexer = createTestIndexer();
    await indexer.process({ chains: { 10143: { startBlock: B0, simulate: twoPersonCircle(C1, ANA, BEN, 1) as never } } });

    const circle = await indexer.Circle.getOrThrow(C1);
    expect(circle).toMatchObject({ organizer: ANA, memberCount: 2, state: "Completed", joined: 2, currentRound: 2, yieldOn: true });
    expect(circle.totalContributed).toBe(40_000000n);
    expect(circle.totalPaidOut).toBe(40_000000n);

    const r1 = await indexer.Round.getOrThrow(`${C1}-1`);
    expect(r1).toMatchObject({ recipient: ANA, payments: 2, discountBps: 0 });
    expect(r1.closedAt).toBeDefined();
    const r2 = await indexer.Round.getOrThrow(`${C1}-2`);
    expect(r2.dueAt).toBe(BigInt(T0 + 2_000) + PERIOD);

    const ben = await indexer.Member.getOrThrow(`${C1}-${BEN}`);
    expect(ben).toMatchObject({ seat: 1, received: true, receivedRound: 2, paidOnTime: 1, paidLate: 1 });

    const kinds = (await indexer.Activity.getAll()).filter((a) => a.circle_id === C1).map((a) => a.kind);
    expect(kinds).toEqual(expect.arrayContaining(["Created", "Joined", "Started", "Paid", "PotPaid", "Completed"]));
    expect(kinds.filter((k) => k === "Paid")).toHaveLength(4);
  });

  it("keeps one record per account across two circles (TC-2-12)", async () => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: { 10143: { startBlock: B0, simulate: [...twoPersonCircle(C1, ANA, BEN, 1), ...twoPersonCircle(C2, ANA, CAL, 20)] as never } },
    });
    const ana = await indexer.Account.getOrThrow(ANA);
    expect(ana).toMatchObject({ circlesJoined: 2, circlesOrganized: 2, circlesCompleted: 2, paidOnTime: 4, paidLate: 0, potsReceived: 2, counterparties: 2 });
    expect(ana.totalContributed).toBe(40_000000n);
    expect(ana.totalReceived).toBe(40_000000n);

    const ben = await indexer.Account.getOrThrow(BEN);
    expect(ben).toMatchObject({ circlesJoined: 1, paidOnTime: 1, paidLate: 1, counterparties: 1 });
  });

  it("counts the same person once across circles", async () => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: { 10143: { startBlock: B0, simulate: [...twoPersonCircle(C1, ANA, BEN, 1), ...twoPersonCircle(C2, ANA, BEN, 20)] as never } },
    });
    const ana = await indexer.Account.getOrThrow(ANA);
    expect(ana.circlesCompleted).toBe(2);
    expect(ana.counterparties).toBe(1);
  });

  it("follows a covered miss and a default into the record and the feed", async () => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        10143: {
          startBlock: B0,
          simulate: [
            created(C1, ANA, 3, 1),
            joined(C1, ANA, 0, 2),
            joined(C1, BEN, 1, 3),
            joined(C1, CAL, 2, 4),
            ev(C1, "Activated", { firstDue: BigInt(T0 + 2_000) }, 4),
            paid(C1, ANA, 1, 5),
            ev(C1, "Covered", { member: BEN, round: 1n, fromStake: 8_000000n, fromPool: 2_000000n, shortfall: 0n }, 6),
            ev(C1, "Defaulted", { member: CAL, round: 1n, obligation: 10_000000n, fromStake: 6_000000n, fromHoldback: 0n, fromPool: 1_000000n, shortfall: 3_000000n }, 6),
            pot(C1, ANA, 1, 6),
            closed(C1, 1, 6),
            ev(C1, "ArrearsPaid", { member: BEN, amount: 10_000000n }, 7),
          ] as never,
        },
      },
    });
    const ben = await indexer.Member.getOrThrow(`${C1}-${BEN}`);
    expect(ben).toMatchObject({ standing: "Good", timesCovered: 1, arrears: 0n });
    const cal = await indexer.Member.getOrThrow(`${C1}-${CAL}`);
    expect(cal.standing).toBe("Defaulted");
    expect(await indexer.Account.getOrThrow(CAL)).toMatchObject({ defaults: 1, openDefaults: 1 });

    const r1 = await indexer.Round.getOrThrow(`${C1}-1`);
    expect(r1.covered).toBe(17_000000n);
    expect(r1.shortfall).toBe(3_000000n);
    expect((await indexer.Cover.getAll()).map((c) => c.kind).sort()).toEqual(["Defaulted", "Missed"]);
    const circle = await indexer.Circle.getOrThrow(C1);
    expect(circle.totalCovered).toBe(17_000000n);
    expect(circle.currentRound).toBe(2);
  });
});

describe("earn rate", () => {
  it("annualises a share price change, and stays at zero inside a day", () => {
    expect(aprBps(1_000000n, 1_000100n, 3_600n)).toBe(0);
    // +0.1% in about 8.1 days is about 4.5% a year
    expect(aprBps(1_000000n, 1_001000n, 701_000n)).toBe(449);
  });
});

describe("money", () => {
  const approve = (who: string, block: number) => ({
    contract: "AgoraPair" as const,
    event: "SetApprovedSwapper" as const,
    srcAddress: PAIR,
    params: { approvedSwapper: who, isApproved: true },
    block: at(block),
    transaction: tx(),
  });
  const transfer = (token: string, from: string, to: string, value: bigint, block: number) => ({
    contract: "KittyAccount" as const,
    event: "Transfer" as const,
    srcAddress: token,
    params: { from, to, value },
    block: at(block),
    transaction: tx(),
  });
  const swap = (sender: string, to: string, ausdIn: bigint, block: number) => ({
    contract: "AgoraPair" as const,
    event: "Swap" as const,
    srcAddress: PAIR,
    params: { sender, amount0In: 0n, amount1In: ausdIn, amount0Out: ausdIn * 10n ** 12n, amount1Out: 0n, to },
    block: at(block),
    transaction: tx(),
  });

  it("keeps sends between people, and drops circle, pair and other-token movements", async () => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        10143: {
          startBlock: B0,
          simulate: [
            approve(ANA, 1),
            approve(BEN, 1),
            created(C1, ANA, 2, 2),
            transfer(AUSD, ANA, BEN, 5_000000n, 3), // a send
            transfer(AUSD, ANA, C1, 10_000000n, 3), // a contribution: not a transfer
            transfer(AUSD, ANA, PAIR, 1_000000n, 4), // a swap's input leg
            transfer(OTHER_TOKEN, ANA, BEN, 7n, 4), // not money Kitty tracks
            swap(ANA, BEN, 2_000000n, 5), // arrives ready to cash out
            swap(BEN, BEN, 1_000000n, 6), // a conversion
          ] as never,
        },
      },
    });
    const transfers = (await indexer.Transfer.getAll()).sort((a, b) => a.block - b.block);
    expect(transfers.map((t) => [t.route, t.token, t.amountUsd])).toEqual([
      ["Dollars", "AUSD", 5_000000n],
      ["CashOut", "CTK", 2_000000n],
      ["Convert", "CTK", 1_000000n],
    ]);
    expect(await indexer.Account.getOrThrow(ANA)).toMatchObject({ approvedSwapper: true, sends: 2, totalSent: 7_000000n });
    expect(await indexer.Account.getOrThrow(BEN)).toMatchObject({ receives: 2, totalReceivedDirect: 7_000000n });
  });

  it("ignores swaps between people Kitty doesn't know", async () => {
    const indexer = createTestIndexer();
    await indexer.process({ chains: { 10143: { startBlock: B0, simulate: [swap(STRANGER, STRANGER, 1_000000n, 1)] as never } } });
    expect(await indexer.Transfer.getAll()).toHaveLength(0);
  });

  it("labels test dollars from the faucet, and doesn't count them as received from a person", async () => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: { 10143: { startBlock: B0, simulate: [approve(ANA, 1), transfer(AUSD, FAUCET, ANA, 10_000_000000n, 2)] as never } },
    });
    const [t] = await indexer.Transfer.getAll();
    expect(t.route).toBe("Faucet");
    expect((await indexer.Account.getOrThrow(ANA)).receives).toBe(0);
  });

  it("counts a send paid from the cash-out balance in dollars, from CTK's 18 decimals", async () => {
    const indexer = createTestIndexer();
    const back = {
      contract: "AgoraPair" as const,
      event: "Swap" as const,
      srcAddress: PAIR,
      params: { sender: ANA, amount0In: 3n * 10n ** 18n, amount1In: 0n, amount0Out: 0n, amount1Out: 3_000000n, to: BEN },
      block: at(2),
      transaction: tx(),
    };
    await indexer.process({ chains: { 10143: { startBlock: B0, simulate: [approve(ANA, 1), back] as never } } });
    const [t] = await indexer.Transfer.getAll();
    expect(t).toMatchObject({ route: "Dollars", token: "AUSD", amount: 3_000000n, amountUsd: 3_000000n });
    expect(CTK).not.toBe(AUSD);
  });
});

describe("yield", () => {
  it("prices earnAUSD shares on mainnet and keeps a trailing rate", async () => {
    const indexer = createTestIndexer();
    const deposit = (amountIn: bigint, shares: bigint, day: number) => ({
      contract: "EarnAUSD" as const,
      event: "Deposit" as const,
      params: { assetIn: AUSD, amountIn, shares, senderAddr: ANA, receiverAddr: ANA },
      block: { number: 32_439_200 + day, timestamp: T0 + day * 86_400 },
      transaction: tx(),
    });
    await indexer.process({
      chains: {
        143: {
          startBlock: 32_439_119,
          simulate: [deposit(1_000_000000n, 1_000_000000n, 0), deposit(100_000000n, 99_900000n, 4), deposit(100_000000n, 99_800000n, 10)] as never,
        },
      },
    });
    const rate = await indexer.EarnRate.getOrThrow("earnAUSD");
    expect(rate.points).toBe(3);
    expect(rate.sharePrice).toBe(1_002004n);
    expect(rate.aprBps).toBeGreaterThan(0);
    expect((await indexer.YieldPoint.getAll()).every((p) => p.chainId === 143)).toBe(true);
  });
});

describe("Feed the Kitty", () => {
  const RECORD = KITTY_RECORD;
  const rec = (event: string, params: Record<string, unknown>, block: number) => ({
    contract: "KittyRecord" as const,
    event,
    srcAddress: RECORD,
    params,
    block: at(block),
    transaction: tx(),
  });

  // record events sit after the record's start block (B0 + 1_188_159)
  it("keeps each member's stage at join, and every stage change with its reason", async () => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        10143: {
          startBlock: B0,
          simulate: [
            created(C1, ANA, 2, 1),
            joined(C1, ANA, 0, 2),
            ev(C1, "Placed", { member: ANA, stage: 3n }, 2),
            rec("StageChanged", { account: BEN, from: 2n, to: 1n, why: 1n }, 1_200_003),
            rec("StageChanged", { account: BEN, from: 1n, to: 0n, why: 2n }, 1_200_004),
            rec("DebtChanged", { account: BEN, debt: 6_000000n }, 1_200_004),
            ev(C1, "Repaid", { member: BEN, amount: 6_000000n }, 1_200_005),
            ev(C1, "ArrearsCredited", { from: BEN, to: ANA, amount: 6_000000n }, 1_200_005),
          ] as never,
        },
      },
    });
    expect((await indexer.Member.getOrThrow(`${C1}-${ANA}`)).stage).toBe("Friendly");
    expect(await indexer.Account.getOrThrow(BEN)).toMatchObject({ stage: "Away", debt: 6_000000n });
    const changes = (await indexer.StageChange.getAll()).filter((c) => c.account_id === BEN).map((c) => `${c.from}>${c.to}:${c.why}`);
    expect(changes.sort()).toEqual(["Shy>Wary:Missed", "Wary>Away:Defaulted"]);
    const kinds = (await indexer.Activity.getAll()).filter((a) => a.circle_id === C1).map((a) => a.kind);
    expect(kinds).toEqual(expect.arrayContaining(["PaidBack", "Credited"]));
  });

  it("builds the house from fully paid rounds, keeps keepsakes once, and tracks the streak", async () => {
    const indexer = createTestIndexer();
    const c = C1;
    await indexer.process({
      chains: {
        10143: {
          startBlock: B0,
          simulate: [
            ...twoPersonCircle(c, ANA, BEN, 1), // Ben pays round 2 late
            ...twoPersonCircle(C2, ANA, CAL, 20),
          ] as never,
        },
      },
    });
    // both rounds of each circle were paid by everyone with nothing covered
    expect((await indexer.Circle.getOrThrow(c)).housePieces).toBe(2);

    const kinds = async (who: string) =>
      (await indexer.Keepsake.getAll()).filter((k) => k.account_id === who).map((k) => k.kind).sort();
    // Ana: four on time in a row, two pots, two circles all on time; each kept once
    expect(await kinds(ANA)).toEqual(["Box", "Fish", "Gold", "Wand", "Yarn"]);
    // Ben: one on time then a late round, so no wand and no golden bowl
    expect(await kinds(BEN)).toEqual(["Box", "Fish", "Yarn"]);
    expect((await indexer.Keepsake.getOrThrow(`${ANA}-Box`)).circle).toBe(c);

    expect(await indexer.Account.getOrThrow(ANA)).toMatchObject({ onTimeStreak: 4, bestStreak: 4 });
    expect(await indexer.Account.getOrThrow(BEN)).toMatchObject({ onTimeStreak: 0, bestStreak: 1 });
  });

  it("adds no house piece for a round where someone was covered", async () => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        10143: {
          startBlock: B0,
          simulate: [
            created(C1, ANA, 2, 1),
            joined(C1, ANA, 0, 2),
            joined(C1, BEN, 1, 3),
            ev(C1, "Activated", { firstDue: BigInt(T0 + 2_000) }, 3),
            paid(C1, ANA, 1, 4),
            ev(C1, "Covered", { member: BEN, round: 1n, fromStake: 10_000000n, fromPool: 0n, shortfall: 0n }, 5),
            pot(C1, ANA, 1, 5),
            closed(C1, 1, 5),
          ] as never,
        },
      },
    });
    expect((await indexer.Circle.getOrThrow(C1)).housePieces).toBe(0);
  });
});
