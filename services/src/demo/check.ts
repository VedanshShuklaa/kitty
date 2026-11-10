// Preflight before filming or a judge's install: is everything the demo leans
// on live and funded? Read-only; sends nothing.
//
//   pnpm demo:check
//   pnpm demo:check --account Host=0x1234… --account FriendB=0xabcd…
//
// Exits 1 if anything is broken. Warnings ("!") are worth a look but don't
// stop a take.
import { getAddress, isAddress, parseEther, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import {
  AGORA,
  INDEXER,
  SITE,
  STAGES,
  c,
  client,
  deployment,
  earnVaultAbi,
  erc20Abi,
  factoryAbi,
  gql,
  mon,
  money,
  pairAbi,
  parseArgs,
  recordAbi,
  short,
  stakeVaultAbi,
  whitelisterAbi,
  why,
} from "./kit.js";

let problems = 0;
let warnings = 0;
const ok = (line: string) => console.log(`  ${c.green("✓")} ${line}`);
const bad = (line: string) => {
  problems++;
  console.log(`  ${c.red("✗")} ${line}`);
};
const warn = (line: string) => {
  warnings++;
  console.log(`  ${c.yellow("!")} ${line}`);
};
const info = (line: string) => console.log(`  ${c.dim("·")} ${line}`);
const section = (title: string) => console.log(`\n${c.bold(title)}`);

async function step(label: string, f: () => Promise<void>) {
  try {
    await f();
  } catch (e) {
    bad(`${label}: ${why(e)}`);
  }
}

const usd18 = (v: bigint) => money(v / 10n ** 12n);

async function site() {
  section("Site");
  await step("site", async () => {
    const res = await fetch(SITE, { signal: AbortSignal.timeout(15_000) });
    if (res.ok) ok(`${new URL(SITE).host} answers`);
    else bad(`${SITE} answered ${res.status}`);
  });
  await step("/download", async () => {
    const res = await fetch(`${SITE}/download`, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    const to = res.headers.get("location");
    if (!to || !/\.apk$/.test(to)) return bad(`/download doesn't point at an APK (status ${res.status})`);
    const apk = await fetch(to, { method: "HEAD", signal: AbortSignal.timeout(20_000) });
    const mb = Number(apk.headers.get("content-length") ?? 0) / 1e6;
    if (apk.ok) ok(`/download → ${to.split("/").pop()} (${mb ? `${mb.toFixed(1)} MB` : "size unknown"})`);
    else bad(`the APK behind /download answered ${apk.status}`);
  });
  await step("assetlinks", async () => {
    const res = await fetch(`${SITE}/.well-known/assetlinks.json`, { signal: AbortSignal.timeout(15_000) });
    const links = (await res.json()) as { target?: { package_name?: string; sha256_cert_fingerprints?: string[] } }[];
    const app = links.find((l) => l.target?.package_name === "xyz.kitty.app");
    const prints = app?.target?.sha256_cert_fingerprints?.length ?? 0;
    if (prints > 0) ok(`assetlinks.json vouches for xyz.kitty.app (${prints} signing ${prints === 1 ? "key" : "keys"}), so passkeys work`);
    else bad("assetlinks.json doesn't list xyz.kitty.app: passkey creation will fail");
  });
  await step("sponsor", async () => {
    const res = await fetch(`${SITE}/api/sponsor`, { signal: AbortSignal.timeout(15_000) });
    const s = (await res.json()) as { ok?: boolean; balance?: string; grant?: string; address?: string };
    const balance = Number(s.balance ?? 0);
    const grant = Number(s.grant ?? 0.5);
    if (!s.ok) bad(`gas sponsor ${s.address ? short(s.address) : ""} is out (${s.balance ?? "?"} MON): new accounts can't start`);
    else if (balance < 3) warn(`gas sponsor has ${balance.toFixed(2)} MON, about ${Math.floor((balance - 0.5) / grant)} new accounts' worth`);
    else ok(`gas sponsor holds ${balance.toFixed(2)} MON (${grant} MON per new account)`);
  });
}

async function indexer() {
  section(`Indexer (${INDEXER})`);
  await step("indexer", async () => {
    const d = await gql<{ _meta: { chainId: number; progressBlock: number; isReady: boolean }[] }>(
      "{ _meta { chainId progressBlock isReady } }",
    );
    const head = Number(await client.getBlockNumber());
    for (const [id, name] of [
      [10143, "Monad testnet"],
      [143, "Monad mainnet"],
    ] as const) {
      const m = d._meta.find((x) => x.chainId === id);
      if (!m) bad(`${name} (${id}) isn't indexed`);
      else if (!m.isReady) bad(`${name} is still syncing (block ${m.progressBlock.toLocaleString("en-US")})`);
      else if (id === 10143) {
        const behind = Math.max(0, head - m.progressBlock);
        const line = `${name} synced, ${behind} ${behind === 1 ? "block" : "blocks"} behind the chain (~${(behind * 0.4).toFixed(0)} s)`;
        if (behind > 150) warn(line);
        else ok(line);
      } else ok(`${name} synced (block ${m.progressBlock.toLocaleString("en-US")})`);
    }
  });
  await step("earnAUSD", async () => {
    const d = await gql<{ EarnRate: { aprBps: number; points: number }[] }>(
      '{ EarnRate(where: { id: { _eq: "earnAUSD" } }) { aprBps points } }',
    );
    const r = d.EarnRate[0];
    if (r && r.aprBps > 0) ok(`earnAUSD on mainnet earns ${(r.aprBps / 100).toFixed(2)}% a year (from ${r.points.toLocaleString("en-US")} deposits)`);
    else warn("no earnAUSD rate yet: the circle's yield line will leave the rate out");
  });
  await step("circles", async () => {
    const d = await gql<{ Circle: { state: string }[] }>(
      "query F($f: String!) { Circle(where: { factory: { _eq: $f } }, limit: 1000) { state } }",
      { f: deployment.circleFactory.toLowerCase() },
    );
    const by = new Map<string, number>();
    for (const x of d.Circle) by.set(x.state, (by.get(x.state) ?? 0) + 1);
    const parts = [...by].map(([s, n]) => `${n} ${s.toLowerCase()}`);
    info(`circles from the current factory: ${d.Circle.length ? parts.join(", ") : "none yet"}`);
  });
  await step("feed order", async () => {
    // the app sorts feeds by logIndex; an indexer from before that field fails this
    await gql("{ Activity(limit: 1, order_by: [{ at: desc }, { block: desc }, { logIndex: desc }]) { id } }");
    ok("feeds sort by (time, block, logIndex): the current schema");
  });
}

async function contracts() {
  section(`Contracts (factory ${short(deployment.circleFactory)})`);
  await step("code", async () => {
    const named: [string, Address][] = [
      ["CircleFactory", deployment.circleFactory],
      ["Circle implementation", deployment.circleImplementation],
      ["StakeVault", deployment.stakeVault],
      ["KittyRecord", deployment.kittyRecord],
      ["KittyCats", deployment.kittyCats],
      ["KittyEarnVault", deployment.kittyEarnVault],
    ];
    const codes = await Promise.all(named.map(([, a]) => client.getCode({ address: a })));
    const missing = named.filter((_, i) => !codes[i] || codes[i] === "0x").map(([n]) => n);
    if (missing.length) bad(`no code at: ${missing.join(", ")}`);
    else ok(`all ${named.length} contracts deployed`);
  });
  await step("factory", async () => {
    const [paused, minPeriod, wired] = await Promise.all([
      client.readContract({ address: deployment.circleFactory, abi: factoryAbi, functionName: "paused" }),
      client.readContract({ address: deployment.circleFactory, abi: factoryAbi, functionName: "minPeriod" }),
      client.readContract({ address: deployment.stakeVault, abi: stakeVaultAbi, functionName: "factory" }),
    ]);
    if (paused) bad("the factory is paused: nobody can create a circle");
    else ok(`factory open for new circles (rounds down to ${minPeriod} s)`);
    if (wired.toLowerCase() !== deployment.circleFactory.toLowerCase()) bad(`StakeVault is wired to ${short(wired)}, not this factory`);
    else ok("StakeVault is wired to this factory");
  });
  await step("earn vault", async () => {
    const e = { address: deployment.kittyEarnVault, abi: earnVaultAbi } as const;
    const [reserve, apr, speedUp, depositor] = await Promise.all([
      client.readContract({ ...e, functionName: "reserve" }),
      client.readContract({ ...e, functionName: "aprBps" }),
      client.readContract({ ...e, functionName: "speedUp" }),
      client.readContract({ ...e, functionName: "isDepositor", args: [deployment.stakeVault] }),
    ]);
    if (!depositor) bad("KittyEarnVault doesn't accept StakeVault's deposits: yield circles will fail");
    const line = `simulated yield: ${(apr / 100).toFixed(1)}% a year, sped up ${speedUp.toLocaleString("en-US")}x, ${money(reserve)} left in its reserve`;
    // yield stops (nothing fails) once the reserve is spent; small demo circles use cents of it
    if (reserve < 20_000000n) warn(`${line}: top it up with pnpm demo:crew fund-yield 1000`);
    else ok(line);
  });
}

async function agora() {
  section("Agora (testnet)");
  await step("pair", async () => {
    const p = { address: AGORA.pair, abi: pairAbi } as const;
    const [paused, out, ausdIn, ctkIn] = await Promise.all([
      client.readContract({ ...p, functionName: "isPaused" }),
      client.readContract({ ...p, functionName: "getAmountsOut", args: [1_000000n, [deployment.ausd, AGORA.ctk]] }),
      client.readContract({ address: deployment.ausd, abi: erc20Abi, functionName: "balanceOf", args: [AGORA.pair] }),
      client.readContract({ address: AGORA.ctk, abi: erc20Abi, functionName: "balanceOf", args: [AGORA.pair] }),
    ]);
    if (paused) return bad("the Instant Settlement pair is paused: cash-out sends will fail");
    const line = `Instant Settlement pair live: $1 AUSD gives ${usd18(out[1])} CTK; it holds ${money(ausdIn)} AUSD and ${usd18(ctkIn)} CTK`;
    if (out[1] !== 10n ** 18n) warn(`${line} (no longer 1:1)`);
    else ok(line);
  });
  await step("whitelister", async () => {
    // any account may approve itself on testnet (FR-SND-03); try it from a throwaway address
    const someone = privateKeyToAccount(generatePrivateKey()).address;
    await client.simulateContract({
      address: AGORA.whitelister,
      abi: whitelisterAbi,
      functionName: "setApprovedSwapper",
      args: [someone],
      account: someone,
    });
    ok("whitelisting is still open to any account");
  });
  await step("faucet", async () => {
    const held = await client.readContract({ address: deployment.ausd, abi: erc20Abi, functionName: "balanceOf", args: [AGORA.faucet] });
    if (held < 10_000_000000n) bad(`the AUSD faucet holds ${money(held)}, less than one claim`);
    else ok(`AUSD faucet holds ${money(held)} (10,000 a claim)`);
  });
}

async function helpers() {
  section("Helper keys (services/.env)");
  for (const [name, use] of [
    ["KEEPER_PRIVATE_KEY", "pnpm keeper"],
    ["CREW_FUNDER_KEY", "gas for crew bots"],
  ] as const) {
    const key = process.env[name] as Hex | undefined;
    if (!key) {
      info(`${name} not set (${use}${name === "CREW_FUNDER_KEY" ? "; bots will ask the sponsor instead" : ""})`);
      continue;
    }
    await step(name, async () => {
      const who = privateKeyToAccount(key).address;
      const bal = await client.getBalance({ address: who });
      const line = `${name} ${short(who)} holds ${mon(bal)} (${use})`;
      if (bal < parseEther("0.5")) warn(line);
      else ok(line);
    });
  }
}

async function accounts(list: string[]) {
  if (list.length === 0) return;
  section("Accounts");
  for (const entry of list) {
    const [label, raw] = entry.includes("=") ? entry.split("=", 2) : [null, entry];
    if (!isAddress(raw)) {
      bad(`${entry}: not an address`);
      continue;
    }
    const who = getAddress(raw);
    await step(entry, async () => {
      const [gas, dollars, ctk, terms, debt, swapper] = await Promise.all([
        client.getBalance({ address: who }),
        client.readContract({ address: deployment.ausd, abi: erc20Abi, functionName: "balanceOf", args: [who] }),
        client.readContract({ address: AGORA.ctk, abi: erc20Abi, functionName: "balanceOf", args: [who] }),
        client.readContract({ address: deployment.kittyRecord, abi: recordAbi, functionName: "termsOf", args: [who, 1_000000n] }),
        client.readContract({ address: deployment.kittyRecord, abi: recordAbi, functionName: "debtOf", args: [who] }),
        client.readContract({ address: AGORA.pair, abi: pairAbi, functionName: "hasRole", args: ["APPROVED_SWAPPER", who] }),
      ]);
      const stage = STAGES[terms.stage] ?? "?";
      const line = `${label ?? "account"} ${short(who)}: ${money(dollars)} dollars, ${usd18(ctk)} ready to cash out, ${mon(gas)}; ${stage}, ${terms.open} of ${terms.maxOpen} circles open${swapper ? ", whitelisted" : ", not whitelisted yet"}`;
      if (debt > 0n) bad(`${line}; owes ${money(debt)}`);
      else if (terms.maxOpen > 0 && terms.open >= terms.maxOpen) warn(`${line}: can't join another circle until one is collected`);
      else ok(line);
    });
  }
}

const { flags } = parseArgs(process.argv.slice(2));
console.log(c.bold("Kitty demo preflight") + c.dim(`  Monad testnet ${deployment.chainId}, deploy block ${deployment.deployBlock}`));
await site();
await indexer();
await contracts();
await agora();
await helpers();
await accounts(flags.get("account") ?? []);
console.log(
  `\n${problems ? c.red(`${problems} ${problems === 1 ? "problem" : "problems"}`) : c.green("Ready to film.")}${warnings ? c.yellow(`  ${warnings} ${warnings === 1 ? "warning" : "warnings"}`) : ""}`,
);
process.exit(problems ? 1 : 0);
