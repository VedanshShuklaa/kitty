import {
  createWalletClient,
  getAddress,
  http,
  isAddress,
  parseSignature,
  zeroAddress,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ausdAbi, pairAbi, whitelisterAbi } from "./abi";
import { sendLinkKey } from "./account/keys";
import { monadTestnet } from "./chain";
import { contracts, siteUrl } from "./config";
import { explain } from "./errors";
import { client, ensureTopUp, nowOnChain, send, serial, type Call, type Signer } from "./kitty";

// Sending and receiving (SRS 15.3, FR-SND). Money arrives either as dollars
// (AUSD) or ready to cash out. The second goes through Agora's Instant
// Settlement pair with the recipient as the swap's `to`, so the currency leg
// and the transfer settle in one transaction at the pair's fixed price. On
// testnet CTK stands in for the USDC the mainnet pair settles to.

const AUSD = () => contracts.ausd;
const CTK = () => contracts.ctk;
const PAIR = () => contracts.pair;

/** CTK has 18 decimals, AUSD 6, and the pair prices them 1:1. */
export const CTK_PER_USD_UNIT = 10n ** 12n;
export const toCtk = (usd: bigint) => usd * CTK_PER_USD_UNIT;
export const fromCtk = (ctk: bigint) => ctk / CTK_PER_USD_UNIT;

export type Arrival = "dollars" | "cashOut";
export type Balances = { dollars: bigint; cashOut: bigint }; // both in AUSD units (6 decimals)

const erc20 = ausdAbi;

export async function balances(who: Address): Promise<Balances> {
  const [dollars, ctk] = await Promise.all([
    client.readContract({ address: AUSD(), abi: erc20, functionName: "balanceOf", args: [who] }),
    client.readContract({ address: CTK(), abi: erc20, functionName: "balanceOf", args: [who] }),
  ]);
  return { dollars, cashOut: fromCtk(ctk) };
}

// ------------------------------------------------------------ the pair

export const isSwapper = (who: Address) =>
  client.readContract({ address: PAIR(), abi: pairAbi, functionName: "hasRole", args: ["APPROVED_SWAPPER", who] });

/**
 * FR-SND-03: an account becomes an approved swapper through Agora's testnet
 * whitelister, once, with no prompt. Nothing leaves the account here.
 */
export async function ensureSwapper(s: Signer): Promise<void> {
  await ensureTopUp(s.address);
  if (!(await isSwapper(s.address))) {
    await send(s, { address: contracts.whitelister, abi: whitelisterAbi, functionName: "setApprovedSwapper", args: [s.address] });
  }
}

// The pair is someone else's contract, so it never holds an open-ended
// allowance: a swap the member has just confirmed tops it up to what that swap
// needs, and at least $250 so everyday sends don't each wait on an approval.
const PAIR_ALLOWANCE_USD = 250_000000n;

async function ensurePairAllowance(s: Signer, token: Address, amountIn: bigint): Promise<void> {
  const allowance = await client.readContract({ address: token, abi: erc20, functionName: "allowance", args: [s.address, PAIR()] });
  if (allowance >= amountIn) return;
  const floor = token === CTK() ? toCtk(PAIR_ALLOWANCE_USD) : PAIR_ALLOWANCE_USD;
  await send(s, { address: token, abi: erc20, functionName: "approve", args: [PAIR(), amountIn > floor ? amountIn : floor] });
}

/** What the pair delivers for `amountIn` right now; the swap must deliver at least this (FR-SND-02). */
export async function quote(amountIn: bigint, path: readonly [Address, Address]): Promise<bigint> {
  const out = await client.readContract({ address: PAIR(), abi: pairAbi, functionName: "getAmountsOut", args: [amountIn, [...path]] });
  return out[1];
}

// ---------------------------------------------------------- settlement

/** FR-SND-04: a send ends on a settled state, with the time it took. */
export type Settled = { hash: Hex; block: bigint; ms: number; afterSigning: number };

export class SendFailed extends Error {
  constructor(
    message: string,
    /** True only when a transaction went out and its outcome is unknown. */
    readonly maybeSent = false,
  ) {
    super(message);
  }
}

async function untilSafe(block: bigint): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const safe = await client.getBlock({ blockTag: "safe" }).catch(() => null);
    if (safe && safe.number >= block) return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** One transaction, from a tap to a receipt at the `safe` block tag; queued behind the account's other sends. */
function settle(s: Signer, call: Call, tappedAt: number): Promise<Settled> {
  return serial(s.address, () => settleNow(s, call, tappedAt));
}

async function settleNow(s: Signer, call: Call, tappedAt: number): Promise<Settled> {
  let hash: Hex;
  let signedAt: number;
  try {
    const gas = await client.estimateContractGas({ ...call, account: s.account } as never);
    const wallet = createWalletClient({ account: s.account, chain: monadTestnet, transport: http() });
    signedAt = Date.now();
    hash = await wallet.writeContract({ ...call, gas: (gas * 12n) / 10n, account: s.account, chain: monadTestnet } as never);
  } catch (e) {
    throw new SendFailed(`${explain(e)} No money left your account.`);
  }
  let receipt: TransactionReceipt;
  try {
    receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  } catch {
    throw new SendFailed("It was sent but hasn't confirmed yet. Check your activity in a minute before trying again.", true);
  }
  if (receipt.status !== "success") throw new SendFailed("It didn't go through. No money left your account.");
  await untilSafe(receipt.blockNumber);
  const now = Date.now();
  return { hash, block: receipt.blockNumber, ms: now - tappedAt, afterSigning: now - signedAt };
}

/** FR-SND-01/02: send `usd` (AUSD units) to `to`, arriving as dollars or ready to cash out. */
export async function sendMoney(s: Signer, to: Address, usd: bigint, arrival: Arrival, tappedAt: number): Promise<Settled> {
  if (to.toLowerCase() === s.address.toLowerCase()) throw new SendFailed("That's your own account. No money left it.");
  await ensureTopUp(s.address);
  if (arrival === "dollars") {
    return settle(s, { address: AUSD(), abi: erc20, functionName: "transfer", args: [to, usd] }, tappedAt);
  }
  await ensureSwapper(s);
  await ensurePairAllowance(s, AUSD(), usd);
  const path = [AUSD(), CTK()] as const;
  const out = await quote(usd, path);
  // deadlines run on the chain's clock: a phone's can be minutes off
  const deadline = BigInt((await nowOnChain()) + 300);
  return settle(s, { address: PAIR(), abi: pairAbi, functionName: "swapExactTokensForTokens", args: [usd, out, [...path], to, deadline] }, tappedAt);
}

/** FR-SND-05: move `usd` between the two balances, instantly, through the same pair. */
export async function convert(s: Signer, into: Arrival, usd: bigint, tappedAt: number): Promise<Settled> {
  await ensureSwapper(s);
  const path = into === "cashOut" ? ([AUSD(), CTK()] as const) : ([CTK(), AUSD()] as const);
  const amountIn = into === "cashOut" ? usd : toCtk(usd);
  await ensurePairAllowance(s, path[0], amountIn);
  const out = await quote(amountIn, path);
  const deadline = BigInt((await nowOnChain()) + 300);
  return settle(
    s,
    { address: PAIR(), abi: pairAbi, functionName: "swapExactTokensForTokens", args: [amountIn, out, [...path], s.address, deadline] },
    tappedAt,
  );
}

// ---------------------------------------------------------- pay links

/** A Kitty code is a QR of this link: the address in the path, the name after the #. */
export const payLink = (who: Address, name: string) => `${siteUrl}/p/${who}#n=${encodeURIComponent(name)}`;

/** Addresses money must never be sent to: it would be gone for good. */
const notAPerson = (a: Address) =>
  [zeroAddress, contracts.ausd, contracts.ctk, contracts.pair, contracts.whitelister, contracts.circleFactory, contracts.kittyRecord, contracts.kittyCats]
    .some((x) => !!x && x.toLowerCase() === a.toLowerCase());

export function parsePayee(text: string): { address: Address; name: string | null } | null {
  const t = text.trim();
  if (isAddress(t)) return notAPerson(t) ? null : { address: getAddress(t), name: null };
  const m = t.match(/\/p\/(0x[0-9a-fA-F]{40})(?:\?[^#]*#|[#?])?(?:n=([^&]*))?/);
  if (!m || !isAddress(m[1]) || notAPerson(m[1])) return null;
  let name: string | null = null;
  try {
    name = m[2] ? decodeURIComponent(m[2]).slice(0, 40) || null : null;
  } catch {
    // a garbled name still leaves a good address
  }
  return { address: getAddress(m[1]), name };
}

// ---------------------------------------------------------- send by link

// FR-SND-08: money sent by link sits at a one-time address whose key is
// re-derived from the sender's passkey ("send-link" | n) and travels in the
// link's fragment. The recipient claims it with a permit signed by that key,
// so the one-time address never needs gas. There is no escrow contract, and
// the sender can always re-derive the key and take an unclaimed send back.

export type SendLink = { n: number; address: Address; key: Hex };

const linkAt = (prf: Uint8Array, n: number): SendLink => {
  const key = sendLinkKey(prf, n);
  return { n, key, address: privateKeyToAccount(key).address };
};

/**
 * Links used so far: every n up to the first address that has never held or
 * released money. There's no small cap: stopping early would hand out an
 * already-used one-time key again, and hide links from take-back.
 */
export async function sendLinks(prf: Uint8Array): Promise<(SendLink & { balance: bigint })[]> {
  const used: (SendLink & { balance: bigint })[] = [];
  for (let n = 0; ; n++) {
    if (n >= 1_000) throw new Error("Too many send links on this account to list.");
    const link = linkAt(prf, n);
    const [balance, nonce] = await Promise.all([
      client.readContract({ address: AUSD(), abi: erc20, functionName: "balanceOf", args: [link.address] }),
      client.readContract({ address: AUSD(), abi: erc20, functionName: "nonces", args: [link.address] }),
    ]);
    if (balance === 0n && nonce === 0n) break;
    used.push({ ...link, balance });
  }
  return used;
}

export const sendLinkUrl = (link: SendLink, from: string) =>
  `${siteUrl}/s/${link.address}#k=${link.key}&n=${encodeURIComponent(from)}`;

export function parseSendLink(url: string): { address: Address; key: Hex; from: string | null } | null {
  // `?` as well as `#`, for the money page's intent hand-over (see links.ts)
  const m = url.trim().match(/\/s\/(0x[0-9a-fA-F]{40})(?:\?[^#]*#|[#?])k=(0x[0-9a-fA-F]{64})(?:&n=([^&]*))?/);
  if (!m) return null;
  const key = m[2] as Hex;
  let address: Address;
  try {
    address = privateKeyToAccount(key).address;
  } catch {
    return null; // zero, or past the curve order: a crafted link, not a key
  }
  if (address.toLowerCase() !== m[1].toLowerCase()) return null;
  let from: string | null = null;
  try {
    from = m[3] ? decodeURIComponent(m[3]).slice(0, 40) : null;
  } catch {
    // the money is still claimable without a name
  }
  return { address, key, from };
}

/** Funds the next unused one-time address and returns the link to share. */
export async function createSendLink(s: Signer, usd: bigint, from: string, tappedAt: number): Promise<{ url: string; settled: Settled }> {
  await ensureTopUp(s.address);
  const used = await sendLinks(s.prf);
  const link = linkAt(s.prf, used.length);
  const settled = await settle(s, { address: AUSD(), abi: erc20, functionName: "transfer", args: [link.address, usd] }, tappedAt);
  return { url: sendLinkUrl(link, from), settled };
}

export const linkBalance = (address: Address) =>
  client.readContract({ address: AUSD(), abi: erc20, functionName: "balanceOf", args: [address] });

/**
 * Moves everything at a one-time address to `s`: the one-time key signs an
 * AUSD permit for `s`, and `s` submits it and pulls the money. Used both to
 * claim a link and to take back an unclaimed one.
 */
export async function claimLink(s: Signer, key: Hex, tappedAt: number): Promise<{ amount: bigint; settled: Settled }> {
  const oneTime = privateKeyToAccount(key);
  const [amount, nonce] = await Promise.all([
    linkBalance(oneTime.address),
    client.readContract({ address: AUSD(), abi: erc20, functionName: "nonces", args: [oneTime.address] }),
  ]);
  if (amount === 0n) throw new SendFailed("This link has already been claimed or taken back.");
  await ensureTopUp(s.address);
  const deadline = BigInt((await nowOnChain()) + 600);
  const signature = await oneTime.signTypedData({
    domain: { name: "Agora Dollar", version: "1", chainId: contracts.chainId, verifyingContract: AUSD() },
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit",
    message: { owner: oneTime.address, spender: s.address, value: amount, nonce, deadline },
  });
  const sig = parseSignature(signature);
  const v = Number(sig.v ?? BigInt(sig.yParity + 27));
  await send(s, { address: AUSD(), abi: erc20, functionName: "permit", args: [oneTime.address, s.address, amount, deadline, v, sig.r, sig.s] });
  const settled = await settle(s, { address: AUSD(), abi: erc20, functionName: "transferFrom", args: [oneTime.address, s.address, amount] }, tappedAt);
  return { amount, settled };
}
