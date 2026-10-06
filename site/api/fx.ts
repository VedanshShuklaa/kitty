import { json, kvGet, kvSet } from "./_lib/kv.js";

// FR-SND-07: dollar amounts on the phone carry an estimate in the member's own
// currency. Rates are cached for at most 12 hours, here and on the phone, and
// the app always marks the figure as approximate.
//
//   GET /api/fx  -> { at, rates: { GHS, NGN, KES, ... } }   per US dollar

const MAX_AGE = 12 * 3600;
const CURRENCIES = ["GHS", "NGN", "KES", "ZAR", "UGX", "TZS", "XOF", "XAF", "GBP", "EUR"];

type Rates = { at: number; rates: Record<string, number> };

export async function GET(): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const cached = await kvGet("fx:usd").catch(() => null);
  const prior = cached ? (JSON.parse(cached) as Rates) : null;
  if (prior && now - prior.at < MAX_AGE) return answer(prior, now);

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(5_000) });
    const body = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (body.result !== "success" || !body.rates) throw new Error("rates unavailable");
    const all = body.rates;
    // only sane numbers get cached for 12 hours
    const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
    const fresh: Rates = { at: now, rates: Object.fromEntries(CURRENCIES.filter((c) => ok(all[c])).map((c) => [c, all[c]])) };
    await kvSet("fx:usd", JSON.stringify(fresh)).catch(() => {});
    return answer(fresh, now);
  } catch {
    // a stale rate is still better than none, and the phone shows its age
    return prior ? answer(prior, now) : json({ error: "Rates are unavailable right now." }, 503);
  }
}

const answer = (r: Rates, now: number) =>
  json(r, 200, { "cache-control": `public, s-maxage=${Math.max(60, MAX_AGE - (now - r.at))}` });
