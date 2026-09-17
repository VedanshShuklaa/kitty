import { indexer } from "envio";

// A CircleFactory clone isn't known at config time, so the indexer registers
// each Circle address dynamically the moment the factory creates it.
// contractRegister only wires up the dynamic contract; entity writes for the
// same event happen in the onEvent handler below.
indexer.contractRegister({ contract: "CircleFactory", event: "CircleCreated" }, async ({ event, context }) => {
  context.chain.Circle.add(event.params.circle);
});

indexer.onEvent({ contract: "CircleFactory", event: "CircleCreated" }, async ({ event, context }) => {
  context.Circle.set({
    id: event.params.circle,
    organizer: event.params.organizer,
    createdAt: BigInt(event.block.timestamp),
    completedAt: undefined,
  });
});

indexer.onEvent({ contract: "Circle", event: "Joined" }, async ({ event, context }) => {
  const memberId = `${event.srcAddress}-${event.params.member}`;
  context.Member.set({
    id: memberId,
    circle_id: event.srcAddress,
    address: event.params.member,
    seat: Number(event.params.seat),
    stake: event.params.stake,
    paidOnTime: 0n,
    paidLate: 0n,
    lastPaymentAt: undefined,
  });
});

indexer.onEvent({ contract: "Circle", event: "Contributed" }, async ({ event, context }) => {
  const memberId = `${event.srcAddress}-${event.params.member}`;
  const member = await context.Member.getOrThrow(memberId);
  context.Member.set({
    ...member,
    paidOnTime: member.paidOnTime + (event.params.late ? 0n : 1n),
    paidLate: member.paidLate + (event.params.late ? 1n : 0n),
    lastPaymentAt: BigInt(event.block.timestamp),
  });
  context.Payment.set({
    id: `${event.transaction.hash}-${event.logIndex}`,
    circle_id: event.srcAddress,
    member_id: memberId,
    round: Number(event.params.round),
    amount: event.params.paid,
    creditUsed: event.params.creditUsed,
    holdbackReleased: event.params.holdbackReleased,
    late: event.params.late,
    autopay: event.params.autopay,
    at: BigInt(event.block.timestamp),
  });
});

indexer.onEvent({ contract: "Circle", event: "PotPaid" }, async ({ event, context }) => {
  context.Round.set({
    id: `${event.srcAddress}-${event.params.round}`,
    circle_id: event.srcAddress,
    closedAt: BigInt(event.block.timestamp),
    recipient: event.params.recipient,
    gross: event.params.gross,
    paid: event.params.paid,
    discount: event.params.discount,
    holdback: event.params.holdback,
  });
});

indexer.onEvent({ contract: "Circle", event: "Completed" }, async ({ event, context }) => {
  const circle = await context.Circle.getOrThrow(event.srcAddress);
  context.Circle.set({ ...circle, completedAt: event.params.at });
});
