import { zeroHash } from "viem";

import { countdown, money, span, when } from "./format";
import { CADENCES, cadenceOf, depositOf, potOf, type Member, type Rules, type Snapshot } from "./kitty";
import { canOfferIn, payoutOrder } from "./standing";

// FR-RST-03: until a roster is back, people are "Member 2" and so on
export const nameAt = (names: string[], seat: number) => names[seat]?.trim() || `Member ${seat + 1}`;

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
          text: `Offer to give up to ${r.maxBidBps / 100}% of a pot to take it early. The others share what you give up. Newcomers can offer from the second half; members with a record, any round.`,
        }
      : { lead: "No offers.", text: "Bidding is off in this circle." },
    {
      lead: "Who's paid when.",
      text: "Members whose cats trust them more are paid first; among equals, the order of seats. Anyone who owes another circle goes to the back.",
    },
    {
      lead: `${money(depositOf(r))} deposit.`,
      text: "You put it down when you join (two rounds' worth if your cat is wary). Any deposit left after covering missed payments is returned at the end.",
    },
    {
      lead: "Late or short?",
      text: `You have ${span(r.grace)} after each due time. Miss a round and your deposit covers you; you catch up later.`,
    },
  ];
  if (r.yieldOn) {
    lines.push({
      lead: "Deposits earn while they're locked.",
      text: "Most of the deposits sit in a test version of earnAUSD. What they earn is simulated testnet yield, shared out by deposit at the end.",
    });
  }
  return lines;
}

// Pure: given a circle snapshot and the time, what does the circle screen
// say, and which buttons does it offer? Kept free of React so it can be
// tested against every window edge.

export type ActionKind = "pay" | "bid" | "reveal" | "close" | "withdraw" | "cancel" | "arrears" | "repay";
export type Action = { kind: ActionKind; label: string; amount?: bigint };

export type Plan = {
  headline: string;
  detail: string;
  actions: Action[]; // first one is the primary action
};

/** The no-offer fallback (Circle._firstInOrder): best stage first, then seat; Behind only when nobody else is left. */
export function nextInLine(members: Member[]): Member | undefined {
  const order = payoutOrder(members);
  return (
    order.find((m) => m.address && m.standing === "good" && !m.received) ??
    order.find((m) => m.address && m.standing === "behind" && !m.received)
  );
}

/** Circle._canOffer: up to date, no pot yet, and inside their stage's offer window. */
export const canOffer = (m: Member, round: number, memberCount: number) =>
  !!m.address && m.standing === "good" && !m.received && canOfferIn(m.offerFrom, round, memberCount);

export function eligibleBidders(members: Member[], round: number, memberCount: number): number {
  return members.filter((m) => canOffer(m, round, memberCount)).length;
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
    // FR-TRU-17/18: what a default or unpaid catch-up cost the others comes first
    const owed = me ? (s.members[me.seat]?.owed ?? 0n) : 0n;
    if (s.state === "completed" && owed > 0n) {
      return {
        headline,
        detail: `The rounds you didn't pay cost the circle ${money(owed)}. Paying it back goes to the members who lost it, and your cat comes home.`,
        actions: [
          { kind: "repay", label: `Pay back ${money(owed)}`, amount: owed },
          ...(amount > 0n ? [{ kind: "withdraw" as const, label: `Collect ${money(amount)}`, amount }] : []),
        ],
      };
    }
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
  if (me && mine && commitOpen && canOffer(mine, s.round, r.memberCount) && eligibleBidders(s.members, s.round, r.memberCount) >= 2) {
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
