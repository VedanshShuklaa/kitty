import { createPublicClient, createWalletClient, defineChain, formatEther, http, isAddress, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { clientIp, kvDel, limit, once } from "./_lib/kv.js";

// FR-GAS-01 for the demo: a member never has to find MON. The app calls this
// when an account runs low, and the sponsor sends a small fixed grant.
//
// Testnet-grade limits: a grant only goes to an account below LOW, and the
// sponsor refuses once its own balance falls under FLOOR, so the most it can
// ever give away is what it was funded with. The full SRS version (grant
// once per seat against an invite signature, daily cap, Postgres ledger)
// lives in services/.

const chain = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz"] } },
});

// Monad holds back gas limit x max fee before a call runs: about 0.1 MON for
// a createCircle at testnet prices, so the line sits above that
const GRANT = parseEther(process.env.SPONSOR_GRANT_MON ?? "0.5");
const LOW = parseEther("0.2");
const FLOOR = parseEther("0.5");
const IP_PER_DAY = 25;
const ALL_PER_DAY = 200;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function sponsor() {
  const key = process.env.SPONSOR_PRIVATE_KEY as Hex | undefined;
  if (!key) return null;
  const account = privateKeyToAccount(key);
  const pub = createPublicClient({ chain, transport: http() });
  const wallet = createWalletClient({ account, chain, transport: http() });
  return { account, pub, wallet };
}

export async function GET(): Promise<Response> {
  const s = sponsor();
  if (!s) return json({ ok: false, error: "sponsor not configured" }, 503);
  const balance = await s.pub.getBalance({ address: s.account.address });
  return json({ ok: balance >= FLOOR, address: s.account.address, balance: formatEther(balance), grant: formatEther(GRANT) });
}

export async function POST(req: Request): Promise<Response> {
  const s = sponsor();
  if (!s) return json({ error: "Kitty can't set up accounts right now. Try again later." }, 503);

  let address: unknown;
  try {
    ({ address } = (await req.json()) as { address?: unknown });
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  if (typeof address !== "string" || !isAddress(address)) return json({ error: "Bad request." }, 400);

  const [theirs, ours] = await Promise.all([
    s.pub.getBalance({ address }),
    s.pub.getBalance({ address: s.account.address }),
  ]);
  if (theirs >= LOW) return json({ funded: false });
  if (ours < FLOOR + GRANT) {
    return json({ error: "Kitty's test account is running low. The team has been told; try again later." }, 503);
  }
  // A fresh address costs nothing, so the balance line alone would let a
  // script drain the sponsor in a handful of calls. A daily allowance per
  // network (generous: a venue's Wi-Fi is one IP) and a daily ceiling bound
  // it; a one-minute hold per address stops two taps racing for two grants.
  const day = Math.floor(Date.now() / 86_400_000);
  const busy = { error: "Kitty is setting up a lot of accounts right now. Try again in a little while." };
  if (!(await limit(`sponsor:ip:${clientIp(req)}:${day}`, IP_PER_DAY, 86_400))) return json(busy, 429);
  if (!(await limit(`sponsor:all:${day}`, ALL_PER_DAY, 86_400))) return json(busy, 429);
  if (!(await once(`sponsor:addr:${address.toLowerCase()}`, 60))) {
    return json({ error: "Your account is already being topped up. Try again in a minute." }, 429);
  }

  // one grant at a time: viem takes the nonce from the pending count, so two
  // people signing up in the same second would otherwise collide
  let locked = false;
  for (let i = 0; i < 10 && !locked; i++) {
    locked = await once("sponsor:lock", 20);
    if (!locked) await new Promise((r) => setTimeout(r, 600));
  }
  if (!locked) {
    await kvDel(`rl:sponsor:addr:${address.toLowerCase()}`);
    return json(busy, 429);
  }
  try {
    const hash = await s.wallet.sendTransaction({ account: s.account, chain, to: address, value: GRANT, gas: 21_000n });
    return json({ funded: true, hash });
  } catch {
    await kvDel(`rl:sponsor:addr:${address.toLowerCase()}`);
    return json({ error: "Kitty couldn't set up your account just now. Try again in a minute." }, 502);
  } finally {
    await kvDel("rl:sponsor:lock");
  }
}
