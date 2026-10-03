// Kitty's signing session (SRS 15.4, FR-SES). Mera's session signs until it is
// ended and has no scope or expiry of its own; this file is that policy.

/** What a signing action needs from the member. */
export type Prompt = "none" | "fresh";

// FR-SES-01: exactly these sign without a prompt. They move no value away from
// the member, or move it only where rules the member already accepted send it.
const NO_PROMPT = new Set([
  "faucet", // get test dollars
  "whitelist", // approve for Instant Settlement
  "storage", // store the encrypted profile, roster or wrapped key
  "pay", // this round's contribution, fixed by the circle's rules
  "arrears", // catch up on a covered miss, same rules
  "bid", // seal or open an offer
  "reveal",
  "close", // hand out the pot
  "withdraw", // collect your own balance
  "cancel", // call off a circle that never started: everyone gets their deposit back
  "claim", // take money someone sent you by link
]);

// A fresh fingerprint for anything that commits new money or sends it where the
// member chooses: join, create, send, convert, send by link, take a link back.
export const promptFor = (action: string): Prompt => (NO_PROMPT.has(action) ? "none" : "fresh");

export const BACKGROUND_LIMIT_MS = 5 * 60_000;
export const IDLE_LIMIT_MS = 30 * 60_000;

/** FR-SES-02: a session ends after 5 minutes in the background or 30 minutes idle. */
export function expired(now: number, lastTouch: number, backgroundSince: number | null): boolean {
  if (backgroundSince !== null && now - backgroundSince >= BACKGROUND_LIMIT_MS) return true;
  return now - lastTouch >= IDLE_LIMIT_MS;
}
