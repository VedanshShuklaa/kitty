import { parseUnits } from "viem";

// AUSD has 6 decimals. Amounts on screen are dollars, rounded to cents,
// with whole-dollar amounts shown without ".00".
export function money(v: bigint): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const cents = (abs + 5_000n) / 10_000n;
  const dollars = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const c = cents % 100n;
  const s = `$${dollars}${c === 0n ? "" : `.${c.toString().padStart(2, "0")}`}`;
  return neg ? `-${s}` : s;
}

/**
 * Parses "12", "12.5", "$1,200.00", or a comma-decimal amount like "2,5" into
 * AUSD units; null if it isn't an amount. A comma followed by one or two
 * digits at the very end is the decimal separator (the decimal pad types it
 * in French, German, Spanish and Portuguese locales); any other comma is a
 * thousands separator.
 */
export function parseMoney(input: string): bigint | null {
  let t = input.replace(/[$\s]/g, "");
  const decimal = /^(.*),(\d{1,2})$/.exec(t);
  if (decimal) {
    let whole = decimal[1];
    if (whole.includes(".")) {
      // "1.200,50": dots are the thousands separator here
      if (!/^\d{1,3}(\.\d{3})+$/.test(whole)) return null;
      whole = whole.replace(/\./g, "");
    } else {
      whole = whole.replace(/,/g, "");
    }
    t = `${whole}.${decimal[2]}`;
  } else {
    t = t.replace(/,/g, "");
  }
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return null;
  return parseUnits(t, 6);
}

const MIN = 60;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "45 sec", "4 min", "2 h 5 min", "3 days" */
export function span(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < MIN) return `${s} sec`;
  if (s < HOUR) return `${Math.round(s / MIN)} min`;
  if (s < DAY) {
    const h = Math.floor(s / HOUR);
    const m = Math.round((s % HOUR) / MIN);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.round(s / DAY);
  return d === 1 ? "1 day" : `${d} days`;
}

/** "in 4 min" / "4 min ago" / "now" */
export function countdown(target: number, now: number): string {
  const diff = target - now;
  if (Math.abs(diff) < 1) return "now";
  return diff > 0 ? `in ${span(diff)}` : `${span(-diff)} ago`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 14 Oct, 18:30" in the phone's local time */
export function when(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${hh}:${mm}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** The full address in groups of four, so it can be read out and compared: "0x1234 5678 9abc …". */
export function groupedAddress(a: string): string {
  const hex = a.startsWith("0x") ? a.slice(2) : a;
  return `0x${(hex.match(/.{1,4}/g) ?? []).join(" ")}`;
}
