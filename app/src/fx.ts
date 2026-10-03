import AsyncStorage from "@react-native-async-storage/async-storage";

import { apiUrl } from "./config";
import { timedFetch } from "./net";

// FR-SND-07: a local-currency estimate beside dollar amounts, from rates at
// most 12 hours old, always marked approximate. Countries without a currency
// here simply show dollars.

export type Rates = { at: number; rates: Record<string, number> };

const CURRENCY: Record<string, { code: string; symbol: string }> = {
  GH: { code: "GHS", symbol: "GH₵" },
  NG: { code: "NGN", symbol: "₦" },
  KE: { code: "KES", symbol: "KSh " },
};

const KEY = "kitty:fx";
const MAX_AGE = 12 * 3600;

export async function loadRates(now = Date.now() / 1000): Promise<Rates | null> {
  const raw = await AsyncStorage.getItem(KEY).catch(() => null);
  const cached = raw ? (JSON.parse(raw) as Rates) : null;
  if (cached && now - cached.at < MAX_AGE) return cached;
  try {
    const res = await timedFetch(`${apiUrl}/api/fx`, {}, 8_000);
    if (!res.ok) throw new Error();
    const fresh = (await res.json()) as Rates;
    await AsyncStorage.setItem(KEY, JSON.stringify(fresh)).catch(() => {});
    return fresh;
  } catch {
    return cached && now - cached.at < 2 * MAX_AGE ? cached : null;
  }
}

/** "≈ GH₵155" for $10 in Ghana; null when there's no rate or no local currency. */
export function localEstimate(usdUnits: bigint, country: string | undefined, rates: Rates | null): string | null {
  const cur = country ? CURRENCY[country] : undefined;
  const rate = cur && rates?.rates[cur.code];
  if (!cur || !rate) return null;
  const value = (Number(usdUnits) / 1e6) * rate;
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 100) / 100;
  return `≈ ${cur.symbol}${rounded.toLocaleString("en-US")}`;
}
