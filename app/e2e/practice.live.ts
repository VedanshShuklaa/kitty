// Live check of 1-minute practice circles on the current testnet factory: a
// full two-member circle from creation to collection, and a circle nobody
// joins being called off with the organizer's deposit returned. Run with:
//   pnpm exec jest --config e2e/jest.config.js e2e/practice.live.ts
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

jest.mock("../src/config", () => {
  const d = JSON.parse(
    require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "..", "deployments", "10143.json"), "utf8"),
  );
  return {
    rpId: "kitty-circle.vercel.app",
    siteUrl: "https://kitty-circle.vercel.app",
    apiUrl: "https://kitty-circle.vercel.app",
    contracts: {
      chainId: d.chainId,
      circleFactory: d.circleFactory,
      ausd: d.ausd,
      kittyRecord: d.kittyRecord,
      kittyCats: d.kittyCats,
      ausdFaucet: "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C",
    },
  };
});
jest.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: async () => {} }));
jest.mock("@react-native-async-storage/async-storage", () => {
  const m = new Map<string, string>();
  return { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v), removeItem: async (k: string) => void m.delete(k) };
});

import { adoptCat, balanceOf, client, closeRound, contribute, createCircle, depositOf, inviteKeyFor, joinCircle, loadSnapshot, readStanding, withdraw, type Signer } from "../src/kitty";
import { catsAbi } from "../src/abi";
import { contracts } from "../src/config";
import { tidyCircle } from "../src/tidy";

jest.setTimeout(10 * 60_000);

const signer = (): Signer => {
  const account = privateKeyToAccount(generatePrivateKey());
  return { address: account.address, account, prf: crypto.getRandomValues(new Uint8Array(32)) };
};

const ONE = 1_000000n;

/** Waits until the chain's clock (read through the circle) reaches `t`. */
async function until(circle: `0x${string}`, t: number) {
  for (;;) {
    const now = (await loadSnapshot(circle, null)).chainNow;
    if (now >= t) return;
    await new Promise((r) => setTimeout(r, Math.min(5_000, (t - now) * 1000 + 500)));
  }
}

it("runs a two-member circle on 1-minute rounds, start to finish", async () => {
  const org = signer();
  const mem = signer();
  const names = ["Ama", "Kofi"];
  const circle = await createCircle(
    org,
    { title: "Practice", names, contribution: ONE, cadence: "practice1", startIn: 180, maxBidBps: 3_000, yieldOn: true },
    () => {},
  );
  await joinCircle(mem, { circle, seat: 1, key: inviteKeyFor(org, circle, 1), title: "Practice", names, roster: null }, () => {});
  // Feed the Kitty: newcomers join Shy, open one circle each, and offer only from the second half
  const placed = await loadSnapshot(circle, mem.address);
  expect(placed.members.map((m) => [m.stage, m.offerFrom])).toEqual([["Shy", 1], ["Shy", 1]]);
  expect((await readStanding(mem.address)).open).toBe(1);

  for (const round of [1, 2]) {
    let s = await loadSnapshot(circle, org.address);
    expect(s.state).toBe("active");
    expect(s.round).toBe(round);
    await contribute(org, circle, round, s.me!.pay);
    const m = await loadSnapshot(circle, mem.address);
    await contribute(mem, circle, round, m.me!.pay);
    s = await loadSnapshot(circle, org.address);
    await until(circle, s.due + Number(s.rules.grace));
    await closeRound(mem, circle, round);
    console.log(`round ${round} closed`);
  }

  expect((await loadSnapshot(circle, org.address)).state).toBe("completed");
  for (const who of [org, mem]) {
    const s = await loadSnapshot(circle, who.address);
    expect(s.me!.withdrawable).toBeGreaterThan(0n);
    await withdraw(who, circle);
  }
  for (const who of [org, mem]) expect((await loadSnapshot(circle, who.address)).me!.withdrawable).toBe(0n);
  // withdrawing wrote the finished circle into the record: closed, still Shy
  // (40 from one Shy other), every round on time
  const after = await readStanding(mem.address);
  expect(after).toMatchObject({ stage: "Shy", points: 40, onTimeBps: 10_000, people: 1, open: 0, debt: 0n });
  // her cat: adopted once, as a sponsored action
  expect(await adoptCat(mem)).toBe(true);
  expect(await adoptCat(mem)).toBe(false);
  const [, adopted] = await client.readContract({ address: contracts.kittyCats, abi: catsAbi, functionName: "catOf", args: [mem.address] });
  expect(adopted).toBe(true);
});

it("calls off a circle nobody joined and returns the organizer's deposit", async () => {
  const org = signer();
  const circle = await createCircle(
    org,
    { title: "Lonely", names: ["Ama", "Kofi"], contribution: ONE, cadence: "practice1", startIn: 60, maxBidBps: 3_000, yieldOn: false },
    () => {},
  );
  let s = await loadSnapshot(circle, org.address);
  expect(s.state).toBe("forming");
  expect(await tidyCircle(org, s)).toBeNull(); // joining still open
  await until(circle, Number(s.rules.joinDeadline));
  const before = await balanceOf(org.address);
  s = await loadSnapshot(circle, org.address);
  expect(await tidyCircle(org, s)).toEqual({ calledOff: true, returned: depositOf(s.rules) });
  expect(await balanceOf(org.address)).toBe(before + depositOf(s.rules));
  expect((await loadSnapshot(circle, org.address)).state).toBe("cancelled");
});
