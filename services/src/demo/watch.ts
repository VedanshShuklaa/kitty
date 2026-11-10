// The Envio take: every circle event and every send, as the hosted indexer
// serves it, with how long after its block each one became queryable.
//
//   pnpm demo:watch
//   pnpm demo:watch --circle 0xabc… --name Host=0x123… --name FriendB=0x456…
//   pnpm demo:watch --account 0x123…
//
// Reads the same GraphQL the app reads (the site's /api/graphql, or
// INDEXER_URL to go straight to Envio Cloud). Crew bots are named from
// services/.crew.json.
import { getAddress, isAddress } from "viem";

import { INDEXER, c, client, crewNames, gql, money, parseArgs, short, why } from "./kit.js";

type Activity = {
  id: string;
  kind: string;
  actor: string | null;
  round: number | null;
  amount: string | null;
  fromStake: string | null;
  fromPool: string | null;
  shortfall: string | null;
  bps: number | null;
  at: string;
  block: number;
  logIndex: number;
  circle_id: string;
};
type Transfer = { id: string; from: string; to: string; token: string; amountUsd: string; route: string; at: string; block: number; logIndex: number };

const { flags } = parseArgs(process.argv.slice(2));
const circle = flags.get("circle")?.[0]?.toLowerCase();
const account = flags.get("account")?.[0]?.toLowerCase();
for (const a of [circle, account]) if (a && !isAddress(a)) throw new Error(`${a} is not an address`);

const names = crewNames();
for (const pair of flags.get("name") ?? []) {
  const [name, address] = pair.split("=", 2);
  if (!address || !isAddress(address)) throw new Error(`--name wants Name=0x…, got ${pair}`);
  names.set(address.toLowerCase(), name);
}
const who = (a: string | null) => (a ? (names.get(a.toLowerCase()) ?? short(getAddress(a))) : "Someone");
const amt = (v: string | null) => (v === null ? "" : money(BigInt(v)));
const pct = (bps: number | null) => `${((bps ?? 0) / 100).toFixed((bps ?? 0) % 100 ? 1 : 0)}%`;

/** The feed's sentences (app/src/feed.ts), shortened for a terminal; null for rows the feed skips. */
function line(a: Activity): string | null {
  const n = who(a.actor);
  switch (a.kind) {
    case "Created":
      return `${n} started a circle`;
    case "Joined":
      return `${n} joined and put down ${amt(a.amount)}`;
    case "Started":
      return "everyone's in: round 1 has started";
    case "Paid":
      return `${n} paid ${amt(a.amount)} for round ${a.round}${a.bps === 1 ? ", late" : ""}`;
    case "BidSealed":
      return `${n} sealed an offer for round ${a.round}`;
    case "BidOpened":
      return `${n} opened their offer: ${pct(a.bps)} of the pot`;
    case "Covered": {
      const short_ = a.shortfall && a.shortfall !== "0" ? `, ${amt(a.shortfall)} short` : ", pot paid in full";
      return `${n} missed round ${a.round}: deposit covered ${amt(a.fromStake ?? "0")}, pool ${amt(a.fromPool ?? "0")}${short_}`;
    }
    case "Defaulted":
      return `${n} stopped paying after taking the pot${a.shortfall && a.shortfall !== "0" ? `: ${amt(a.shortfall)} still owed` : ""}`;
    case "DefaultFilled":
      return `${amt(a.amount)} of ${n}'s missed payments made good`;
    case "CaughtUp":
      return `${n} caught up with ${amt(a.amount)}`;
    case "PotPaid":
      return `${n} took the round ${a.round} pot: ${amt(a.amount)}${a.bps ? `, after giving up ${pct(a.bps)}` : ""}`;
    case "Completed":
      return "the circle is complete";
    case "Cancelled":
      return "the circle was called off";
    case "Collected":
      return `${n} collected ${amt(a.amount)}`;
    case "Settled":
      return a.amount && a.amount !== "0" ? `deposits earned ${amt(a.amount)} while locked (simulated yield)` : null;
    case "PaidBack":
      return `${n} paid back ${amt(a.amount)}`;
    case "Credited":
      return `${n} was credited ${amt(a.amount)}`;
    case "PaidDebt":
      return `${n}'s pot paid ${amt(a.amount)} of a debt elsewhere`;
    default:
      return `${a.kind} ${n}`;
  }
}

function transferLine(t: Transfer): string {
  const v = money(BigInt(t.amountUsd));
  if (t.route === "Faucet") return `${who(t.to)} got ${v} test dollars from Agora's faucet`;
  if (t.route === "Convert") return `${who(t.from)} moved ${v} ${t.token === "CTK" ? "to ready to cash out" : "back to dollars"} (Instant Settlement)`;
  if (t.route === "CashOut") return `${who(t.from)} sent ${who(t.to)} ${v}, ready to cash out (Agora Instant Settlement)`;
  return `${who(t.from)} sent ${who(t.to)} ${v} as dollars`;
}

// a circle's view is its own events; sends belong to people, so they show
// with no filter or with --account
const withMoney = !circle || !!account;
const actWhere = circle ? `circle_id: { _eq: "${circle}" }, ` : account ? `actor: { _eq: "${account}" }, ` : "";
const moneyWhere = account ? `_or: [{ from: { _eq: "${account}" } }, { to: { _eq: "${account}" } }], ` : "";
const QUERY = `query Since($since: numeric!) {
  Activity(where: { ${actWhere}at: { _gte: $since } }, order_by: [{ at: desc }, { block: desc }, { logIndex: desc }], limit: 50) {
    id kind actor round amount fromStake fromPool shortfall bps at block logIndex circle_id
  }${
    withMoney
      ? `
  Transfer(where: { ${moneyWhere}at: { _gte: $since } }, order_by: [{ at: desc }, { block: desc }, { logIndex: desc }], limit: 50) {
    id from to token amountUsd route at block logIndex
  }`
      : ""
  }
}`;

// the laptop's clock against the chain's, so "after its block" isn't off by the laptop's drift
let skew = 0;
async function syncClock() {
  const b = await client.getBlock();
  skew = Number(b.timestamp) - Date.now() / 1000;
}

const seen = new Set<string>();
let since = 0;

async function poll(first: boolean) {
  const d = await gql<{ Activity: Activity[]; Transfer?: Transfer[] }>(QUERY, { since: String(since) });
  const rows = [
    ...d.Activity.map((a) => ({ id: a.id, at: Number(a.at), block: a.block, logIndex: a.logIndex, text: line(a), tag: a.kind, where: a.circle_id as string | null })),
    ...(d.Transfer ?? []).map((t) => ({
      id: t.id,
      at: Number(t.at),
      block: t.block,
      logIndex: t.logIndex,
      text: transferLine(t),
      tag: t.route === "Faucet" ? "Faucet" : t.route === "Convert" ? "Convert" : "Send",
      where: null,
    })),
  ]
    .filter((r) => !seen.has(r.id))
    .sort((x, y) => x.at - y.at || x.block - y.block || x.logIndex - y.logIndex);
  const now = Date.now() / 1000 + skew;
  for (const r of rows) {
    seen.add(r.id);
    since = Math.max(since, r.at - 5);
    if (r.text === null) continue;
    const time = new Date(r.at * 1000).toLocaleTimeString("en-GB");
    const place = !circle && r.where ? c.dim(` · circle ${short(getAddress(r.where))}`) : "";
    // block timestamps are whole seconds, so this is good to about a second
    const after = now - r.at;
    const lag = first ? c.dim("earlier") : c.green(`queryable ${after < 1 ? "under 1 s" : `~${after.toFixed(1)} s`} after its block`);
    console.log(`${c.dim(time)}  ${c.pink(r.tag.padEnd(10))} ${r.text}${place}  ${c.dim(`block ${r.block.toLocaleString("en-US")}`)}  ${lag}`);
  }
}

console.log(c.bold("Kitty on Envio") + c.dim(`  ${INDEXER}`));
try {
  const meta = await gql<{ _meta: { chainId: number; progressBlock: number; isReady: boolean }[]; EarnRate: { aprBps: number }[] }>(
    '{ _meta { chainId progressBlock isReady } EarnRate(where: { id: { _eq: "earnAUSD" } }) { aprBps } }',
  );
  for (const m of meta._meta.sort((a, b) => b.chainId - a.chainId)) {
    const name = m.chainId === 10143 ? "Monad testnet   circles, sends, standing" : "Monad mainnet   earnAUSD share price";
    console.log(`  ${c.cyan(String(m.chainId).padEnd(6))} ${name}  ${c.dim(`block ${m.progressBlock.toLocaleString("en-US")}`)}${m.isReady ? "" : c.yellow("  syncing")}`);
  }
  const rate = meta.EarnRate[0]?.aprBps;
  if (rate) console.log(`  ${c.dim("earnAUSD on mainnet, derived from its deposits:")} ${(rate / 100).toFixed(2)}% a year`);
} catch (e) {
  console.log(c.red(`  can't reach the indexer: ${why(e)}`));
}
console.log(c.dim(`\n${QUERY.split("\n").map((l) => `  ${l}`).join("\n")}\n`));
console.log(
  c.dim(circle ? `Watching circle ${circle}` : account ? `Watching ${who(account)}` : "Watching every circle and every send between Kitty accounts") +
    c.dim(" · Ctrl-C to stop\n"),
);

await syncClock();
// the last few minutes as context, then only what's new
since = Math.floor(Date.now() / 1000 + skew) - Number(flags.get("since")?.[0] ?? 300);
await poll(true).catch((e) => console.log(c.red(`  ${why(e)}`)));
setInterval(() => syncClock().catch(() => {}), 60_000);
let busy = false;
setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    await poll(false);
  } catch (e) {
    console.log(c.red(`  ${why(e)}`));
  } finally {
    busy = false;
  }
}, 1_000);
