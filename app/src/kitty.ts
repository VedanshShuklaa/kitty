import {
  BaseError,
  bytesToHex,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  hexToBytes,
  http,
  keccak256,
  parseAbiParameters,
  parseEther,
  toBytes,
  zeroAddress,
  zeroHash,
  type Abi,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { keccak_256 } from "@noble/hashes/sha3";

import { ausdAbi, circleAbi, factoryAbi, faucetAbi, vaultAbi } from "./abi";
import { bidSalt } from "./account/keys";
import { monadTestnet } from "./chain";
import { apiUrl, contracts } from "./config";
import type { Invite } from "./links";

// Every read the app makes is batched into Multicall3 calls.
export const client = createPublicClient({ chain: monadTestnet, transport: http(), batch: { multicall: true } });

export type Signer = { address: Address; account: LocalAccount; prf: Uint8Array };

// ------------------------------------------------------------------ rules

export type Rules = {
  memberCount: number;
  stakeBps: number;
  maxBidBps: number;
  poolShareBps: number;
  holdbackBps: number;
  yieldOn: boolean;
  contribution: bigint;
  firstDue: bigint;
  period: number;
  commitWindow: number;
  revealWindow: number;
  grace: number;
  joinDeadline: bigint;
};

const MIN = 60;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export type Cadence = "monthly" | "weekly" | "daily" | "demo";

// Windows per cadence. Each satisfies the factory's checks (SRS 7.2):
// grace >= reveal, commit + grace <= period, and joining closes
// `commit` before the first due time.
export const CADENCES: Record<
  Cadence,
  { label: string; every: string; period: number; commit: number; reveal: number; grace: number; starts: { label: string; seconds: number }[] }
> = {
  monthly: {
    label: "Monthly",
    every: "every month",
    period: 30 * DAY,
    commit: 3 * DAY,
    reveal: DAY,
    grace: 2 * DAY,
    starts: [
      { label: "In a week", seconds: 7 * DAY },
      { label: "In a month", seconds: 30 * DAY },
    ],
  },
  weekly: {
    label: "Weekly",
    every: "every week",
    period: 7 * DAY,
    commit: 2 * DAY,
    reveal: 12 * HOUR,
    grace: DAY,
    starts: [
      { label: "In 3 days", seconds: 3 * DAY },
      { label: "In a week", seconds: 7 * DAY },
    ],
  },
  daily: {
    label: "Daily",
    every: "every day",
    period: DAY,
    commit: 6 * HOUR,
    reveal: 2 * HOUR,
    grace: 4 * HOUR,
    starts: [
      { label: "In 12 hours", seconds: 12 * HOUR },
      { label: "Tomorrow", seconds: DAY },
    ],
  },
  // FR-CIR-05: short cadences exist only on testnet, for demos and rehearsals
  demo: {
    label: "Every 10 min",
    every: "every 10 minutes",
    period: 10 * MIN,
    commit: 4 * MIN,
    reveal: MIN,
    grace: 2 * MIN,
    starts: [
      { label: "In 15 min", seconds: 15 * MIN },
      { label: "In 30 min", seconds: 30 * MIN },
      { label: "In 1 hour", seconds: HOUR },
    ],
  },
};

export type CircleDraft = {
  title: string;
  names: string[]; // seat order; the organizer first
  contribution: bigint;
  cadence: Cadence;
  startIn: number; // seconds from now to the first due time
  maxBidBps: number; // 0 turns bidding off
  yieldOn: boolean; // deposits earn simulated testnet yield (SRS 15.7)
};

export function buildRules(d: CircleDraft, nowSec: number): Rules {
  const c = CADENCES[d.cadence];
  const firstDue = BigInt(Math.floor(nowSec + d.startIn));
  return {
    memberCount: d.names.length,
    stakeBps: 10_000,
    maxBidBps: d.maxBidBps,
    poolShareBps: 1_000,
    holdbackBps: 2_000,
    yieldOn: d.yieldOn,
    contribution: d.contribution,
    firstDue,
    period: c.period,
    commitWindow: c.commit,
    revealWindow: c.reveal,
    grace: c.grace,
    joinDeadline: firstDue - BigInt(c.commit),
  };
}

export const depositOf = (r: Pick<Rules, "contribution" | "stakeBps">) => (r.contribution * BigInt(r.stakeBps)) / 10_000n;
export const potOf = (r: Pick<Rules, "contribution" | "memberCount">) => r.contribution * BigInt(r.memberCount);

/** FR-JOIN-03: one approval covers the deposit, every round, and one catch-up. */
export const approvalFor = (r: Rules) => depositOf(r) + r.contribution * BigInt(r.memberCount + 1);

export function cadenceOf(r: Pick<Rules, "period">): Cadence | null {
  return (Object.keys(CADENCES) as Cadence[]).find((k) => CADENCES[k].period === r.period) ?? null;
}

// ------------------------------------------------------------------- sends

type Call = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] };

async function send(s: Signer, call: Call): Promise<Hex> {
  // FR-GAS-03: explicit limit, estimate + 20%. Estimating first also
  // surfaces a revert (and its custom error) before anything is signed.
  const gas = await client.estimateContractGas({ ...call, account: s.account } as never);
  const wallet = createWalletClient({ account: s.account, chain: monadTestnet, transport: http() });
  const hash = await wallet.writeContract({ ...call, gas: (gas * 12n) / 10n, account: s.account, chain: monadTestnet } as never);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("That step didn't go through. Pull down to refresh and try again.");
  return hash;
}

// ----------------------------------------------------------------- funding

const LOW_BALANCE = parseEther("0.05");
// The public RPC is load-balanced, so a balance read straight after a grant
// can come from a node that hasn't seen it yet. Trust a recent grant instead
// of asking the sponsor twice.
const recentTopUps = new Map<string, number>();

/** FR-GAS-01: a member never has to find MON; the sponsor tops them up. */
export async function ensureTopUp(address: Address): Promise<void> {
  const last = recentTopUps.get(address.toLowerCase());
  if (last && Date.now() - last < 120_000) return;
  if ((await client.getBalance({ address })) >= LOW_BALANCE) return;
  let res: Response;
  try {
    res = await fetch(`${apiUrl}/api/sponsor`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    });
  } catch {
    throw new Error("Couldn't reach Kitty to set up your account. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => ({}))) as { hash?: Hex; error?: string };
  if (!res.ok) throw new Error(body.error ?? "Kitty couldn't set up your account right now. Try again in a minute.");
  if (body.hash) {
    await client.waitForTransactionReceipt({ hash: body.hash });
    recentTopUps.set(address.toLowerCase(), Date.now());
  }
}

export async function balanceOf(address: Address): Promise<bigint> {
  return client.readContract({ address: contracts.ausd, abi: ausdAbi, functionName: "balanceOf", args: [address] });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * FR-JOIN-04: test dollars from Agora's faucet, sent by the member's own
 * account. The faucet has a short cooldown shared by everyone, so a busy
 * tap is retried a few times before giving up.
 */
export async function getTestDollars(s: Signer): Promise<void> {
  await ensureTopUp(s.address);
  for (let attempt = 0; ; attempt++) {
    try {
      await send(s, { address: contracts.ausdFaucet, abi: faucetAbi, functionName: "requestFunds", args: [s.address] });
      return;
    } catch (e) {
      const busy = e instanceof BaseError && /MaxFrequencyExceeded|0x20e5bc67/.test(`${e.message} ${e.details ?? ""}`);
      if (!busy || attempt >= 5) throw e;
      await sleep(10_000 * (attempt + 1));
    }
  }
}

async function ensureDollars(s: Signer, needed: bigint): Promise<void> {
  if ((await balanceOf(s.address)) >= needed) return;
  await getTestDollars(s);
}

async function ensureAllowance(s: Signer, circle: Address, amount: bigint): Promise<void> {
  const current = await client.readContract({
    address: contracts.ausd,
    abi: ausdAbi,
    functionName: "allowance",
    args: [s.address, circle],
  });
  if (current >= amount) return;
  await send(s, { address: contracts.ausd, abi: ausdAbi, functionName: "approve", args: [circle, amount] });
}

// ------------------------------------------------------------ create / join

export type Step = { id: string; label: string };

export const CREATE_STEPS: Step[] = [
  { id: "topup", label: "Setting up your account" },
  { id: "dollars", label: "Checking your test dollars" },
  { id: "create", label: "Creating the circle" },
  { id: "approve", label: "Approving payments for every round" },
  { id: "deposit", label: "Putting down your deposit" },
];

export const JOIN_STEPS: Step[] = [
  { id: "topup", label: "Setting up your account" },
  { id: "dollars", label: "Checking your test dollars" },
  { id: "approve", label: "Approving payments for every round" },
  { id: "deposit", label: "Taking your place and putting down your deposit" },
];

export async function nowOnChain(): Promise<number> {
  return Number((await client.getBlock()).timestamp);
}

export async function createCircle(
  s: Signer,
  draft: CircleDraft,
  onStep: (id: string) => void,
  beforeCreate: (circle: Address, keys: (Hex | null)[]) => Promise<void>,
): Promise<Address> {
  onStep("topup");
  await ensureTopUp(s.address);

  const rules = buildRules(draft, await nowOnChain());
  onStep("dollars");
  await ensureDollars(s, depositOf(rules) + rules.contribution);

  // one single-use invite key per seat; seat 0 is the organizer (FR-INV-01)
  const keys: (Hex | null)[] = draft.names.map((_, i) => (i === 0 ? null : generatePrivateKey()));
  const signers = keys.map((k) => (k ? privateKeyToAccount(k).address : zeroAddress));
  const circle = await client.readContract({
    address: contracts.circleFactory,
    abi: factoryAbi,
    functionName: "predictCircle",
    args: [s.address],
  });
  // keys are saved before the circle exists, so a crash can't orphan the invites
  await beforeCreate(circle, keys);

  onStep("create");
  await send(s, { address: contracts.circleFactory, abi: factoryAbi, functionName: "createCircle", args: [rules, signers] });

  onStep("approve");
  await ensureAllowance(s, circle, approvalFor(rules));
  onStep("deposit");
  await send(s, { address: circle, abi: circleAbi, functionName: "join", args: [0, "0x"] });
  return circle;
}

/** Resume after createCircle failed past "create": approve and take seat 0. */
export async function joinAsOrganizer(s: Signer, circle: Address, onStep: (id: string) => void): Promise<void> {
  const rules = await readRules(circle);
  onStep("approve");
  await ensureTopUp(s.address);
  await ensureDollars(s, depositOf(rules) + rules.contribution);
  await ensureAllowance(s, circle, approvalFor(rules));
  onStep("deposit");
  await send(s, { address: circle, abi: circleAbi, functionName: "join", args: [0, "0x"] });
}

const JOIN_TYPEHASH = keccak256(toBytes("kitty.join.v1"));

export function joinDigest(circle: Address, seat: number, joiner: Address): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, uint256, address, uint8, address"), [
      JOIN_TYPEHASH,
      BigInt(contracts.chainId),
      circle,
      seat,
      joiner,
    ]),
  );
}

export async function joinCircle(s: Signer, invite: Invite, onStep: (id: string) => void): Promise<void> {
  const rules = await readRules(invite.circle);
  onStep("topup");
  await ensureTopUp(s.address);
  onStep("dollars");
  await ensureDollars(s, depositOf(rules) + rules.contribution);
  onStep("approve");
  await ensureAllowance(s, invite.circle, approvalFor(rules));

  onStep("deposit");
  // SRS 7.6: the seat's invite key signs over the joiner's own address, so a
  // copied signature is useless to anyone else (FR-INV-02)
  const digest = joinDigest(invite.circle, invite.seat, s.address);
  const sig = await privateKeyToAccount(invite.key).signMessage({ message: { raw: digest } });
  await send(s, { address: invite.circle, abi: circleAbi, functionName: "join", args: [invite.seat, sig] });
}

// ------------------------------------------------------------------ reads

export type Standing = "none" | "good" | "behind" | "defaulted";
const STANDINGS: Standing[] = ["none", "good", "behind", "defaulted"];
export type CircleState = "forming" | "active" | "completed" | "cancelled";
const STATES: CircleState[] = ["forming", "active", "completed", "cancelled"];

export type Member = {
  seat: number;
  address: Address | null;
  standing: Standing;
  received: boolean;
  arrears: bigint;
  credit: bigint;
  paid: boolean; // this round
  revealed: boolean; // this round
};

export type Snapshot = {
  address: Address;
  rules: Rules;
  state: CircleState;
  round: number; // 0 while forming
  organizer: Address;
  pot: bigint;
  members: Member[];
  recipients: (Address | null)[]; // index = round - 1
  due: number; // current round's due time, or the first due time while forming
  chainNow: number;
  /** Simulated yield on the circle's deposits, if they are earning. */
  yield: null | { earned: bigint };
  me: null | {
    seat: number;
    pay: bigint;
    creditUsed: bigint;
    holdbackReleased: bigint;
    commitment: Hex;
    revealedBps: number;
    withdrawable: bigint;
    balance: bigint;
  };
};

export async function readRules(circle: Address): Promise<Rules> {
  return (await client.readContract({ address: circle, abi: circleAbi, functionName: "rules" })) as Rules;
}

export async function loadSnapshot(circle: Address, me: Address | null): Promise<Snapshot> {
  const c = { address: circle, abi: circleAbi } as const;
  const [rules, stateN, round, organizer, pot, block] = await Promise.all([
    readRules(circle),
    client.readContract({ ...c, functionName: "state" }),
    client.readContract({ ...c, functionName: "currentRound" }),
    client.readContract({ ...c, functionName: "organizer" }),
    client.readContract({ ...c, functionName: "pot" }),
    client.getBlock(),
  ]);
  const n = rules.memberCount;
  const seats = Array.from({ length: n }, (_, i) => i);

  const [addrs, recipients, due] = await Promise.all([
    Promise.all(seats.map((i) => client.readContract({ ...c, functionName: "memberAt", args: [i] }))),
    Promise.all(seats.map((i) => client.readContract({ ...c, functionName: "recipientOf", args: [i + 1] }))),
    round > 0 ? client.readContract({ ...c, functionName: "dueTime", args: [round] }) : Promise.resolve(rules.firstDue),
  ]);

  const members: Member[] = await Promise.all(
    addrs.map(async (a, seat): Promise<Member> => {
      if (a === zeroAddress) {
        return { seat, address: null, standing: "none", received: false, arrears: 0n, credit: 0n, paid: false, revealed: false };
      }
      const [[standing, received, arrears, credit], paid, [revealed]] = await Promise.all([
        client.readContract({ ...c, functionName: "standingOf", args: [a] }),
        round > 0 ? client.readContract({ ...c, functionName: "paidRound", args: [round, a] }) : Promise.resolve(false),
        round > 0
          ? client.readContract({ ...c, functionName: "revealedBid", args: [round, a] })
          : Promise.resolve([false, 0] as const),
      ]);
      return { seat, address: a, standing: STANDINGS[standing] ?? "none", received, arrears, credit, paid, revealed };
    }),
  );

  const state = STATES[stateN] ?? "forming";
  const earnings = rules.yieldOn ? await readYield(circle) : null;
  let mine: Snapshot["me"] = null;
  const mySeat = me ? addrs.findIndex((a) => a.toLowerCase() === me.toLowerCase()) : -1;
  if (me && mySeat >= 0) {
    const active = state === "active";
    const [owed, commitment, revealed, withdrawable, balance] = await Promise.all([
      active
        ? client.readContract({ ...c, functionName: "amountDue", args: [me, round] })
        : Promise.resolve([0n, 0n, 0n] as const),
      active ? client.readContract({ ...c, functionName: "commitmentOf", args: [round, me] }) : Promise.resolve(zeroHash),
      active
        ? client.readContract({ ...c, functionName: "revealedBid", args: [round, me] })
        : Promise.resolve([false, 0] as const),
      client.readContract({ ...c, functionName: "withdrawable", args: [me] }),
      balanceOf(me),
    ]);
    mine = {
      seat: mySeat,
      pay: owed[0],
      creditUsed: owed[1],
      holdbackReleased: owed[2],
      commitment,
      revealedBps: revealed[0] ? revealed[1] : 0,
      withdrawable,
      balance,
    };
  }

  return {
    address: circle,
    rules,
    state,
    round,
    organizer,
    pot,
    members,
    recipients: recipients.map((a) => (a === zeroAddress ? null : a)),
    due: Number(due),
    chainNow: Number(block.timestamp),
    yield: earnings,
    me: mine,
  };
}

/** What settlement would pay out above the deposits, right now. */
async function readYield(circle: Address): Promise<Snapshot["yield"]> {
  try {
    const vault = await client.readContract({ address: circle, abi: circleAbi, functionName: "vault" });
    const [assets, principal] = await client.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "previewSettle",
      args: [circle],
    });
    return { earned: assets > principal ? assets - principal : 0n };
  } catch {
    return null; // a circle from before the yield vault
  }
}

// ---------------------------------------------------------------- actions

export async function contribute(s: Signer, circle: Address, round: number, amount: bigint): Promise<void> {
  await ensureTopUp(s.address);
  await ensureDollars(s, amount);
  await ensureAllowance(s, circle, amount);
  await send(s, { address: circle, abi: circleAbi, functionName: "contribute", args: [round] });
}

export async function payArrears(s: Signer, circle: Address, amount: bigint): Promise<void> {
  await ensureTopUp(s.address);
  await ensureDollars(s, amount);
  await ensureAllowance(s, circle, amount);
  await send(s, { address: circle, abi: circleAbi, functionName: "payArrears" });
}

export async function closeRound(s: Signer, circle: Address, round: number): Promise<void> {
  await ensureTopUp(s.address);
  await send(s, { address: circle, abi: circleAbi, functionName: "closeRound", args: [round] });
}

export async function withdraw(s: Signer, circle: Address): Promise<void> {
  await ensureTopUp(s.address);
  await send(s, { address: circle, abi: circleAbi, functionName: "withdraw" });
}

export async function cancelCircle(s: Signer, circle: Address): Promise<void> {
  await ensureTopUp(s.address);
  await send(s, { address: circle, abi: circleAbi, functionName: "cancel" });
}

// ------------------------------------------------------------------- bids

const COMMIT_PARAMS = parseAbiParameters("uint256, address, uint32, address, uint16, bytes32");

export function saltFor(s: Signer, circle: Address, round: number): Hex {
  return bytesToHex(bidSalt(s.prf, BigInt(contracts.chainId), circle, round));
}

/** SRS 7.6: keccak256(abi.encode(chainId, circle, round, member, discountBps, salt)) */
export function commitmentFor(circle: Address, round: number, member: Address, bps: number, salt: Hex): Hex {
  return keccak256(encodeAbiParameters(COMMIT_PARAMS, [BigInt(contracts.chainId), circle, round, member, bps, salt]));
}

/**
 * FR-BID-03: the app stores no bid. It re-derives the salt from the passkey
 * and tries every discount up to the circle's maximum against the onchain
 * commitment. Only the discount word changes, so the encoding is built once
 * and just its last two bytes (word 4 of 6) are rewritten per guess.
 */
export function recoverBid(circle: Address, round: number, member: Address, salt: Hex, maxBps: number, target: Hex): number | null {
  const buf = hexToBytes(encodeAbiParameters(COMMIT_PARAMS, [BigInt(contracts.chainId), circle, round, member, 0, salt]));
  const want = hexToBytes(target);
  for (let bps = 0; bps <= maxBps; bps++) {
    buf[158] = bps >> 8;
    buf[159] = bps & 0xff;
    const h = keccak_256(buf);
    let same = true;
    for (let i = 0; i < 32; i++) {
      if (h[i] !== want[i]) {
        same = false;
        break;
      }
    }
    if (same) return bps;
  }
  return null;
}

export async function commitBid(s: Signer, circle: Address, round: number, bps: number): Promise<void> {
  await ensureTopUp(s.address);
  const commitment = commitmentFor(circle, round, s.address, bps, saltFor(s, circle, round));
  await send(s, { address: circle, abi: circleAbi, functionName: "commitBid", args: [round, commitment] });
}

export async function revealBid(s: Signer, circle: Address, round: number, maxBps: number): Promise<number> {
  await ensureTopUp(s.address);
  const salt = saltFor(s, circle, round);
  const target = await client.readContract({
    address: circle,
    abi: circleAbi,
    functionName: "commitmentOf",
    args: [round, s.address],
  });
  const bps = recoverBid(circle, round, s.address, salt, maxBps, target);
  if (bps === null) {
    throw new Error("This offer was sealed with a different passkey, so it can't be opened from this phone.");
  }
  await send(s, { address: circle, abi: circleAbi, functionName: "revealBid", args: [round, bps, salt] });
  return bps;
}
