import { getAddress, type Address, type Hex } from "viem";

import { indexerUrl } from "./config";
import { timedFetch } from "./net";

// Reads from Kitty's Envio indexer (SRS 15.6). Monad's public RPC serves 100
// blocks of logs per call and no old state, so anything about the past comes
// from here: which circles an account is in, each circle's activity, the
// record across circles, and sends and receives. Everything money-moving
// still reads the chain directly, so the app keeps working if this is down
// (FR-RST-03).

export class IndexerError extends Error {}

export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await timedFetch(indexerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new IndexerError("Couldn't reach Kitty's records.");
  }
  const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message: string }[] };
  if (!res.ok || body.errors?.length || !body.data) throw new IndexerError(body.errors?.[0]?.message ?? "Kitty's records didn't answer.");
  return body.data;
}

const lower = (a: string) => a.toLowerCase();
const big = (v: string | number | null | undefined) => (v === null || v === undefined ? null : BigInt(v));

// ----------------------------------------------------------------- circles

export type MyCircle = { address: Address; seat: number | null; organizer: Address; state: string; memberCount: number };

/** FR-RST-01: every circle this account joined or organized, from nothing but the address. */
export async function circlesOf(me: Address): Promise<MyCircle[]> {
  type Row = { id: string; organizer: string; state: string; memberCount: number };
  const d = await gql<{ Member: { seat: number; circle: Row }[]; Circle: Row[] }>(
    `query Mine($me: String!) {
      Member(where: { address: { _eq: $me } }) { seat circle { id organizer state memberCount } }
      Circle(where: { organizer: { _eq: $me } }) { id organizer state memberCount }
    }`,
    { me: lower(me) },
  );
  const out = new Map<string, MyCircle>();
  const add = (c: Row, seat: number | null) =>
    out.set(c.id, { address: getAddress(c.id), seat, organizer: getAddress(c.organizer), state: c.state, memberCount: c.memberCount });
  for (const c of d.Circle) add(c, null);
  for (const m of d.Member) add(m.circle, m.seat);
  return [...out.values()];
}

/** Who sits where, for every circle given: the people a member can send to. */
export async function membersOf(circles: Address[]): Promise<{ circle: Address; seat: number; address: Address }[]> {
  if (circles.length === 0) return [];
  const d = await gql<{ Member: { circle_id: string; seat: number; address: string }[] }>(
    `query People($c: [String!]!) { Member(where: { circle_id: { _in: $c } }) { circle_id seat address } }`,
    { c: circles.map(lower) },
  );
  return d.Member.map((m) => ({ circle: getAddress(m.circle_id), seat: m.seat, address: getAddress(m.address) }));
}

// ---------------------------------------------------------------- the feed

export type Activity = {
  id: string;
  kind: string;
  actor: Address | null;
  round: number | null;
  amount: bigint | null;
  fromStake: bigint | null;
  fromPool: bigint | null;
  shortfall: bigint | null;
  bps: number | null;
  at: number;
  txHash: Hex;
};

export async function feedOf(circle: Address, limit = 25): Promise<Activity[]> {
  type Row = Omit<Activity, "actor" | "amount" | "fromStake" | "fromPool" | "shortfall" | "at"> & {
    actor: string | null;
    amount: string | null;
    fromStake: string | null;
    fromPool: string | null;
    shortfall: string | null;
    at: string;
  };
  const d = await gql<{ Activity: Row[] }>(
    `query Feed($c: String!, $n: Int!) {
      Activity(where: { circle_id: { _eq: $c }, kind: { _nin: ["PaidBack", "Credited", "PaidDebt"] } }, order_by: [{ at: desc }, { block: desc }, { logIndex: desc }], limit: $n) {
        id kind actor round amount fromStake fromPool shortfall bps at txHash
      }
    }`,
    { c: lower(circle), n: limit },
  );
  return d.Activity.map((a) => ({
    ...a,
    actor: a.actor ? getAddress(a.actor) : null,
    amount: big(a.amount),
    fromStake: big(a.fromStake),
    fromPool: big(a.fromPool),
    shortfall: big(a.shortfall),
    at: Number(a.at),
  }));
}

// ------------------------------------------------------------------ money

export type Transfer = {
  id: string;
  from: Address;
  to: Address;
  token: "AUSD" | "CTK";
  amountUsd: bigint;
  route: "Dollars" | "CashOut" | "Convert" | "Faucet";
  at: number;
  txHash: Hex;
};

export async function transfersOf(me: Address, limit = 10): Promise<Transfer[]> {
  type Row = { id: string; from: string; to: string; token: Transfer["token"]; amountUsd: string; route: Transfer["route"]; at: string; txHash: Hex };
  const d = await gql<{ Transfer: Row[] }>(
    `query Money($me: String!, $n: Int!) {
      Transfer(where: { _or: [{ from: { _eq: $me } }, { to: { _eq: $me } }] }, order_by: [{ at: desc }, { block: desc }, { logIndex: desc }], limit: $n) {
        id from to token amountUsd route at txHash
      }
    }`,
    { me: lower(me), n: limit },
  );
  return d.Transfer.map((t) => ({ ...t, from: getAddress(t.from), to: getAddress(t.to), amountUsd: BigInt(t.amountUsd), at: Number(t.at) }));
}

// ----------------------------------------------------------------- record

export type Passbook = {
  circlesJoined: number;
  circlesCompleted: number;
  paidOnTime: number;
  paidLate: number;
  timesCovered: number;
  potsReceived: number;
  totalContributed: bigint;
  sends: number;
  receives: number;
  counterparties: number;
};

export async function recordOf(me: Address): Promise<Passbook | null> {
  type Row = Omit<Passbook, "totalContributed"> & { totalContributed: string };
  const d = await gql<{ Account_by_pk: Row | null }>(
    `query Record($me: String!) {
      Account_by_pk(id: $me) {
        circlesJoined circlesCompleted paidOnTime paidLate timesCovered potsReceived totalContributed sends receives counterparties
      }
    }`,
    { me: lower(me) },
  );
  const a = d.Account_by_pk;
  return a ? { ...a, totalContributed: BigInt(a.totalContributed) } : null;
}

// ------------------------------------------------------------------ yield

/** earnAUSD on Monad mainnet: the real rate Kitty's simulated yield follows. */
export async function earnRate(): Promise<{ aprBps: number; at: number } | null> {
  const d = await gql<{ EarnRate_by_pk: { aprBps: number; at: string } | null }>(`query Rate { EarnRate_by_pk(id: "earnAUSD") { aprBps at } }`);
  const r = d.EarnRate_by_pk;
  return r ? { aprBps: r.aprBps, at: Number(r.at) } : null;
}

// ---------------------------------------------------------- the cat's world

/** "Feed the Kitty": pieces in a circle's house (null when the indexer hasn't seen the circle). */
export async function housePiecesOf(circle: Address): Promise<number | null> {
  const d = await gql<{ Circle_by_pk: { housePieces: number } | null }>(
    `query House($c: String!) { Circle_by_pk(id: $c) { housePieces } }`,
    { c: lower(circle) },
  );
  return d.Circle_by_pk?.housePieces ?? null;
}

export type CatRecord = { keepsakes: Set<string>; streak: number; bestStreak: number };

export async function catRecordOf(me: Address): Promise<CatRecord> {
  const d = await gql<{ Keepsake: { kind: string }[]; Account_by_pk: { onTimeStreak: number; bestStreak: number } | null }>(
    `query Cat($me: String!) {
      Keepsake(where: { account_id: { _eq: $me } }) { kind }
      Account_by_pk(id: $me) { onTimeStreak bestStreak }
    }`,
    { me: lower(me) },
  );
  return {
    keepsakes: new Set(d.Keepsake.map((k) => k.kind)),
    streak: d.Account_by_pk?.onTimeStreak ?? 0,
    bestStreak: d.Account_by_pk?.bestStreak ?? 0,
  };
}

export type AlbumRound = { index: number; recipient: Address | null; everyonePaid: boolean };
export type AlbumPage = { circle: Address; endedAt: number; pieces: number; memberCount: number; seat: number; rounds: AlbumRound[] };

/** Every finished circle this account was in: its house and a line per round. */
export async function albumOf(me: Address): Promise<AlbumPage[]> {
  type Row = {
    seat: number;
    circle: {
      id: string;
      state: string;
      endedAt: string | null;
      housePieces: number;
      memberCount: number;
      rounds: { index: number; recipient: string | null; payments: number; covered: string }[];
    };
  };
  const d = await gql<{ Member: Row[] }>(
    `query Album($me: String!) {
      Member(where: { address: { _eq: $me }, circle: { state: { _eq: "Completed" } } }) {
        seat
        circle { id state endedAt housePieces memberCount rounds(order_by: { index: asc }) { index recipient payments covered } }
      }
    }`,
    { me: lower(me) },
  );
  return d.Member.map((m) => ({
    circle: getAddress(m.circle.id),
    endedAt: Number(m.circle.endedAt ?? 0),
    pieces: m.circle.housePieces,
    memberCount: m.circle.memberCount,
    seat: m.seat,
    rounds: m.circle.rounds.map((r) => ({
      index: r.index,
      recipient: r.recipient ? getAddress(r.recipient) : null,
      everyonePaid: r.payments >= m.circle.memberCount && BigInt(r.covered) === 0n,
    })),
  })).sort((a, b) => b.endedAt - a.endedAt);
}
