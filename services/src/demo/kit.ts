import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import {
  BaseError,
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  parseAbi,
  parseEther,
  type Abi,
  type Address,
  type Hex,
  type PrivateKeyAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { monadTestnet } from "../chain.js";

// Shared by the demo helpers (check, watch, crew): the live deployment, the
// ABI fragments they call, and sending with the same habits as the app
// (explicit gas with headroom, sponsored MON, a patient faucet).

export const SITE = process.env.SITE_URL ?? "https://kitty-circle.vercel.app";
/** The app reads the indexer through the site's proxy; set INDEXER_URL to query Envio directly. */
export const INDEXER = process.env.INDEXER_URL ?? `${SITE}/api/graphql`;

type Deployment = {
  chainId: number;
  ausd: Address;
  circleFactory: Address;
  circleImplementation: Address;
  stakeVault: Address;
  kittyRecord: Address;
  kittyCats: Address;
  kittyEarnVault: Address;
  deployBlock: number;
};

export const deployment = JSON.parse(
  readFileSync(new URL("../../../deployments/10143.json", import.meta.url), "utf8"),
) as Deployment;

// Agora on testnet, as in app/app.config.ts: CTK stands in for the USDC the
// mainnet Instant Settlement pair settles to.
export const AGORA = {
  faucet: "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C",
  ctk: "0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D",
  pair: "0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae",
  whitelister: "0x7c10F56d6f04a51376393a1C3670e966863F6BD5",
} as const satisfies Record<string, Address>;

export const client = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.MONAD_RPC_URL),
  batch: { multicall: true },
  pollingInterval: 500,
});

const RULES =
  "struct Rules { uint8 memberCount; uint16 stakeBps; uint16 maxBidBps; uint16 poolShareBps; uint16 holdbackBps; bool yieldOn; uint64 contribution; uint64 firstDue; uint32 period; uint32 commitWindow; uint32 revealWindow; uint32 grace; uint64 joinDeadline; }";

export const circleAbi = parseAbi([
  RULES,
  "function join(uint8 seat, bytes inviteSig)",
  "function contribute(uint32 round)",
  "function payArrears()",
  "function recordFinish(address member)",
  "function commitBid(uint32 round, bytes32 commitment)",
  "function revealBid(uint32 round, uint16 discountBps, bytes32 salt)",
  "function closeRound(uint32 round)",
  "function withdraw()",
  "function rules() view returns (Rules)",
  "function state() view returns (uint8)",
  "function currentRound() view returns (uint32)",
  "function dueTime(uint32 round) view returns (uint64)",
  "function amountDue(address member, uint32 round) view returns (uint256 pay, uint256 creditUsed, uint256 holdbackReleased)",
  "function standingOf(address member) view returns (uint8 standing, bool received, uint256 arrears, uint256 credit)",
  "function memberAt(uint8 seat) view returns (address)",
  "function pot() view returns (uint256)",
  "function paidRound(uint32 round, address member) view returns (bool)",
  "function recipientOf(uint32 round) view returns (address)",
  "function commitmentOf(uint32 round, address member) view returns (bytes32)",
  "function revealedBid(uint32 round, address member) view returns (bool revealed, uint16 discountBps)",
  "function withdrawable(address member) view returns (uint256)",
  "function placeOf(address member) view returns (uint8 stage, uint8 limitMonths, uint8 offerFrom, uint256 owed)",
  "error WrongState()",
  "error NotMember()",
  "error SeatTaken()",
  "error BadInvite()",
  "error JoinClosed()",
  "error WrongRound()",
  "error TooEarly()",
  "error TooLate()",
  "error AlreadyPaid()",
  "error NotEligible()",
  "error BiddingOff()",
  "error BidTooHigh()",
  "error BadReveal()",
  "error NothingToWithdraw()",
  "error Owing()",
  "error TooManyCircles()",
]);

export const factoryAbi = parseAbi([
  RULES,
  "function createCircle(Rules rules, address[] inviteSigners) returns (address)",
  "function predictCircle(address organizer) view returns (address)",
  "function isCircle(address circle) view returns (bool)",
  "function paused() view returns (bool)",
  "function minPeriod() view returns (uint32)",
]);

export const recordAbi = parseAbi([
  "struct Terms { uint8 stage; uint16 depositX100; uint8 limitMonths; uint8 offerFrom; uint8 maxOpen; uint8 open; }",
  "function stageOf(address a) view returns (uint8)",
  "function termsOf(address a, uint64 contribution) view returns (Terms)",
  "function debtOf(address a) view returns (uint256)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

export const faucetAbi = parseAbi(["function requestFunds(address to)", "error MaxFrequencyExceeded()"]);

export const pairAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])",
  "function hasRole(string role, address account) view returns (bool)",
  "function isPaused() view returns (bool)",
]);

export const whitelisterAbi = parseAbi(["function setApprovedSwapper(address swapper)"]);

export const stakeVaultAbi = parseAbi(["function factory() view returns (address)"]);

export const earnVaultAbi = parseAbi([
  "function fundReserve(uint256 amount)",
  "function reserve() view returns (uint256)",
  "function aprBps() view returns (uint32)",
  "function speedUp() view returns (uint32)",
  "function totalAssets() view returns (uint256)",
  "function isDepositor(address) view returns (bool)",
]);

export const STAGES = ["Away", "Wary", "Shy", "Friendly", "At home", "Family"] as const;
export const STATES = ["forming", "active", "completed", "cancelled"] as const;

// ------------------------------------------------------------------ words

/** "$1,234.50" from AUSD units (6 decimals), like the app's money(). */
export function money(v: bigint): string {
  const neg = v < 0n;
  const cents = ((neg ? -v : v) + 5_000n) / 10_000n;
  const dollars = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const c = cents % 100n;
  return `${neg ? "-" : ""}$${dollars}${c === 0n ? "" : `.${c.toString().padStart(2, "0")}`}`;
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const mon = (wei: bigint) => `${Number(formatEther(wei)).toFixed(3)} MON`;
export const explorerTx = (hash: string) => `${monadTestnet.blockExplorers.default.url}/tx/${hash}`;

/** The revert's custom error name, or a short message. */
export function why(e: unknown): string {
  if (e instanceof BaseError) {
    const named = e.walk((x) => !!(x as { data?: { errorName?: string } }).data?.errorName) as { data?: { errorName?: string } } | null;
    if (named?.data?.errorName) return named.data.errorName;
    return e.shortMessage;
  }
  return e instanceof Error ? e.message.split("\n")[0] : String(e);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const chainNow = async () => Number((await client.getBlock()).timestamp);

// ------------------------------------------------------------------ sends

export type Call = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] };

/** One transaction with an explicit limit (estimate + 20%): Monad charges the limit, not the gas used. */
export async function send(account: PrivateKeyAccount, call: Call): Promise<Hex> {
  const gas = await client.estimateContractGas({ ...call, account } as never);
  const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(process.env.MONAD_RPC_URL) });
  const hash = await wallet.writeContract({ ...call, account, chain: monadTestnet, gas: (gas * 12n) / 10n } as never);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`reverted in ${hash}`);
  return hash;
}

// Below this a helper account asks for gas. The sponsor only grants under
// 0.2 MON, and a closeRound alone can hold back close to 0.1 MON up front.
const LOW = parseEther("0.2");
const FUNDER_GRANT = parseEther("0.3");

/**
 * Gas for a helper account: from CREW_FUNDER_KEY when it is set (any testnet
 * key holding MON), otherwise from Kitty's own sponsor, the same one the app
 * uses (which caps grants per address and per IP each day, so a funder key
 * keeps the phones' allowance free on filming day).
 */
export async function ensureGas(who: Address): Promise<void> {
  if ((await client.getBalance({ address: who })) >= LOW) return;
  const funderKey = process.env.CREW_FUNDER_KEY as Hex | undefined;
  if (funderKey) {
    const funder = privateKeyToAccount(funderKey);
    const wallet = createWalletClient({ account: funder, chain: monadTestnet, transport: http(process.env.MONAD_RPC_URL) });
    const hash = await wallet.sendTransaction({ to: who, value: FUNDER_GRANT });
    await client.waitForTransactionReceipt({ hash });
    return;
  }
  const res = await fetch(`${SITE}/api/sponsor`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: who }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as { hash?: Hex; error?: string };
  if (!res.ok) throw new Error(`sponsor: ${body.error ?? res.status}`);
  if (body.hash) await client.waitForTransactionReceipt({ hash: body.hash });
}

/** 10,000 test dollars from Agora's faucet, retried through its short shared cooldown. */
export async function faucet(account: PrivateKeyAccount, log: (line: string) => void = () => {}): Promise<void> {
  await ensureGas(account.address);
  for (let attempt = 0; ; attempt++) {
    try {
      await send(account, { address: AGORA.faucet, abi: faucetAbi, functionName: "requestFunds", args: [account.address] });
      return;
    } catch (e) {
      const busy = /MaxFrequencyExceeded|0x20e5bc67/.test(`${why(e)} ${e instanceof BaseError ? e.details : ""}`);
      if (!busy || attempt >= 5) throw e;
      log(`faucet busy, trying again in ${10 * (attempt + 1)} s`);
      await sleep(10_000 * (attempt + 1));
    }
  }
}

export const ausdOf = (who: Address) =>
  client.readContract({ address: deployment.ausd, abi: erc20Abi, functionName: "balanceOf", args: [who] });

// ---------------------------------------------------------------- indexer

export async function gql<T>(query: string, variables: Record<string, unknown> = {}, url = INDEXER): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message: string }[] };
  if (!res.ok || body.errors?.length || !body.data) throw new Error(body.errors?.[0]?.message ?? `indexer answered ${res.status}`);
  return body.data;
}

// ------------------------------------------------------------------- crew

/**
 * services/.crew.json (gitignored): the crew's testnet keys, and the salts of
 * offers they sealed, so a restarted `crew play` can still open them.
 */
export const CREW_FILE = new URL("../../.crew.json", import.meta.url);
export type Bot = { name: string; key: Hex };
export type CrewFile = { bots: Bot[]; bids: Record<string, { bps: number; salt: Hex }> };

export function loadCrew(): CrewFile {
  try {
    const f = JSON.parse(readFileSync(CREW_FILE, "utf8")) as Partial<CrewFile>;
    return { bots: f.bots ?? [], bids: f.bids ?? {} };
  } catch {
    return { bots: [], bids: {} };
  }
}

export function saveCrew(f: CrewFile): void {
  writeFileSync(CREW_FILE, `${JSON.stringify(f, null, 2)}\n`, { mode: 0o600 });
}

/** address (lowercase) → name, for every crew bot. */
export function crewNames(): Map<string, string> {
  return new Map(loadCrew().bots.map((b) => [privateKeyToAccount(b.key).address.toLowerCase(), b.name]));
}

// ------------------------------------------------------------------- args

/** `--flag value` pairs (repeatable) and bare positionals. */
export function parseArgs(argv: string[]): { _: string[]; flags: Map<string, string[]> } {
  const _: string[] = [];
  const flags = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const k = eq > 0 ? a.slice(2, eq) : a.slice(2);
      const v = eq > 0 ? a.slice(eq + 1) : argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      flags.set(k, [...(flags.get(k) ?? []), v]);
    } else {
      _.push(a);
    }
  }
  return { _, flags };
}

// ANSI colours for terminal recordings; off when piped or with NO_COLOR.
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
export const c = { dim: paint(2), bold: paint(1), pink: paint(95), green: paint(32), red: paint(31), yellow: paint(33), cyan: paint(36) };
