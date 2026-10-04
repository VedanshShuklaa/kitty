import { indexer, type Activity, type EvmOnEventContext, type Member, type Round } from "envio";

import { account, bumpDay, logId, saveAccount } from "../lib/records";

// Circles, rounds and the record across them (SRS 8.1, 8.4). Each handler
// mirrors what Circle.sol did to its own storage when it emitted the event,
// so the feed and the record agree with the contract without reading it.

type Ctx = EvmOnEventContext;
type Ev = { srcAddress: string; logIndex: number; block: { number: number; timestamp: number }; transaction: { hash: string } };
type Line = Partial<Omit<Activity, "id" | "circle_id" | "at" | "block" | "txHash" | "kind">>;

const at = (e: Ev) => BigInt(e.block.timestamp);
const memberId = (circle: string, who: string) => `${circle}-${who}`;
const roundId = (circle: string, index: number) => `${circle}-${index}`;

function feed(context: Ctx, e: Ev, kind: string, line: Line = {}, circle = e.srcAddress): void {
  context.Activity.set({
    id: logId(e),
    circle_id: circle,
    kind,
    actor: line.actor,
    round: line.round,
    amount: line.amount,
    fromStake: line.fromStake,
    fromPool: line.fromPool,
    shortfall: line.shortfall,
    bps: line.bps,
    at: at(e),
    block: e.block.number,
    txHash: e.transaction.hash,
  });
}

function newRound(circle: string, index: number, dueAt: bigint): Round {
  return {
    id: roundId(circle, index),
    circle_id: circle,
    index,
    dueAt,
    closedAt: undefined,
    closer: undefined,
    recipient: undefined,
    gross: undefined,
    paid: undefined,
    discount: undefined,
    discountBps: undefined,
    holdback: undefined,
    arrearsRepaid: undefined,
    covered: 0n,
    shortfall: 0n,
    creditPerMember: undefined,
    payments: 0,
    bids: 0,
  };
}

async function round(context: Ctx, circle: string, index: number): Promise<Round> {
  const r = await context.Round.get(roundId(circle, index));
  if (r) return r;
  const c = await context.Circle.getOrThrow(circle);
  return newRound(circle, index, c.firstDue + BigInt((index - 1) * c.period));
}

// ------------------------------------------------------------ the factory

indexer.contractRegister({ contract: "CircleFactory", event: "CircleCreated" }, async ({ event, context }) => {
  context.chain.Circle.add(event.params.circle);
});

indexer.onEvent({ contract: "CircleFactory", event: "CircleCreated" }, async ({ event, context }) => {
  const r = event.params.rules;
  const t = at(event);
  context.Circle.set({
    id: event.params.circle,
    factory: event.srcAddress,
    organizer: event.params.organizer,
    memberCount: Number(r[0]),
    stakeBps: Number(r[1]),
    maxBidBps: Number(r[2]),
    poolShareBps: Number(r[3]),
    holdbackBps: Number(r[4]),
    yieldOn: r[5],
    contribution: r[6],
    firstDue: r[7],
    period: Number(r[8]),
    joinDeadline: r[12],
    state: "Forming",
    joined: 0,
    currentRound: 0,
    createdAt: t,
    activatedAt: undefined,
    endedAt: undefined,
    totalContributed: 0n,
    totalPaidOut: 0n,
    totalCovered: 0n,
    yieldEarned: undefined,
  });
  const org = await account(context, event.params.organizer, t);
  saveAccount(context, { ...org, circlesOrganized: org.circlesOrganized + 1 }, t);
  await bumpDay(context, t, { circlesCreated: 1 });
  feed(context, event, "Created", { actor: event.params.organizer, amount: r[6] }, event.params.circle);
});

// -------------------------------------------------------------- forming

// A member is a Kitty account from the moment they join, so their transfers
// are indexed from then on (see money.ts).
indexer.contractRegister({ contract: "Circle", event: "Joined" }, async ({ event, context }) => {
  context.chain.KittyAccount.add(event.params.member);
});

indexer.onEvent({ contract: "Circle", event: "Joined" }, async ({ event, context }) => {
  const circle = event.srcAddress;
  const who = event.params.member;
  const t = at(event);
  context.Member.set({
    id: memberId(circle, who),
    circle_id: circle,
    account_id: who,
    address: who,
    seat: Number(event.params.seat),
    standing: "Good",
    received: false,
    receivedRound: undefined,
    stake: event.params.stake,
    arrears: 0n,
    paidOnTime: 0,
    paidLate: 0,
    timesCovered: 0,
    contributed: 0n,
    potReceived: 0n,
    collected: 0n,
    joinedAt: t,
  });
  const c = await context.Circle.getOrThrow(circle);
  context.Circle.set({ ...c, joined: c.joined + 1 });
  const a = await account(context, who, t);
  saveAccount(context, { ...a, circlesJoined: a.circlesJoined + 1 }, t);
  await bumpDay(context, t, { joins: 1 });
  feed(context, event, "Joined", { actor: who, amount: event.params.stake });
});

indexer.onEvent({ contract: "Circle", event: "Activated" }, async ({ event, context }) => {
  const c = await context.Circle.getOrThrow(event.srcAddress);
  context.Circle.set({ ...c, state: "Active", currentRound: 1, activatedAt: at(event), firstDue: event.params.firstDue });
  context.Round.set(newRound(c.id, 1, event.params.firstDue));
  feed(context, event, "Started", { round: 1 });
});

indexer.onEvent({ contract: "Circle", event: "Cancelled" }, async ({ event, context }) => {
  const c = await context.Circle.getOrThrow(event.srcAddress);
  context.Circle.set({ ...c, state: "Cancelled", endedAt: event.params.at });
  feed(context, event, "Cancelled");
});

// ------------------------------------------------------------- payments

indexer.onEvent({ contract: "Circle", event: "Contributed" }, async ({ event, context }) => {
  const circle = event.srcAddress;
  const who = event.params.member;
  const t = at(event);
  const late = event.params.late;
  const paid = event.params.paid;
  const index = Number(event.params.round);

  const m = await context.Member.getOrThrow(memberId(circle, who));
  context.Member.set({
    ...m,
    paidOnTime: m.paidOnTime + (late ? 0 : 1),
    paidLate: m.paidLate + (late ? 1 : 0),
    contributed: m.contributed + paid,
  });
  const a = await account(context, who, t);
  saveAccount(
    context,
    { ...a, paidOnTime: a.paidOnTime + (late ? 0 : 1), paidLate: a.paidLate + (late ? 1 : 0), totalContributed: a.totalContributed + paid },
    t,
  );
  const c = await context.Circle.getOrThrow(circle);
  context.Circle.set({ ...c, totalContributed: c.totalContributed + paid });
  const r = await round(context, circle, index);
  context.Round.set({ ...r, payments: r.payments + 1 });

  context.Payment.set({
    id: logId(event),
    circle_id: circle,
    member_id: m.id,
    round: index,
    amount: paid,
    creditUsed: event.params.creditUsed,
    holdbackReleased: event.params.holdbackReleased,
    late,
    autopay: event.params.autopay,
    at: t,
    txHash: event.transaction.hash,
  });
  await bumpDay(context, t, { payments: 1, contributed: paid });
  // bps carries the late flag on a payment: 1 if it came in after the due time
  feed(context, event, "Paid", { actor: who, round: index, amount: paid, bps: late ? 1 : 0 });
});

indexer.onEvent({ contract: "Circle", event: "ArrearsPaid" }, async ({ event, context }) => {
  const m = await context.Member.getOrThrow(memberId(event.srcAddress, event.params.member));
  const arrears = m.arrears > event.params.amount ? m.arrears - event.params.amount : 0n;
  context.Member.set({ ...m, arrears, standing: m.standing === "Behind" ? "Good" : m.standing });
  feed(context, event, "CaughtUp", { actor: event.params.member, amount: event.params.amount });
});

// ----------------------------------------------------------------- bids

indexer.onEvent({ contract: "Circle", event: "BidCommitted" }, async ({ event, context }) => {
  const circle = event.srcAddress;
  const who = event.params.member;
  const index = Number(event.params.round);
  context.Bid.set({
    id: `${circle}-${index}-${who}`,
    circle_id: circle,
    member_id: memberId(circle, who),
    round: index,
    committedAt: at(event),
    revealedAt: undefined,
    discountBps: undefined,
    won: false,
  });
  const r = await round(context, circle, index);
  context.Round.set({ ...r, bids: r.bids + 1 });
  feed(context, event, "BidSealed", { actor: who, round: index });
});

// FR-TRU-09: a bid never touches standing, so this only updates the bid.
indexer.onEvent({ contract: "Circle", event: "BidRevealed" }, async ({ event, context }) => {
  const circle = event.srcAddress;
  const who = event.params.member;
  const index = Number(event.params.round);
  const id = `${circle}-${index}-${who}`;
  const b = await context.Bid.get(id);
  context.Bid.set({
    id,
    circle_id: circle,
    member_id: memberId(circle, who),
    round: index,
    committedAt: b?.committedAt,
    revealedAt: at(event),
    discountBps: Number(event.params.discountBps),
    won: false,
  });
  feed(context, event, "BidOpened", { actor: who, round: index, bps: Number(event.params.discountBps) });
});

// --------------------------------------------------- misses and defaults

indexer.onEvent({ contract: "Circle", event: "Covered" }, async ({ event, context }) => {
  const circle = event.srcAddress;
  const who = event.params.member;
  const t = at(event);
  const index = Number(event.params.round);
  const { fromStake, fromPool, shortfall } = event.params;
  const covered = fromStake + fromPool;

  const m = await context.Member.getOrThrow(memberId(circle, who));
  context.Member.set({ ...m, standing: "Behind", arrears: m.arrears + covered, timesCovered: m.timesCovered + 1 });
  const a = await account(context, who, t);
  saveAccount(context, { ...a, timesCovered: a.timesCovered + 1 }, t);
  const c = await context.Circle.getOrThrow(circle);
  context.Circle.set({ ...c, totalCovered: c.totalCovered + covered });
  const r = await round(context, circle, index);
  context.Round.set({ ...r, covered: r.covered + covered, shortfall: r.shortfall + shortfall });

  context.Cover.set({
    id: logId(event),
    circle_id: circle,
    member_id: m.id,
    round: index,
    kind: "Missed",
    fromStake,
    fromHoldback: 0n,
    fromPool,
    shortfall,
    at: t,
  });
  await bumpDay(context, t, { covered });
  feed(context, event, "Covered", { actor: who, round: index, amount: covered, fromStake, fromPool, shortfall });
});

indexer.onEvent({ contract: "Circle", event: "Defaulted" }, async ({ event, context }) => {
  const circle = event.srcAddress;
  const who = event.params.member;
  const t = at(event);
  const index = Number(event.params.round);
  const { fromStake, fromHoldback, fromPool, shortfall } = event.params;
  const covered = fromStake + fromHoldback + fromPool;

  const m = await context.Member.getOrThrow(memberId(circle, who));
  context.Member.set({ ...m, standing: "Defaulted" });
  const a = await account(context, who, t);
  // a default with nothing left unpaid is cleared the moment it happens
  saveAccount(
    context,
    {
      ...a,
      defaults: a.defaults + 1,
      openDefaults: a.openDefaults + (shortfall > 0n ? 1 : 0),
      lastDefaultClearedAt: shortfall > 0n ? a.lastDefaultClearedAt : t,
    },
    t,
  );
  const c = await context.Circle.getOrThrow(circle);
  context.Circle.set({ ...c, totalCovered: c.totalCovered + covered });
  const r = await round(context, circle, index);
  context.Round.set({ ...r, covered: r.covered + covered, shortfall: r.shortfall + shortfall });

  context.Cover.set({
    id: logId(event),
    circle_id: circle,
    member_id: m.id,
    round: index,
    kind: "Defaulted",
    fromStake,
    fromHoldback,
    fromPool,
    shortfall,
    at: t,
  });
  await bumpDay(context, t, { covered });
  feed(context, event, "Defaulted", {
    actor: who,
    round: index,
    amount: event.params.obligation,
    fromStake: fromStake + fromHoldback,
    fromPool,
    shortfall,
  });
});

indexer.onEvent({ contract: "Circle", event: "DefaultFilled" }, async ({ event, context }) => {
  const t = at(event);
  if (event.params.shortfall === 0n) {
    const a = await account(context, event.params.member, t);
    saveAccount(context, { ...a, openDefaults: Math.max(0, a.openDefaults - 1), lastDefaultClearedAt: t }, t);
  }
  feed(context, event, "DefaultFilled", {
    actor: event.params.member,
    round: Number(event.params.round),
    amount: event.params.filled,
    shortfall: event.params.shortfall,
  });
});

// ----------------------------------------------------------------- pots

indexer.onEvent({ contract: "Circle", event: "PotPaid" }, async ({ event, context }) => {
  const circle = event.srcAddress;
  const who = event.params.recipient;
  const t = at(event);
  const index = Number(event.params.round);
  const { gross, paid, discount, holdback, arrearsRepaid } = event.params;

  const m = await context.Member.getOrThrow(memberId(circle, who));
  const arrears = m.arrears > arrearsRepaid ? m.arrears - arrearsRepaid : 0n;
  context.Member.set({
    ...m,
    received: true,
    receivedRound: index,
    potReceived: m.potReceived + paid,
    arrears,
    standing: m.standing === "Behind" && arrears === 0n ? "Good" : m.standing,
  });
  const a = await account(context, who, t);
  saveAccount(context, { ...a, potsReceived: a.potsReceived + 1, totalReceived: a.totalReceived + paid }, t);
  const c = await context.Circle.getOrThrow(circle);
  context.Circle.set({ ...c, totalPaidOut: c.totalPaidOut + paid });

  const bid = await context.Bid.get(`${circle}-${index}-${who}`);
  const won = !!bid && discount > 0n;
  if (won) context.Bid.set({ ...bid, won: true });
  const r = await round(context, circle, index);
  context.Round.set({
    ...r,
    recipient: who,
    gross,
    paid,
    discount,
    discountBps: won ? bid.discountBps : 0,
    holdback,
    arrearsRepaid,
  });

  context.Payout.set({ id: logId(event), circle_id: circle, member_id: m.id, round: index, kind: "Pot", amount: paid, at: t, txHash: event.transaction.hash });
  await bumpDay(context, t, { paidOut: paid });
  feed(context, event, "PotPaid", { actor: who, round: index, amount: paid, bps: won ? bid.discountBps : undefined });
});

indexer.onEvent({ contract: "Circle", event: "CreditsIssued" }, async ({ event, context }) => {
  const r = await round(context, event.srcAddress, Number(event.params.round));
  context.Round.set({ ...r, creditPerMember: event.params.perMember });
});

indexer.onEvent({ contract: "Circle", event: "RoundClosed" }, async ({ event, context }) => {
  const circle = event.srcAddress;
  const index = Number(event.params.round);
  const r = await round(context, circle, index);
  context.Round.set({ ...r, closedAt: at(event), closer: event.params.closer });
  const c = await context.Circle.getOrThrow(circle);
  if (index < c.memberCount) {
    context.Circle.set({ ...c, currentRound: index + 1 });
    context.Round.set(newRound(circle, index + 1, c.firstDue + BigInt(index * c.period)));
  }
});

// ------------------------------------------------------------ the end

/**
 * Completed: each member who kept their place finishes a cycle, and anyone
 * they hadn't finished a circle with before counts as a new counterparty.
 */
indexer.onEvent({ contract: "Circle", event: "Completed" }, async ({ event, context }) => {
  const circle = event.srcAddress;
  const t = at(event);
  const c = await context.Circle.getOrThrow(circle);
  context.Circle.set({ ...c, state: "Completed", endedAt: event.params.at });
  feed(context, event, "Completed", { round: c.memberCount, amount: c.totalPaidOut });

  const members: Member[] = await context.Member.getWhere({ circle_id: { _eq: circle } });
  const accounts = await Promise.all(members.map((m) => account(context, m.address, t)));

  for (const [i, m] of members.entries()) {
    if (m.standing === "Defaulted") continue;
    const a = accounts[i];
    let fresh = 0;
    for (const other of members) {
      if (other.address === m.address) continue;
      const id = `${m.address}-${other.address}`;
      if (await context.Counterparty.get(id)) continue;
      context.Counterparty.set({ id, account: m.address, other: other.address, firstCircle: circle, at: t });
      fresh++;
    }
    saveAccount(
      context,
      {
        ...a,
        circlesCompleted: a.circlesCompleted + 1,
        counterparties: a.counterparties + fresh,
      },
      t,
    );
  }
});

indexer.onEvent({ contract: "Circle", event: "Withdrawn" }, async ({ event, context }) => {
  const circle = event.srcAddress;
  const who = event.params.member;
  const t = at(event);
  const m = await context.Member.getOrThrow(memberId(circle, who));
  context.Member.set({ ...m, collected: m.collected + event.params.amount });
  const a = await account(context, who, t);
  saveAccount(context, { ...a, totalReceived: a.totalReceived + event.params.amount }, t);
  context.Payout.set({
    id: logId(event),
    circle_id: circle,
    member_id: m.id,
    round: undefined,
    kind: "Collected",
    amount: event.params.amount,
    at: t,
    txHash: event.transaction.hash,
  });
  feed(context, event, "Collected", { actor: who, amount: event.params.amount });
});

// The vault settles a circle on its first withdrawal: assets above principal
// are the (simulated) yield its deposits earned.
indexer.onEvent({ contract: "StakeVault", event: "Settled" }, async ({ event, context }) => {
  const circle = event.params.circle;
  const c = await context.Circle.get(circle);
  if (!c) return;
  const { principal, assets, fees } = event.params;
  const earned = assets > principal ? assets - principal : 0n;
  context.Circle.set({ ...c, yieldEarned: earned });
  feed(context, event, "Settled", { amount: earned, shortfall: fees }, circle);
});
