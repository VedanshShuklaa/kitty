import { createPublicClient, defineChain, http, isAddress, isHex, keccak256, toBytes, verifyMessage, type Address, type Hex } from "viem";

// Shared by the Kitty API functions. Files under an underscore folder are not
// deployed as functions of their own.
//
// The store is Upstash Redis (Vercel Marketplace), spoken to over its REST
// API. It only ever holds ciphertext: rosters, wrapped roster keys and
// profiles, each sealed on the phone (SRS 15.4, FR-RST-02).

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

async function redis<T>(command: (string | number)[]): Promise<T> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("store not configured");
  const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(command) });
  const body = (await res.json()) as { result?: T; error?: string };
  if (!res.ok || body.error) throw new Error(body.error ?? `store answered ${res.status}`);
  return body.result as T;
}

export const kvGet = (key: string) => redis<string | null>(["GET", key]);
export const kvSet = (key: string, value: string) => redis<string>(["SET", key, value]);

/** A sealed blob from the phone: AES-256-GCM, hex. Nothing else is accepted. */
export type Sealed = { v: 1; iv: Hex; ct: Hex };

export function isSealed(x: unknown): x is Sealed {
  const s = x as Sealed;
  return (
    !!s &&
    s.v === 1 &&
    isHex(s.iv) &&
    s.iv.length === 26 &&
    isHex(s.ct) &&
    s.ct.length > 34 &&
    s.ct.length <= 16_384 &&
    Object.keys(s).length === 3
  );
}

export const chain = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz"] } },
});

export const publicClient = () => createPublicClient({ chain, transport: http() });

/**
 * What a phone signs to write: the kind of record, where it goes, a hash of
 * the blob and the time. The server rejects anything older than five minutes
 * (NFR-SEC-04), so a captured request can't be replayed later.
 */
export const writeMessage = (kind: string, where: string, blob: Sealed, at: number) =>
  `kitty.api.v1|${kind}|${where.toLowerCase()}|${keccak256(toBytes(JSON.stringify(blob)))}|${at}`;

export async function signedBy(
  expected: Address,
  kind: string,
  where: string,
  blob: Sealed,
  at: unknown,
  sig: unknown,
): Promise<boolean> {
  if (typeof at !== "number" || Math.abs(Date.now() / 1000 - at) > 300) return false;
  if (typeof sig !== "string" || !isHex(sig)) return false;
  return verifyMessage({ address: expected, message: writeMessage(kind, where, blob, at), signature: sig }).catch(() => false);
}

export const addressParam = (url: URL, name: string): Address | null => {
  const v = url.searchParams.get(name);
  return v && isAddress(v) ? (v.toLowerCase() as Address) : null;
};
