import "dotenv/config";
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "../chain.js";

// closeRound is permissionless by design (NFR-REL-01): the app closes a due
// round itself whenever a member has the circle open. This loop covers the
// gaps. A round nobody closes keeps the next round's payments shut, and once
// that round's grace has passed everyone is covered as a miss, which costs
// each of them a stage. It also calls off forming circles past their join
// deadline, so deposits come back and the circles-at-once count frees up.

const circleAbi = parseAbi([
  "function closeRound(uint32 round)",
  "function cancel()",
  "function state() view returns (uint8)",
  "function currentRound() view returns (uint32)",
  "function dueTime(uint32 round) view returns (uint64)",
  "function rules() view returns ((uint8 memberCount, uint16 stakeBps, uint16 maxBidBps, uint16 poolShareBps, uint16 holdbackBps, bool yieldOn, uint64 contribution, uint64 firstDue, uint32 period, uint32 commitWindow, uint32 revealWindow, uint32 grace, uint64 joinDeadline))",
]);

const POLL_INTERVAL_MS = 10_000;
const FORMING = 0;
const ACTIVE = 1;

export type CircleView = {
  address: Address;
  state: number; // ICircle.State
  round: number; // 0 while forming
  due: bigint; // current round's due time
  grace: number;
  joinDeadline: bigint;
};

export type Job = { kind: "close"; circle: Address; round: number } | { kind: "cancel"; circle: Address };

/** Pure: what the keeper should send for one circle at chain time `now`, mirroring the contract's checks. */
export function jobFor(c: CircleView, now: bigint): Job | null {
  if (c.state === FORMING) return now >= c.joinDeadline ? { kind: "cancel", circle: c.address } : null;
  if (c.state === ACTIVE && c.round > 0 && now >= c.due + BigInt(c.grace)) {
    return { kind: "close", circle: c.address, round: c.round };
  }
  return null;
}

/** Forming and active circles of one factory, from the indexer. */
export async function openCircles(indexerUrl: string, factory: Address): Promise<Address[]> {
  const res = await fetch(indexerUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `query Open($f: String!) { Circle(where: { factory: { _eq: $f }, state: { _in: ["Forming", "Active"] } }, limit: 1000) { id } }`,
      variables: { f: factory.toLowerCase() },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json()) as { data?: { Circle: { id: Address }[] }; errors?: { message: string }[] };
  if (!body.data) throw new Error(body.errors?.[0]?.message ?? `indexer answered ${res.status}`);
  return body.data.Circle.map((c) => c.id);
}

export function createKeeper(privateKey: `0x${string}`, rpcUrl?: string) {
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: monadTestnet, transport, batch: { multicall: true } });
  const walletClient = createWalletClient({ account, chain: monadTestnet, transport });

  async function read(circle: Address): Promise<CircleView> {
    const c = { address: circle, abi: circleAbi } as const;
    const [state, round, rules] = await Promise.all([
      publicClient.readContract({ ...c, functionName: "state" }),
      publicClient.readContract({ ...c, functionName: "currentRound" }),
      publicClient.readContract({ ...c, functionName: "rules" }),
    ]);
    const due = round > 0 ? await publicClient.readContract({ ...c, functionName: "dueTime", args: [round] }) : rules.firstDue;
    return { address: circle, state, round, due, grace: rules.grace, joinDeadline: rules.joinDeadline };
  }

  /** Simulates first (a member's phone may have closed it already), then sends with headroom: Monad charges the gas limit, not gas used. */
  async function run(job: Job): Promise<Hash> {
    const base = { address: job.circle, abi: circleAbi, account } as const;
    const call =
      job.kind === "close"
        ? ({ ...base, functionName: "closeRound", args: [job.round] } as const)
        : ({ ...base, functionName: "cancel" } as const);
    await publicClient.simulateContract(call);
    const gas = await publicClient.estimateContractGas(call);
    const hash = await walletClient.writeContract({ ...call, chain: monadTestnet, gas: (gas * 12n) / 10n });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${job.kind} reverted in ${hash}`);
    return hash;
  }

  /** One pass over `circles`; a circle that fails is logged and retried next pass. */
  async function tick(circles: Address[], log: (line: string) => void = console.log): Promise<number> {
    const { timestamp } = await publicClient.getBlock();
    let sent = 0;
    for (const circle of circles) {
      try {
        const job = jobFor(await read(circle), timestamp);
        if (!job) continue;
        const hash = await run(job);
        sent++;
        log(job.kind === "close" ? `closed round ${job.round} of ${circle}: ${hash}` : `called off ${circle}: ${hash}`);
      } catch (e) {
        log(`skipped ${circle}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
      }
    }
    return sent;
  }

  return { address: account.address, read, run, tick };
}

function deployedFactory(): Address {
  const file = new URL("../../../deployments/10143.json", import.meta.url);
  return (JSON.parse(readFileSync(file, "utf8")) as { circleFactory: Address }).circleFactory;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const key = process.env.KEEPER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) throw new Error("Set KEEPER_PRIVATE_KEY (a testnet key holding a little MON) in services/.env");
  const factory = (process.env.CIRCLE_FACTORY_ADDRESS || deployedFactory()) as Address;
  const indexer = process.env.INDEXER_URL || "https://kitty-circle.vercel.app/api/graphql";
  const keeper = createKeeper(key, process.env.MONAD_RPC_URL);
  console.log(`keeper ${keeper.address} watching factory ${factory}`);
  let busy = false;
  const pass = async () => {
    if (busy) return;
    busy = true;
    try {
      await keeper.tick(await openCircles(indexer, factory));
    } catch (e) {
      console.log(`pass failed: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    } finally {
      busy = false;
    }
  };
  void pass();
  setInterval(pass, POLL_INTERVAL_MS);
}
