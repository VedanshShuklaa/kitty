import { zeroHash } from "viem";

import { countdown, initials, money, span, when } from "./format";
import { CADENCES, cadenceOf, depositOf, potOf, type Member, type Rules, type Snapshot } from "./kitty";
import type { BeadTone, RingBead } from "./Ring";

export const nameAt = (names: string[], seat: number) => names[seat]?.trim() || `Seat ${seat + 1}`;

/** Ring beads for the current moment: who has paid, who is late, whose turn. */
export function beadsFor(s: Snapshot, names: string[], now: number): RingBead[] {
  const turn = s.state === "active" ? nextInLine(s.members)?.seat : undefined;
  return s.members.map((m) => {
    let tone: BeadTone;
    if (!m.address) tone = "empty";
    else if (m.standing === "defaulted") tone = "out";
    else if (s.state !== "active") tone = s.state === "forming" ? "paid" : "waiting";
    else if (m.paid) tone = "paid";
    else if (now > s.due) tone = "late";
    else tone = "waiting";
    return { label: initials(nameAt(names, m.seat)), tone, turn: m.seat === turn, received: m.received };
  });
}

/** FR-CIR-03: the rules in plain words, before anyone joins. */
export function rulesInWords(r: Rules): { lead: string; text: string }[] {
  const cad = cadenceOf(r);
  const every = cad ? CADENCES[cad].every : `every ${span(r.period)}`;
  const n = r.memberCount;
  const lines = [
    { lead: `${money(r.contribution)} ${every}.`, text: `Everyone puts in the same amount, starting ${when(Number(r.firstDue))}.` },
    { lead: `${n} people, ${n} rounds.`, text: `Each round, one person takes the ${money(potOf(r))} pot. Everyone gets a turn.` },
    r.maxBidBps > 0
      ? {
          lead: "Need it sooner?",
          text: `Offer to give up to ${r.maxBidBps / 100}% of a pot to take it early. The others share what you give up. With no offers, turns go in order.`,
        }
      : { lead: "Turns go in order.", text: "Bidding is off in this circle." },
    { lead: `${money(depositOf(r))} deposit.`, text: "You put it down when you join and get it back at the end." },
    {
      lead: "Late or short?",
      text: `You have ${span(r.grace)} after each due time. Miss a round and your deposit covers you; you catch up later.`,
    },
  ];
  return lines;
}

// Pure: given a circle snapshot and the time, what does the circle screen
// say, and which buttons does it offer? Kept free of React so it can be
// tested against every window edge.

export type ActionKind = "pay" | "bid" | "reveal" | "close" | "withdraw" | "cancel" | "arrears";
export type Action = { kind: ActionKind; label: string; amount?: bigint };

export type Plan = {
  headline: string;
  detail: string;
  actions: Action[]; // first one is the primary action
};

/** Seat-order fallback for a round with no winning bid (SRS 7.7 step 4). */
export function nextInLine(members: Member[]): Member | undefined {
  return (
    members.find((m) => m.address && m.standing === "good" && !m.received) ??
    members.find((m) => m.address && m.standing === "behind" && !m.received)
  );
}

export function eligibleBidders(members: Member[]): number {
  return members.filter((m) => m.address && m.standing === "good" && !m.received).length;
}

export function plan(s: Snapshot, now: number): Plan {
  const r = s.rules;
  const n = r.memberCount;
  const me = s.me;
  const mine = me ? s.members[me.seat] : undefined;

  if (s.state === "forming") {
    const filled = s.members.filter((m) => m.address).length;
    const deadline = Number(r.joinDeadline);
    if (now >= deadline) {
      return {
        headline: "Not everyone joined in time",
        detail: "Anyone can call the circle off now, and everyone gets their deposit back.",
        actions: [{ kind: "cancel", label: "Call off the circle" }],
      };
    }
    const left = n - filled;
    return {
      headline: left === 1 ? "Waiting for 1 more person" : `Waiting for ${left} more people`,
      detail: `Joining closes ${countdown(deadline, now)}. First payment is due ${when(Number(r.firstDue))}.`,
      actions: [],
    };
  }

  if (s.state === "cancelled" || s.state === "completed") {
    const amount = me?.withdrawable ?? 0n;
    const headline = s.state === "cancelled" ? "This circle was called off" : "Every round is done";
    if (amount > 0n) {
      return {
        headline,
        detail:
          s.state === "cancelled"
            ? `Your ${money(amount)} deposit is ready to collect.`
            : `${money(amount)} is ready for you: your deposit back, plus your share of what's left.`,
        actions: [{ kind: "withdraw", label: `Collect ${money(amount)}`, amount }],
      };
    }
    return { headline, detail: "Everything owed to you has been collected.", actions: [] };
  }

  // active
  const due = s.due;
  const actions: Action[] = [];
  const committed = !!me && me.commitment !== zeroHash;
  const revealOpen = now >= due && now <= due + r.revealWindow;
  const commitOpen = r.maxBidBps > 0 && now >= due - r.commitWindow && now < due;
  const payOpen = now <= due + r.grace;
  const closeOpen = now >= due + r.grace;
  const mustReveal = !!mine && committed && !mine.revealed && revealOpen;

  if (me && mine) {
    if (mustReveal) actions.push({ kind: "reveal", label: "Open my sealed offer" });
    if (!mine.paid && mine.standing !== "defaulted" && payOpen) {
      actions.push({ kind: "pay", label: `Pay ${money(me.pay)}`, amount: me.pay });
    }
  }
  if (closeOpen) actions.push({ kind: "close", label: "Hand out the pot" });
  if (me && mine && commitOpen && mine.standing === "good" && !mine.received && eligibleBidders(s.members) >= 2) {
    actions.push({ kind: "bid", label: committed ? "Change my offer" : "Bid for the pot" });
  }
  if (mine?.standing === "behind" && mine.arrears > 0n) {
    actions.push({ kind: "arrears", label: `Catch up ${money(mine.arrears)}`, amount: mine.arrears });
  }

  const paidCount = s.members.filter((m) => m.paid).length;
  const payers = s.members.filter((m) => m.address && m.standing !== "defaulted").length;

  let headline: string;
  let detail: string;
  if (closeOpen) {
    headline = `Round ${s.round} is ready to pay out`;
    detail = "Anyone in the circle can hand out the pot now.";
  } else if (now < due) {
    headline = paidCount >= payers ? "Everyone has paid" : `${paidCount} of ${payers} have paid`;
    detail = `Round ${s.round} of ${n} is due ${countdown(due, now)}.`;
    if (commitOpen) detail += " Bidding is open until then.";
  } else if (mustReveal) {
    headline = "Open your sealed offer";
    detail = `You have ${span(due + r.revealWindow - now)} to open it, or it won't count.`;
  } else {
    headline = "Late payments still count";
    detail = `The round closes ${countdown(due + r.grace, now)}. After that, deposits cover anyone who hasn't paid.`;
  }
  return { headline, detail, actions };
}
