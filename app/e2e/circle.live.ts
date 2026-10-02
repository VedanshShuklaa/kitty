// Live end-to-end check against Monad testnet, using the app's own code
// paths with throwaway keys instead of passkeys. Spends real test MON from
// the sponsor, so it is not part of the default suite. Run with:
//   pnpm exec jest --config e2e/jest.config.js
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

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
      ausdFaucet: "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C",
    },
  };
});

import { contribute, createCircle, joinCircle, loadSnapshot, type Signer } from "../src/kitty";
import { plan } from "../src/phase";

jest.setTimeout(10 * 60_000);

const signer = (): Signer => {
  const account = privateKeyToAccount(generatePrivateKey());
  return { address: account.address, account, prf: crypto.getRandomValues(new Uint8Array(32)) };
};

it("creates a circle, joins it by invite, and both members pay round 1", async () => {
  const org = signer();
  const mem = signer();
  const steps: string[] = [];
  let keys: (Hex | null)[] = [];

  const circle = await createCircle(
    org,
    { title: "E2E", names: ["Ama", "Kofi"], contribution: 1_000000n, cadence: "demo", startIn: 900, maxBidBps: 3_000, yieldOn: true },
    (id) => steps.push(id),
    async (_c, k) => {
      keys = k;
    },
  );
  console.log("circle", circle);
  expect(steps).toEqual(["topup", "dollars", "create", "approve", "deposit"]);

  let s = await loadSnapshot(circle, org.address);
  expect(s.state).toBe("forming");
  expect(s.members[0].address).toBe(org.address);

  await joinCircle(mem, { circle, seat: 1, key: keys[1] as Hex, title: "E2E", names: ["Ama", "Kofi"] }, () => {});

  s = await loadSnapshot(circle, mem.address);
  expect(s.state).toBe("active");
  expect(s.round).toBe(1);
  expect(s.me?.seat).toBe(1);
  // the yield vault answers; nothing is invested until round 1 closes
  expect(s.yield).toEqual({ earned: 0n });
  expect(plan(s, s.chainNow).actions[0]).toMatchObject({ kind: "pay", amount: 1_000000n });

  await contribute(mem, circle, 1, s.me!.pay);
  await contribute(org, circle, 1, 1_000000n);

  s = await loadSnapshot(circle, org.address);
  expect(s.members.map((m) => m.paid)).toEqual([true, true]);
  expect(s.pot).toBe(2_000000n);
  expect(plan(s, s.chainNow).headline).toBe("Everyone has paid");
});
