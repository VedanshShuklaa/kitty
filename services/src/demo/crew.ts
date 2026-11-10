// The crew: scripted testnet members for rehearsals and filming (FR-OPS-01).
// Each is a plain testnet key in services/.crew.json (gitignored). They join
// from the same invite links a phone shares, pay, seal and open offers, miss
// on cue, and collect at the end, using the contracts exactly as the app does.
//
//   pnpm demo:crew init 3                     three crew members (Host, FriendA, FriendB)
//   pnpm demo:crew list                       what each holds, their standing, circles open
//   pnpm demo:crew fund                       gas and 10,000 test dollars each
//   pnpm demo:crew join '<invite link>'       a crew member takes that seat (quote it: the link has # and &)
//   pnpm demo:crew play <circle> [cues]       pay every round until the circle ends, then collect
//       --miss Host:2          Host doesn't pay round 2 (covered from the deposit; a default if he's had the pot)
//       --late FriendA:1            FriendA pays round 1 after the due time
//       --bid Host:2:15        Host seals an offer of 15% for round 2, and opens it at the due time
//       --catch-up Host:3      Host pays off his arrears in round 3
//       --close                 also hand out each pot when it's due (phones and the keeper do this anyway)
//       --no-collect            leave the money in the circle at the end
//   pnpm demo:crew create --names "Host,FriendA,FriendB" [--amount 5] [--every 60|120|600] [--start 3] [--offers 30] [--yield] [--title T]
//                                             a crew member organizes a circle and prints each seat's invite link
//   pnpm demo:crew status <circle> [--name Host=0x…]
//   pnpm demo:crew send <address or pay link> <dollars> [--from FriendA] [--cash-out]
//   pnpm demo:crew fund-yield <dollars>       top up the simulated-yield reserve
//
// Gas comes from CREW_FUNDER_KEY in services/.env if set, else from Kitty's sponsor.
import { randomBytes } from "node:crypto";
import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  parseAbiParameters,
  toBytes,
  toHex,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
  type PrivateKeyAccount,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import {
  AGORA,
  SITE,
  STAGES,
  STATES,
  ausdOf,
  c,
  circleAbi,
  client,
  deployment,
  earnVaultAbi,
  ensureGas,
  erc20Abi,
  explorerTx,
  factoryAbi,
  faucet,
  loadCrew,
  mon,
  money,
  pairAbi,
  parseArgs,
  recordAbi,
  saveCrew,
  send,
  short,
  sleep,
  whitelisterAbi,
  why,
  type Bot,
  type CrewFile,
} from "./kit.js";

const NAMES = ["Host", "FriendA", "FriendB", "Member4", "Member5", "Member6", "Member7", "Member8", "Member9", "Member10", "Member11", "Member12"];

const log = (line: string) => console.log(`${c.dim(new Date().toLocaleTimeString("en-GB"))}  ${line}`);
const acct = (b: Bot) => privateKeyToAccount(b.key);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function newBot(f: CrewFile, name?: string): Bot {
  const taken = new Set(f.bots.map((b) => b.name.toLowerCase()));
  const pick =
    name && !taken.has(name.toLowerCase()) ? name : (NAMES.find((n) => !taken.has(n.toLowerCase())) ?? `Member ${f.bots.length + 1}`);
  const bot = { name: pick, key: generatePrivateKey() };
  f.bots.push(bot);
  saveCrew(f);
  return bot;
}

function findBot(f: CrewFile, name: string): Bot {
  const b = f.bots.find((x) => same(x.name, name));
  if (!b) throw new Error(`no crew member called ${name} (see pnpm demo:crew list)`);
  return b;
}

/** "5" or "5.25" dollars to AUSD units, without floating point. */
function usd(s: string): bigint {
  const m = s.trim().replace(/^\$/, "").match(/^(\d+)(?:\.(\d{1,6}))?$/);
  if (!m) throw new Error(`${s} isn't an amount in dollars`);
  return BigInt(m[1]) * 1_000000n + BigInt((m[2] ?? "").padEnd(6, "0"));
}

const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.floor(s)) % 60).padStart(2, "0")}`;

// -------------------------------------------------------------- reading

async function view(circle: Address) {
  const k = { address: circle, abi: circleAbi } as const;
  const [rules, stateN, round, block] = await Promise.all([
    client.readContract({ ...k, functionName: "rules" }),
    client.readContract({ ...k, functionName: "state" }),
    client.readContract({ ...k, functionName: "currentRound" }),
    client.getBlock(),
  ]);
  const [members, due] = await Promise.all([
    Promise.all(Array.from({ length: rules.memberCount }, (_, i) => client.readContract({ ...k, functionName: "memberAt", args: [i] }))),
    round > 0 ? client.readContract({ ...k, functionName: "dueTime", args: [round] }) : Promise.resolve(rules.firstDue),
  ]);
  return { circle, rules, state: STATES[stateN] ?? "forming", round, due: Number(due), members, now: Number(block.timestamp) };
}
type View = Awaited<ReturnType<typeof view>>;

/** Where the current round is, on the chain's clock (SRS 7.4). */
function phase(v: View): string {
  if (v.state === "forming") {
    const joined = v.members.filter((a) => a !== zeroAddress).length;
    return `forming · ${joined} of ${v.rules.memberCount} joined · joining closes in ${mmss(Number(v.rules.joinDeadline) - v.now)}`;
  }
  if (v.state !== "active") return v.state;
  const r = v.rules;
  const head = `round ${v.round} of ${r.memberCount}`;
  if (v.now < v.due - r.commitWindow) return `${head} · paying · offers open in ${mmss(v.due - r.commitWindow - v.now)}`;
  if (v.now < v.due) return `${head} · offers can be sealed · due in ${mmss(v.due - v.now)}`;
  if (v.now <= v.due + r.revealWindow) return `${head} · offers opening · late payments for ${mmss(v.due + r.grace - v.now)}`;
  if (v.now < v.due + r.grace) return `${head} · late payments for ${mmss(v.due + r.grace - v.now)}`;
  return `${head} · ready to hand out the pot`;
}

// --------------------------------------------------------------- joining

type Invite = { circle: Address; seat: number; key: Hex; title: string; names: string[] };

/** The app's parseInvite (app/src/links.ts): circle and seat in the path, the seat's key after the #. */
function parseInvite(url: string): Invite | null {
  const m = url.trim().match(/\/j\/(0x[0-9a-fA-F]{40})\/(\d{1,2})[#?](.+)$/);
  if (!m || !isAddress(m[1])) return null;
  const fragment = m[3].includes("#") ? m[3].slice(m[3].indexOf("#") + 1) : m[3];
  const params = new Map(
    fragment.split("&").map((p) => {
      const i = p.indexOf("=");
      return [i > 0 ? p.slice(0, i) : p, i > 0 ? p.slice(i + 1) : ""] as const;
    }),
  );
  const key = params.get("k");
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) return null;
  let title = "Savings circle";
  let names: string[] = [];
  try {
    const meta = JSON.parse(decodeURIComponent(params.get("m") ?? ""));
    if (typeof meta.t === "string") title = meta.t;
    if (Array.isArray(meta.n)) names = meta.n.map(String);
  } catch {
    // names are a nicety; the seat's key is what joins
  }
  return { circle: getAddress(m[1]), seat: Number(m[2]), key: key as Hex, title, names };
}

const JOIN_TYPEHASH = keccak256(toBytes("kitty.join.v1"));

/** SRS 7.6: the seat's invite key signs over the joiner's own address. */
const joinDigest = (circle: Address, seat: number, joiner: Address) =>
  keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, uint256, address, uint8, address"), [
      JOIN_TYPEHASH,
      BigInt(deployment.chainId),
      circle,
      seat,
      joiner,
    ]),
  );

const termsOf = (who: Address, contribution: bigint) =>
  client.readContract({ address: deployment.kittyRecord, abi: recordAbi, functionName: "termsOf", args: [who, contribution] });

/** A crew member who can take a seat here: the seat's own name if there is one, else anyone free, else someone new. */
async function chooseBot(f: CrewFile, v: View, wanted: string | undefined, forced: boolean): Promise<Bot> {
  const free = async (b: Bot) => {
    const who = acct(b).address;
    if (v.members.some((a) => same(a, who))) return false;
    const t = await termsOf(who, v.rules.contribution);
    return t.maxOpen > 0 && t.open < t.maxOpen;
  };
  if (forced && wanted) {
    const b = findBot(f, wanted);
    if (!(await free(b))) throw new Error(`${b.name} is already in this circle or has too many circles open`);
    return b;
  }
  const named = wanted ? f.bots.find((b) => same(b.name, wanted)) : undefined;
  if (named && (await free(named))) return named;
  for (const b of f.bots) if (await free(b)) return b;
  return newBot(f, wanted);
}

async function join(link: string, as: string | undefined) {
  const inv = parseInvite(link);
  if (!inv) throw new Error("that isn't a Kitty invite link (put it in quotes: it contains # and &)");
  const isCircle = await client.readContract({ address: deployment.circleFactory, abi: factoryAbi, functionName: "isCircle", args: [inv.circle] });
  if (!isCircle) throw new Error("that circle isn't from the factory in deployments/10143.json");
  const v = await view(inv.circle);
  if (v.state !== "forming") throw new Error(`that circle is already ${v.state}`);
  if (v.members[inv.seat] !== zeroAddress) throw new Error(`seat ${inv.seat} is taken`);
  if (v.now >= Number(v.rules.joinDeadline)) throw new Error("joining has closed for that circle");

  const f = loadCrew();
  const bot = await chooseBot(f, v, as ?? inv.names[inv.seat], !!as);
  const me = acct(bot);
  const seatName = inv.names[inv.seat] ? `"${inv.names[inv.seat]}"` : `seat ${inv.seat}`;
  log(`${c.pink(bot.name)} ${c.dim(short(me.address))} is taking ${seatName} in ${c.bold(inv.title)}`);

  await ensureGas(me.address);
  const terms = await termsOf(me.address, v.rules.contribution);
  const deposit = (v.rules.contribution * BigInt(v.rules.stakeBps) * BigInt(terms.depositX100)) / 1_000_000n;
  // FR-JOIN-03: one approval covers the deposit, every round and one catch-up
  const approval = deposit + v.rules.contribution * BigInt(v.rules.memberCount + 1);
  if ((await ausdOf(me.address)) < approval) await faucet(me, log);
  const allowance = await client.readContract({ address: deployment.ausd, abi: erc20Abi, functionName: "allowance", args: [me.address, inv.circle] });
  if (allowance < approval) await send(me, { address: deployment.ausd, abi: erc20Abi, functionName: "approve", args: [inv.circle, approval] });
  const sig = await privateKeyToAccount(inv.key).signMessage({ message: { raw: joinDigest(inv.circle, inv.seat, me.address) } });
  const hash = await send(me, { address: inv.circle, abi: circleAbi, functionName: "join", args: [inv.seat, sig] });
  log(`joined as ${STAGES[terms.stage]}, ${money(deposit)} deposit  ${c.dim(explorerTx(hash))}`);
}

// The app's short testnet cadences (app/src/kitty.ts CADENCES), by period.
const CADENCES: Record<number, { commit: number; reveal: number; grace: number }> = {
  60: { commit: 25, reveal: 15, grace: 20 },
  120: { commit: 50, reveal: 20, grace: 30 },
  600: { commit: 240, reveal: 60, grace: 120 },
};

/**
 * A crew member organizes a circle, as the app's Create screen does, and
 * prints an invite link per seat: for a phone to open, or for `crew join`.
 * The links carry the names but no roster key, so a phone that joins one
 * shows them from the link rather than from Kitty's sealed storage.
 */
async function create(flags: Map<string, string[]>) {
  const names = (flags.get("names")?.[0] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (names.length < 2 || names.length > 12) throw new Error('--names "Host,FriendA,FriendB": the organizer first, 2 to 12 people');
  const every = Number(flags.get("every")?.[0] ?? 60);
  const cad = CADENCES[every];
  if (!cad) throw new Error("--every 60, 120 or 600 (seconds a round)");
  const contribution = usd(flags.get("amount")?.[0] ?? "5");
  const startIn = Math.round(Number(flags.get("start")?.[0] ?? 3) * 60);
  const maxBidBps = Math.round(Number(flags.get("offers")?.[0] ?? 30) * 100);
  const title = flags.get("title")?.[0] ?? "Crew circle";

  const f = loadCrew();
  const org = f.bots.find((b) => same(b.name, names[0])) ?? newBot(f, names[0]);
  const me = acct(org);
  await ensureGas(me.address);
  const terms = await termsOf(me.address, contribution);
  if (terms.maxOpen === 0 || terms.open >= terms.maxOpen) throw new Error(`${org.name} can't open another circle right now`);
  const deposit = (contribution * 10_000n * BigInt(terms.depositX100)) / 1_000_000n;
  const approval = deposit + contribution * BigInt(names.length + 1);
  if ((await ausdOf(me.address)) < approval) await faucet(me, log);

  // times are fixed only after the faucet, which can take a minute when it's busy
  const firstDue = BigInt(Number((await client.getBlock()).timestamp) + startIn);
  const rules = {
    memberCount: names.length,
    stakeBps: 10_000,
    maxBidBps,
    poolShareBps: 1_000,
    holdbackBps: 2_000,
    yieldOn: flags.has("yield"),
    contribution,
    firstDue,
    period: every,
    commitWindow: cad.commit,
    revealWindow: cad.reveal,
    grace: cad.grace,
    joinDeadline: firstDue - BigInt(cad.commit),
  };
  const circle = await client.readContract({ address: deployment.circleFactory, abi: factoryAbi, functionName: "predictCircle", args: [me.address] });
  const keys = names.map((_, i) => (i === 0 ? null : generatePrivateKey()));
  const signers = keys.map((k) => (k ? privateKeyToAccount(k).address : zeroAddress));
  await send(me, { address: deployment.circleFactory, abi: factoryAbi, functionName: "createCircle", args: [rules, signers] });
  const allowance = await client.readContract({ address: deployment.ausd, abi: erc20Abi, functionName: "allowance", args: [me.address, circle] });
  if (allowance < approval) await send(me, { address: deployment.ausd, abi: erc20Abi, functionName: "approve", args: [circle, approval] });
  await send(me, { address: circle, abi: circleAbi, functionName: "join", args: [0, "0x"] });

  log(`${c.pink(org.name)} started ${c.bold(title)}: ${circle}`);
  log(`first payment in ${mmss(startIn)}, joining closes ${cad.commit} s before it`);
  const meta = encodeURIComponent(JSON.stringify({ t: title, n: names }));
  keys.forEach((k, seat) => {
    if (!k) return;
    console.log(`\n  ${names[seat]} (seat ${seat})\n  ${SITE}/j/${circle}/${seat}#k=${k}&m=${meta}`);
  });
  console.log(`\n  then: pnpm demo:crew play ${circle}`);
}

// --------------------------------------------------------------- playing

type Cue = { name: string; round: number; bps: number };

function cues(list: string[] | undefined, withBps = false): Cue[] {
  return (list ?? []).map((s) => {
    const [name, round, pct] = s.split(":");
    const r = Number(round);
    const bps = withBps ? Math.round(Number(pct) * 100) : 0;
    if (!name || !Number.isInteger(r) || r < 1 || (withBps && !(bps > 0))) {
      throw new Error(`can't read the cue ${s} (want Name:round${withBps ? ":percent" : ""})`);
    }
    return { name, round: r, bps };
  });
}

const hit = (list: Cue[], name: string, round: number) => list.find((x) => same(x.name, name) && x.round === round);

/** Enough dollars and allowance for `amount` more into the circle. */
async function ensureFunds(me: PrivateKeyAccount, circle: Address, amount: bigint) {
  await ensureGas(me.address);
  if ((await ausdOf(me.address)) < amount) await faucet(me, log);
  const allowance = await client.readContract({ address: deployment.ausd, abi: erc20Abi, functionName: "allowance", args: [me.address, circle] });
  if (allowance < amount) await send(me, { address: deployment.ausd, abi: erc20Abi, functionName: "approve", args: [circle, amount] });
}

/** Collects what's left; with nothing left, still writes the finished circle into the record. */
async function settle(b: Bot, circle: Address, state: string) {
  const me = acct(b);
  const k = { address: circle, abi: circleAbi } as const;
  await ensureGas(me.address);
  const left = await client.readContract({ ...k, functionName: "withdrawable", args: [me.address] });
  if (left > 0n) {
    await send(me, { ...k, functionName: "withdraw" });
    log(`${c.pink(b.name.padEnd(8))} collected ${money(left)}`);
    return;
  }
  if (state !== "completed") return;
  try {
    await client.simulateContract({ ...k, functionName: "recordFinish", args: [me.address], account: me.address });
  } catch {
    return; // already in the record
  }
  await send(me, { ...k, functionName: "recordFinish", args: [me.address] });
  log(`${c.pink(b.name.padEnd(8))} finished circle written into the record`);
}

async function play(circleArg: string, flags: Map<string, string[]>) {
  if (!isAddress(circleArg)) throw new Error(`${circleArg} isn't a circle address`);
  const circle = getAddress(circleArg);
  const k = { address: circle, abi: circleAbi } as const;
  const f = loadCrew();
  const misses = cues(flags.get("miss"));
  const lates = cues(flags.get("late"));
  const bids = cues(flags.get("bid"), true);
  const catchUps = cues(flags.get("catch-up"));
  const close = flags.has("close");
  const collect = !flags.has("no-collect");
  for (const b of [...misses, ...lates, ...bids, ...catchUps]) findBot(f, b.name);

  let last = "";
  let waitedForSeats = false;
  for (;;) {
    let v: View;
    try {
      v = await view(circle);
    } catch (e) {
      log(c.red(why(e)));
      await sleep(3_000);
      continue;
    }
    // a line when the phase changes, not every time its countdown ticks
    const status = phase(v);
    const key = status.replace(/\d+:\d\d/g, "");
    if (key !== last) {
      log(c.cyan(status));
      last = key;
    }
    const mine = f.bots.filter((b) => v.members.some((a) => same(a, acct(b).address)));
    if (mine.length === 0) {
      if (v.state !== "forming") throw new Error("no crew member sits in this circle (pnpm demo:crew join '<link>')");
      if (!waitedForSeats) log("no crew member has joined yet; waiting");
      waitedForSeats = true;
      await sleep(3_000);
      continue;
    }
    for (const b of bids) {
      if (b.bps > v.rules.maxBidBps) throw new Error(`${b.name}'s ${b.bps / 100}% is over this circle's ${v.rules.maxBidBps / 100}% cap`);
    }

    if (v.state === "forming") {
      await sleep(3_000);
      continue;
    }
    if (v.state === "completed" || v.state === "cancelled") {
      if (collect) for (const b of mine) await settle(b, circle, v.state).catch((e) => log(`${b.name}: ${c.red(why(e))}`));
      log(v.state === "completed" ? "the circle is complete" : "the circle was called off");
      return;
    }

    const r = v.round;
    for (const b of mine) {
      const me = acct(b);
      const tag = c.pink(b.name.padEnd(8));
      try {
        const [[standing, , arrears], paid, commitment, [revealed]] = await Promise.all([
          client.readContract({ ...k, functionName: "standingOf", args: [me.address] }),
          client.readContract({ ...k, functionName: "paidRound", args: [r, me.address] }),
          client.readContract({ ...k, functionName: "commitmentOf", args: [r, me.address] }),
          client.readContract({ ...k, functionName: "revealedBid", args: [r, me.address] }),
        ]);

        // an offer: sealed in the commit window, opened once the round is due
        const bid = hit(bids, b.name, r);
        const bidKey = `${circle}-${r}-${me.address}`.toLowerCase();
        if (bid && commitment === zeroHash && v.now >= v.due - v.rules.commitWindow && v.now < v.due) {
          const salt = toHex(randomBytes(32));
          const sealed = keccak256(
            encodeAbiParameters(parseAbiParameters("uint256, address, uint32, address, uint16, bytes32"), [
              BigInt(deployment.chainId),
              circle,
              r,
              me.address,
              bid.bps,
              salt,
            ]),
          );
          // kept before sending, so a restarted play can still open it
          f.bids[bidKey] = { bps: bid.bps, salt };
          saveCrew(f);
          await send(me, { ...k, functionName: "commitBid", args: [r, sealed] });
          log(`${tag} sealed an offer for round ${r} (${bid.bps / 100}%, hidden until the due time)`);
        }
        const kept = f.bids[bidKey];
        const opening = v.now >= v.due && v.now <= v.due + v.rules.revealWindow && v.now < v.due + v.rules.grace;
        if (kept && commitment !== zeroHash && !revealed && opening) {
          await send(me, { ...k, functionName: "revealBid", args: [r, kept.bps, kept.salt] });
          log(`${tag} opened their offer: ${kept.bps / 100}% of the pot`);
        }

        // this round's payment (a defaulted member is past paying)
        const late = hit(lates, b.name, r);
        if (!paid && standing !== 3 && !hit(misses, b.name, r) && (!late || v.now > v.due) && v.now < v.due + v.rules.grace) {
          const [pay] = await client.readContract({ ...k, functionName: "amountDue", args: [me.address, r] });
          if (pay > 0n) await ensureFunds(me, circle, pay);
          await send(me, { ...k, functionName: "contribute", args: [r] });
          log(`${tag} paid ${money(pay)} for round ${r}${v.now > v.due ? c.yellow(", late") : ""}`);
        }

        if (hit(catchUps, b.name, r) && arrears > 0n) {
          await ensureFunds(me, circle, arrears);
          await send(me, { ...k, functionName: "payArrears" });
          log(`${tag} caught up ${money(arrears)}`);
        }
      } catch (e) {
        // a phone (or the keeper) got there first, or the window moved: the next pass rereads
        const name = why(e);
        if (!["TooEarly", "TooLate", "AlreadyPaid", "WrongRound"].includes(name)) log(`${tag} ${c.red(name)}`);
      }
    }

    if (close && v.now >= v.due + v.rules.grace) {
      try {
        const hash = await send(acct(mine[0]), { ...k, functionName: "closeRound", args: [r] });
        const to = await client.readContract({ ...k, functionName: "recipientOf", args: [r] });
        const named = f.bots.find((b) => same(acct(b).address, to));
        log(`handed out the round ${r} pot to ${named?.name ?? short(to)}  ${c.dim(explorerTx(hash))}`);
      } catch (e) {
        const name = why(e);
        if (!["TooEarly", "WrongRound", "WrongState"].includes(name)) log(c.red(`closing round ${r}: ${name}`));
      }
    }
    await sleep(2_000);
  }
}

// ---------------------------------------------------------------- status

async function status(circleArg: string, flags: Map<string, string[]>) {
  if (!isAddress(circleArg)) throw new Error(`${circleArg} isn't a circle address`);
  const v = await view(getAddress(circleArg));
  const k = { address: v.circle, abi: circleAbi } as const;
  const names = new Map(loadCrew().bots.map((b) => [acct(b).address.toLowerCase(), b.name]));
  for (const pair of flags.get("name") ?? []) {
    const [name, address] = pair.split("=", 2);
    if (address && isAddress(address)) names.set(address.toLowerCase(), name);
  }
  const r = v.rules;
  console.log(`${c.bold(v.circle)}  ${phase(v)}`);
  console.log(
    c.dim(
      `  ${money(r.contribution)} a round, ${r.memberCount} members, every ${r.period} s · offers up to ${r.maxBidBps / 100}% · deposits ${r.yieldOn ? "earning" : "idle"}`,
    ),
  );
  const STANDING = ["", "good", "behind", "defaulted"];
  for (let seat = 0; seat < v.members.length; seat++) {
    const a = v.members[seat];
    if (a === zeroAddress) {
      console.log(`  seat ${seat}  ${c.dim("open")}`);
      continue;
    }
    const [[standing, received, arrears], paid, [stage]] = await Promise.all([
      client.readContract({ ...k, functionName: "standingOf", args: [a] }),
      v.round > 0 ? client.readContract({ ...k, functionName: "paidRound", args: [v.round, a] }) : Promise.resolve(false),
      client.readContract({ ...k, functionName: "placeOf", args: [a] }),
    ]);
    const who = names.get(a.toLowerCase()) ?? short(a);
    const bits = [
      STANDING[standing] ?? "",
      v.state === "active" ? (paid ? c.green("paid") : "not paid") : "",
      received ? "has had the pot" : "",
      arrears > 0n ? c.yellow(`owes ${money(arrears)}`) : "",
    ].filter(Boolean);
    console.log(`  seat ${seat}  ${who.padEnd(10)} ${c.dim(a)}  ${(STAGES[stage] ?? "").padEnd(8)} ${bits.join(" · ")}`);
  }
}

// ------------------------------------------------------------------ money

function parsePayee(s: string): Address {
  const t = s.trim();
  if (isAddress(t)) return getAddress(t);
  const m = t.match(/\/p\/(0x[0-9a-fA-F]{40})/);
  if (m && isAddress(m[1])) return getAddress(m[1]);
  throw new Error(`${s} isn't an address or a Kitty pay link`);
}

async function sendMoney(toArg: string, dollars: string, from: string | undefined, cashOut: boolean) {
  const to = parsePayee(toArg);
  const amount = usd(dollars);
  const f = loadCrew();
  const bot = from ? findBot(f, from) : (f.bots[0] ?? newBot(f));
  const me = acct(bot);
  await ensureGas(me.address);
  if ((await ausdOf(me.address)) < amount) await faucet(me, log);
  let hash: Hex;
  let started: number;
  if (!cashOut) {
    started = Date.now();
    hash = await send(me, { address: deployment.ausd, abi: erc20Abi, functionName: "transfer", args: [to, amount] });
  } else {
    // FR-SND-02/03: whitelisted once, a bounded allowance, then the pair delivers straight to the recipient
    const approved = await client.readContract({ address: AGORA.pair, abi: pairAbi, functionName: "hasRole", args: ["APPROVED_SWAPPER", me.address] });
    if (!approved) await send(me, { address: AGORA.whitelister, abi: whitelisterAbi, functionName: "setApprovedSwapper", args: [me.address] });
    const allowance = await client.readContract({ address: deployment.ausd, abi: erc20Abi, functionName: "allowance", args: [me.address, AGORA.pair] });
    if (allowance < amount) await send(me, { address: deployment.ausd, abi: erc20Abi, functionName: "approve", args: [AGORA.pair, amount] });
    const path = [deployment.ausd, AGORA.ctk] as const;
    const [, out] = await client.readContract({ address: AGORA.pair, abi: pairAbi, functionName: "getAmountsOut", args: [amount, [...path]] });
    const deadline = BigInt(Number((await client.getBlock()).timestamp) + 300);
    started = Date.now();
    hash = await send(me, {
      address: AGORA.pair,
      abi: pairAbi,
      functionName: "swapExactTokensForTokens",
      args: [amount, out, [...path], to, deadline],
    });
  }
  const s = ((Date.now() - started) / 1000).toFixed(1);
  log(`${c.pink(bot.name)} sent ${short(to)} ${money(amount)} ${cashOut ? "ready to cash out, through Agora's Instant Settlement" : "as dollars"}, confirmed in ${s} s`);
  log(c.dim(explorerTx(hash)));
}

async function fundYield(dollars: string) {
  const amount = usd(dollars);
  if (amount > 10_000_000000n) throw new Error("one faucet claim is $10,000; fund up to that at a time");
  const f = loadCrew();
  const bot = f.bots[0] ?? newBot(f);
  const me = acct(bot);
  await ensureGas(me.address);
  if ((await ausdOf(me.address)) < amount) await faucet(me, log);
  const vault = { address: deployment.kittyEarnVault, abi: earnVaultAbi } as const;
  const allowance = await client.readContract({ address: deployment.ausd, abi: erc20Abi, functionName: "allowance", args: [me.address, vault.address] });
  if (allowance < amount) await send(me, { address: deployment.ausd, abi: erc20Abi, functionName: "approve", args: [vault.address, amount] });
  await send(me, { ...vault, functionName: "fundReserve", args: [amount] });
  const reserve = await client.readContract({ ...vault, functionName: "reserve" });
  log(`the simulated-yield reserve now holds ${money(reserve)}`);
}

// ------------------------------------------------------------------- main

async function list() {
  const f = loadCrew();
  if (f.bots.length === 0) return console.log("No crew yet: pnpm demo:crew init 3");
  for (const b of f.bots) {
    const who = acct(b).address;
    const [gas, dollars, terms] = await Promise.all([client.getBalance({ address: who }), ausdOf(who), termsOf(who, 1_000000n)]);
    console.log(
      `  ${c.pink(b.name.padEnd(8))} ${who}  ${money(dollars).padStart(11)}  ${mon(gas)}  ${STAGES[terms.stage]}, ${terms.open} of ${terms.maxOpen} circles open`,
    );
  }
}

const USAGE = `pnpm demo:crew <command>
  init [n]                         make n crew members (default 3)
  list                             balances, standing and open circles
  fund [names…]                    gas and test dollars for everyone (or the names given)
  join '<invite link>'… [--as N]   take the seat each link is for
  create --names "A,B,C" [--amount 5] [--every 60|120|600] [--start 3] [--offers 30] [--yield] [--title T]
  play <circle> [--miss N:r] [--late N:r] [--bid N:r:pct] [--catch-up N:r] [--close] [--no-collect]
  status <circle> [--name Host=0x…]
  send <address|pay link> <dollars> [--from N] [--cash-out]
  fund-yield <dollars>`;

const { _: args, flags } = parseArgs(process.argv.slice(2));
const [cmd, ...rest] = args;
try {
  switch (cmd) {
    case "init": {
      const f = loadCrew();
      const n = Number(rest[0] ?? 3);
      while (f.bots.length < n) newBot(f);
      console.log(`${f.bots.length} crew members in services/.crew.json`);
      await list();
      break;
    }
    case "list":
      await list();
      break;
    case "fund": {
      const f = loadCrew();
      const who = rest.length ? rest.map((n) => findBot(f, n)) : f.bots;
      for (const b of who) {
        await ensureGas(acct(b).address);
        if ((await ausdOf(acct(b).address)) < 1_000_000000n) await faucet(acct(b), log);
        log(`${c.pink(b.name)} is ready`);
      }
      await list();
      break;
    }
    case "join":
      if (rest.length === 0) throw new Error("give the invite link, in quotes");
      for (const link of rest) await join(link, flags.get("as")?.[0]);
      break;
    case "create":
      await create(flags);
      break;
    case "play":
      await play(rest[0] ?? "", flags);
      break;
    case "status":
      await status(rest[0] ?? "", flags);
      break;
    case "send":
      if (rest.length < 2) throw new Error("send <address or pay link> <dollars>");
      await sendMoney(rest[0], rest[1], flags.get("from")?.[0], flags.has("cash-out"));
      break;
    case "fund-yield":
      await fundYield(rest[0] ?? "1000");
      break;
    default:
      console.log(USAGE);
  }
} catch (e) {
  console.error(c.red(why(e)));
  process.exitCode = 1;
}
