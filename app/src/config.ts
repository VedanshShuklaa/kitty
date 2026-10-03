import Constants from "expo-constants";
import type { Address } from "viem";

// Runtime config comes from app.config.ts `extra`, which resolves env vars
// and reads deployments/10143.json at build time. Reading process.env
// directly here would give `undefined` in any EAS build without env vars.
type Extra = {
  rpId?: string;
  siteUrl?: string;
  apiUrl?: string;
  indexerUrl?: string;
  contracts?: {
    chainId: number;
    circleFactory: Address;
    ausd: Address;
    ausdFaucet: Address;
    ctk: Address;
    pair: Address;
    whitelister: Address;
  };
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

if (!extra.rpId || !extra.siteUrl || !extra.apiUrl || !extra.indexerUrl || !extra.contracts) {
  throw new Error("app.config.ts extra is incomplete");
}

export const rpId: string = extra.rpId;
export const siteUrl: string = extra.siteUrl;
export const apiUrl: string = extra.apiUrl;
export const indexerUrl: string = extra.indexerUrl;
export const contracts = extra.contracts;
