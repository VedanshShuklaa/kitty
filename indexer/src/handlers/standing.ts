import { indexer } from "envio";

import { account, logId, saveAccount } from "../lib/records";

// "Feed the Kitty": standing lives in KittyRecord, written only by circles.
// The indexer keeps its history (stage changes, debts, adoption) and each
// member's stage at join, for the album and the circle feed. The rules are
// not repeated here: every stage comes from the record's own events.

// Same order as IKittyRecord.Stage and IKittyRecord.Why
const STAGES = ["Away", "Wary", "Shy", "Friendly", "AtHome", "Family"];
const WHY = ["Joined", "Missed", "Defaulted", "Repaid", "Finished", "Forgiven", "Left"];

const at = (e: { block: { timestamp: number } }) => BigInt(e.block.timestamp);

indexer.onEvent({ contract: "Circle", event: "Placed" }, async ({ event, context }) => {
  const id = `${event.srcAddress}-${event.params.member}`;
  const m = await context.Member.get(id);
  if (m) context.Member.set({ ...m, stage: STAGES[Number(event.params.stage)] ?? "Shy" });
});

indexer.onEvent({ contract: "Circle", event: "Repaid" }, async ({ event, context }) => {
  context.Activity.set({
    id: logId(event),
    circle_id: event.srcAddress,
    kind: "PaidBack",
    actor: event.params.member,
    round: undefined,
    amount: event.params.amount,
    fromStake: undefined,
    fromPool: undefined,
    shortfall: undefined,
    bps: undefined,
    at: at(event),
    block: event.block.number,
    logIndex: event.logIndex,
    txHash: event.transaction.hash,
  });
});

// a debtor's pot in another circle paid their debt here (FR-TRU-18)
indexer.onEvent({ contract: "Circle", event: "DebtPaidElsewhere" }, async ({ event, context }) => {
  context.Activity.set({
    id: logId(event),
    circle_id: event.srcAddress,
    kind: "PaidDebt",
    actor: event.params.member,
    round: undefined,
    amount: event.params.amount,
    fromStake: undefined,
    fromPool: undefined,
    shortfall: undefined,
    bps: undefined,
    at: at(event),
    block: event.block.number,
    logIndex: event.logIndex,
    txHash: event.transaction.hash,
  });
});

// a missed round's short part, or a default paid back, credited to a member who lost it
indexer.onEvent({ contract: "Circle", event: "ArrearsCredited" }, async ({ event, context }) => {
  context.Activity.set({
    id: logId(event),
    circle_id: event.srcAddress,
    kind: "Credited",
    actor: event.params.to,
    round: undefined,
    amount: event.params.amount,
    fromStake: undefined,
    fromPool: undefined,
    shortfall: undefined,
    bps: undefined,
    at: at(event),
    block: event.block.number,
    logIndex: event.logIndex,
    txHash: event.transaction.hash,
  });
});

indexer.onEvent({ contract: "KittyRecord", event: "StageChanged" }, async ({ event, context }) => {
  const t = at(event);
  const who = event.params.account;
  const to = STAGES[Number(event.params.to)] ?? "Shy";
  context.StageChange.set({
    id: logId(event),
    account_id: who,
    from: STAGES[Number(event.params.from)] ?? "Shy",
    to,
    why: WHY[Number(event.params.why)] ?? "Joined",
    at: t,
    txHash: event.transaction.hash,
  });
  const a = await account(context, who, t);
  saveAccount(context, { ...a, stage: to }, t);
});

indexer.onEvent({ contract: "KittyRecord", event: "DebtChanged" }, async ({ event, context }) => {
  const t = at(event);
  const a = await account(context, event.params.account, t);
  // a debt of zero means every default is paid off, however many were open
  const cleared = event.params.debt === 0n;
  saveAccount(
    context,
    { ...a, debt: event.params.debt, openDefaults: cleared ? 0 : a.openDefaults, lastDefaultClearedAt: cleared ? t : a.lastDefaultClearedAt },
    t,
  );
});

indexer.onEvent({ contract: "KittyCats", event: "Adopted" }, async ({ event, context }) => {
  const t = at(event);
  const a = await account(context, event.params.owner, t);
  saveAccount(context, { ...a, catAdoptedAt: a.catAdoptedAt ?? t }, t);
});
