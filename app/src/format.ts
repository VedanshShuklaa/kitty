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

/** Parses "12", "12.5" or "$1,200.00" into AUSD units; null if it isn't an amount. */
export function parseMoney(input: string): bigint | null {
  const t = input.replace(/[$,\s]/g, "");
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
