import { encodeAbiParameters, isAddress, keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { json } from "./_lib/kv.js";
import { nextStep, TIER_BPS, tierOf, type Track } from "./_lib/standing.js";

// SRS 7.11, the tier attestor. Reads a member's record from the indexer, works
// out their tier now, and signs the share of a circle's stake that tier posts.
// The attestation is bound to the member and the factory and lasts an hour.
// It can only ever lower a stake inside the circle's own rule, so this needs
// no auth: anyone can ask for anyone's, and only that member can use it.
//
//   GET /api/tier?account=0x…&factory=0x…
//   → { tier, next, tierBps, attestation | null, expiry, attestor }

const CHAIN_ID = 10143n;
const TTL = 3600n;
const TIER_TYPEHASH = keccak256(toBytes("kitty.tier.v1"));

type Row = Omit<Track, "lastDefaultClearedAt"> & { lastDefaultClearedAt: string | null };

const EMPTY: Track = {
  paidOnTime: 0,
  paidLate: 0,
  timesCovered: 0,
  defaults: 0,
  openDefaults: 0,
  lastDefaultClearedAt: undefined,
  counterparties: 0,
  cycleWeight: 0,
};

async function record(account: string): Promise<Track> {
  const upstream = process.env.INDEXER_URL;
  if (!upstream) throw new Error("indexer not configured");
  const res = await fetch(upstream, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `query T($id: String!) { Account_by_pk(id: $id) {
        paidOnTime paidLate timesCovered defaults openDefaults lastDefaultClearedAt counterparties cycleWeight
      } }`,
      variables: { id: account.toLowerCase() },
    }),
    signal: AbortSignal.timeout(8_000),
  });
  const body = (await res.json()) as { data?: { Account_by_pk: Row | null }; errors?: unknown[] };
  if (!res.ok || body.errors?.length || !body.data) throw new Error("indexer error");
  const a = body.data.Account_by_pk;
  if (!a) return EMPTY;
  return { ...a, lastDefaultClearedAt: a.lastDefaultClearedAt === null ? undefined : BigInt(a.lastDefaultClearedAt) };
}

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const account = q.get("account") ?? "";
  const factory = q.get("factory") ?? "";
  if (!isAddress(account) || !isAddress(factory)) return json({ error: "Bad request." }, 400);

  let track: Track;
  try {
    track = await record(account);
  } catch {
    return json({ error: "Kitty's records didn't answer." }, 502);
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  const tier = tierOf(track, now);
  const next = nextStep(track, now);
  const tierBps = TIER_BPS[tier];
  const out = { tier, tierBps, next: next && { ...next, heldUntil: next.heldUntil?.toString() ?? null } };
  const noStore = { "cache-control": "no-store" };

  const key = process.env.TIER_ATTESTOR_KEY as Hex | undefined;
  // a Newcomer posts the full stake, which needs no signature
  if (!key || tierBps === 10_000) return json({ ...out, attestation: null, expiry: null, attestor: null }, 200, noStore);

  const signer = privateKeyToAccount(key);
  const expiry = now + TTL;
  const digest = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "address" }, { type: "uint16" }, { type: "uint64" }],
      [TIER_TYPEHASH, CHAIN_ID, factory, account, tierBps, expiry],
    ),
  );
  const sig = await signer.signMessage({ message: { raw: digest } });
  const attestation = encodeAbiParameters([{ type: "uint16" }, { type: "uint64" }, { type: "bytes" }], [tierBps, expiry, sig]);
  return json({ ...out, attestation, expiry: expiry.toString(), attestor: signer.address }, 200, noStore);
}
