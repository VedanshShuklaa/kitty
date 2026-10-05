import { BaseError, ContractFunctionRevertedError } from "viem";

// FR-APP-06: every contract error maps to one plain sentence that says what
// to do next. No crypto vocabulary (FR-APP-03).
const CONTRACT: Record<string, string> = {
  BadRules: "Those settings don't fit together. Try a later first payment.",
  WrongState: "This circle isn't open for that right now. Pull down to refresh.",
  NotMember: "Only members of this circle can do that.",
  SeatTaken: "Someone already took this place in the circle.",
  BadInvite: "This invite doesn't match. Ask the organizer to send you a fresh link.",
  JoinClosed: "Joining has closed for this circle.",
  WrongRound: "That round has already moved on. Pull down to refresh.",
  TooEarly: "It's too early for that. Try again when the window opens.",
  TooLate: "The window for that has closed.",
  AlreadyPaid: "You've already paid this round.",
  NotEligible: "You can't make an offer this round. Offers are open to members who are up to date, haven't had the pot, and whose cat allows it this round, and there must be at least two of them.",
  BiddingOff: "Bidding is turned off for this circle.",
  BidTooHigh: "That offer is above this circle's limit.",
  BadReveal: "Your sealed offer couldn't be matched, so it won't count this round.",
  AutopayOff: "Autopay is off for this member.",
  NothingToWithdraw: "There's nothing left for you to collect.",
  Owing: "You still owe another circle. Pay that back on Account, then you can join.",
  TooManyCircles: "You're already in as many circles as your cat allows at once. Finish one first.",
  MaxFrequencyExceeded: "The test-dollar tap is busy. Try again in a minute.",
};

export type ErrorContext = "faucet" | "passkey" | undefined;

export function explain(e: unknown, context?: ErrorContext): string {
  // Passkey errors from Mera carry a code and wrap the platform error in `cause`.
  const chain: unknown[] = [];
  for (let err: unknown = e; err && chain.length < 6; err = (err as { cause?: unknown }).cause) chain.push(err);
  const codes = chain.map((x) => (x as { code?: unknown }).code).filter(Boolean).map(String);
  const text = chain.map((x) => (x instanceof Error ? x.message : String(x))).join(" | ");

  if (codes.includes("PRF_UNAVAILABLE")) {
    return "This phone's passkey manager can't unlock Kitty. Save the passkey to Google Password Manager and try again.";
  }
  if (codes.includes("PASSKEY_OPERATION_FAILED") || context === "passkey") {
    if (/cancel/i.test(text)) return "Cancelled.";
    if (/no credentials|no passkey|NoCredential/i.test(text)) {
      return "No Kitty passkey on this phone yet. Create an account first, or sign in to Google on this phone.";
    }
    return `Your phone couldn't use a passkey. Check that a screen lock is set and Google Password Manager is on. (${text})`;
  }

  if (e instanceof BaseError) {
    const reverted = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && CONTRACT[name]) return CONTRACT[name];
      return "That step was refused. Pull down to refresh and try again.";
    }
    const detail = `${e.shortMessage} ${e.details ?? ""}`;
    if (/insufficient funds|balance/i.test(detail)) {
      return "Your account needs a top-up before it can do this. Tap Get test dollars on the home screen.";
    }
    if (/fetch|network|timeout|timed out|HTTP request failed/i.test(detail)) {
      return "Couldn't reach the network. Check your connection and try again.";
    }
    return e.shortMessage;
  }
  if (e instanceof Error) return e.message;
  return "Something went wrong. Try again.";
}
