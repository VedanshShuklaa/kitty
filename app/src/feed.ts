import type { Address } from "viem";

import { money } from "./format";
import type { Activity, Transfer } from "./indexer";

// The circle's activity feed and the money list, in plain words (FR-APP-03).
// Pure, so every sentence is tested.

type Who = (a: Address | null) => string;

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;

/** One line of a circle's feed, or null for rows that aren't worth a line. */
export function feedLine(a: Activity, who: Who): string | null {
  const name = who(a.actor);
  const amt = a.amount !== null ? money(a.amount) : "";
  switch (a.kind) {
    case "Created":
      return `${name} started the circle.`;
    case "Joined":
      return `${name} joined and put down ${amt}.`;
    case "Started":
      return "Everyone's in. Round 1 has started.";
    case "Paid":
      return `${name} paid ${amt} for round ${a.round}${a.bps === 1 ? ", after the due time" : ""}.`;
    case "BidSealed":
      return `${name} sealed an offer for round ${a.round}.`;
    case "BidOpened":
      return `${name} opened their offer: ${pct(a.bps ?? 0)} of the pot.`;
    case "Covered": {
      // FR-DEF-04: say what covered the miss, and whether the pot was whole
      const parts = [a.fromStake ? `their deposit covered ${money(a.fromStake)}` : null, a.fromPool ? `the pool ${money(a.fromPool)}` : null].filter(Boolean);
      const short = a.shortfall && a.shortfall > 0n ? `, and the pot came up ${money(a.shortfall)} short` : ", so the pot was paid in full";
      return `${name} missed round ${a.round}. ${capitalise(parts.join(" and ") || "nothing could cover it")}${short}.`;
    }
    case "Defaulted": {
      const short = a.shortfall && a.shortfall > 0n ? ` ${money(a.shortfall)} is still owed.` : " Everything owed was covered.";
      return `${name} stopped paying after taking the pot. Their deposit and held-back money covered ${money(a.fromStake ?? 0n)}, the pool ${money(a.fromPool ?? 0n)}.${short}`;
    }
    case "DefaultFilled":
      return `${amt} of ${possessive(name)} missed payments was made good.`;
    case "CaughtUp":
      return `${name} caught up with ${amt}.`;
    case "PotPaid":
      return `${name} took the round ${a.round} pot: ${amt}${a.bps ? `, after giving up ${pct(a.bps)}` : ""}.`;
    case "Completed":
      return "The circle is complete. Everyone can collect what's left of their deposit.";
    case "Cancelled":
      return "The circle was called off. Everyone can collect their deposit.";
    case "Collected":
      return `${name} collected ${amt}.`;
    case "Settled":
      return a.amount && a.amount > 0n ? `Deposits earned ${amt} while locked (simulated testnet yield).` : null;
    default:
      return null;
  }
}

/** One line of the money list on Home, from this account's side. */
export function moneyLine(t: Transfer, me: Address, who: Who): { text: string; sign: "in" | "out" | "none" } {
  const mine = (a: Address) => a.toLowerCase() === me.toLowerCase();
  const amt = money(t.amountUsd);
  if (t.route === "Faucet") return { text: `${amt} test dollars added`, sign: "in" };
  if (t.route === "Convert") {
    return { text: t.token === "CTK" ? `${amt} moved to ready to cash out` : `${amt} moved back to dollars`, sign: "none" };
  }
  const how = t.route === "CashOut" ? ", ready to cash out" : "";
  if (mine(t.from)) return { text: `You sent ${who(t.to)} ${amt}${how}`, sign: "out" };
  return { text: `${who(t.from)} sent you ${amt}${how}`, sign: "in" };
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const possessive = (name: string) => (name === "You" ? "your" : `${name}'s`);
