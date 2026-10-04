// Live check of SRS 7.11 end to end: a member finishes three 1-minute
// practice circles, each with someone new, which makes them Steady in the
// indexer; /api/tier then signs their smaller deposit, and they join a circle
// that allows it with 85% of the usual deposit. Needs the indexer synced to
// the current factory. Run with:
//   pnpm exec jest --config e2e/jest.config.js e2e/tier.live.ts
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

jest.mock("../src/config", () => {
  const d = JSON.parse(
    require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "..", "deployments", "10143.json"), "utf8"),
  );
  return {
    rpId: "kitty-circle.vercel.app",
    siteUrl: "https://kitty-circle.vercel.app",
    apiUrl: "https://kitty-circle.vercel.app",
    indexerUrl: "https://kitty-circle.vercel.app/api/graphql",
    contracts: {
      chainId: d.chainId,
      circleFactory: d.circleFactory,
      ausd: d.ausd,
      ausdFaucet: "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C",
    },
  };
});
jest.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: async () => {} }));
jest.mock("@react-native-async-storage/async-storage", () => {
  const m = new Map<string, string>();
  return { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v), removeItem: async (k: string) => void m.delete(k) };
});

import { parseAbi } from "viem";

import { client, closeRound, contribute, createCircle, inviteKeyFor, joinCircle, loadSnapshot, withdraw, type CircleDraft, type Signer } from "../src/kitty";
import { standingOf, usable } from "../src/standing";

jest.setTimeout(45 * 60_000);

const signer = (): Signer => {
  const account = privateKeyToAccount(generatePrivateKey());
  return { address: account.address, account, prf: crypto.getRandomValues(new Uint8Array(32)) };
};

const ONE = 1_000000n;
const draft = (title: string, tierDiscountOn: boolean): CircleDraft => ({
  title,
  names: ["Ama", "Kofi"],
  contribution: ONE,
  cadence: "practice1",
  // the faucet's shared cooldown can hold a join up for a minute or more
  startIn: 240,
  maxBidBps: 0,
  yieldOn: false,
  tierDiscountOn,
});

async function until(circle: `0x${string}`, t: number) {
  for (;;) {
    const now = (await loadSnapshot(circle, null)).chainNow;
    if (now >= t) return;
    await new Promise((r) => setTimeout(r, Math.min(5_000, (t - now) * 1000 + 500)));
  }
}

/** One two-member practice circle, run to the end with both paying on time. */
async function practice(org: Signer, mem: Signer, title: string) {
  const circle = await createCircle(org, draft(title, false), () => {});
  await joinCircle(mem, { circle, seat: 1, key: inviteKeyFor(org, circle, 1), title, names: ["Ama", "Kofi"], roster: null }, () => {});
  for (const round of [1, 2]) {
    const s = await loadSnapshot(circle, org.address);
    await contribute(org, circle, round, s.me!.pay);
    await contribute(mem, circle, round, (await loadSnapshot(circle, mem.address)).me!.pay);
    await until(circle, s.due + Number(s.rules.grace));
    await closeRound(mem, circle, round);
  }
  for (const who of [org, mem]) await withdraw(who, circle);
  console.log(`${title} finished`);
}

it("earns Steady from three circles with new people, then joins with the smaller deposit", async () => {
  const ama = signer();
  console.log("member", ama.address);
  for (const i of [1, 2, 3]) await practice(ama, signer(), `Practice ${i}`);

  // the indexer needs a moment to see the last Completed
  let standing = await standingOf(ama.address);
  for (let i = 0; i < 40 && standing.tier !== "Steady"; i++) {
    await new Promise((r) => setTimeout(r, 15_000));
    standing = await standingOf(ama.address);
  }
  expect(standing.tier).toBe("Steady");
  expect(standing.tierBps).toBe(8_500);
  const attestation = usable(standing, Math.floor(Date.now() / 1000));
  expect(attestation).not.toBeNull();

  const org = signer();
  const circle = await createCircle(org, draft("Discounts on", true), () => {});
  expect((await loadSnapshot(circle, null)).rules.tierDiscountOn).toBe(true);
  await joinCircle(ama, { circle, seat: 1, key: inviteKeyFor(org, circle, 1), title: "Discounts on", names: ["Ama", "Kofi"], roster: null }, () => {}, attestation);

  const vault = await client.readContract({ address: circle, abi: parseAbi(["function vault() view returns (address)"]), functionName: "vault" });
  const stake = await client.readContract({
    address: vault,
    abi: parseAbi(["function balanceOf(address circle, address member, uint8 kind) view returns (uint256)"]),
    functionName: "balanceOf",
    args: [circle, ama.address, 0],
  });
  expect(stake).toBe((ONE * 8_500n) / 10_000n);
  console.log("joined with", stake, "of", ONE);
});
