import type { Account, DailyStats, EvmOnEventContext } from "envio";

type Ctx = EvmOnEventContext;

/** Ids of rows written once per log. */
export const logId = (e: { transaction: { hash: string }; logIndex: number }) => `${e.transaction.hash}-${e.logIndex}`;

export function newAccount(id: string, at: bigint): Account {
  return {
    id,
    firstSeenAt: at,
    approvedSwapper: false,
    circlesJoined: 0,
    circlesOrganized: 0,
    circlesCompleted: 0,
    paidOnTime: 0,
    paidLate: 0,
    timesCovered: 0,
    defaults: 0,
    openDefaults: 0,
    lastDefaultClearedAt: undefined,
    potsReceived: 0,
    totalContributed: 0n,
    totalReceived: 0n,
    totalSent: 0n,
    totalReceivedDirect: 0n,
    sends: 0,
    receives: 0,
    counterparties: 0,
    stage: "Shy",
    debt: 0n,
    catAdoptedAt: undefined,
  };
}

export async function account(context: Ctx, address: string, at: bigint): Promise<Account> {
  return (await context.Account.get(address)) ?? newAccount(address, at);
}

/** Writes an account back. `now` is kept for callers; the record has no derived fields. */
export function saveAccount(context: Ctx, a: Account, _now: bigint): void {
  context.Account.set(a);
}

const DAY = 86_400n;

type Counters = Omit<DailyStats, "id" | "day">;

export async function bumpDay(context: Ctx, at: bigint, delta: Partial<Counters>): Promise<void> {
  const day = Number(at / DAY);
  const id = String(day);
  const d: DailyStats = (await context.DailyStats.get(id)) ?? {
    id,
    day,
    circlesCreated: 0,
    joins: 0,
    payments: 0,
    contributed: 0n,
    paidOut: 0n,
    covered: 0n,
    sends: 0,
    sent: 0n,
    swaps: 0,
  };
  const next: Record<string, string | number | bigint> = { ...d };
  for (const [k, v] of Object.entries(delta) as [keyof Counters, number | bigint][]) {
    next[k] = typeof v === "bigint" ? (next[k] as bigint) + v : (next[k] as number) + v;
  }
  context.DailyStats.set(next as unknown as DailyStats);
}
