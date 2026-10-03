// Live end-to-end check of sending (SRS 15.3) and the passkey-derived storage
// (SRS 15.5) against Monad testnet, Agora's Instant Settlement pair and the
// deployed Kitty API, using the app's own code with throwaway keys. Run with:
//   pnpm exec jest --config e2e/jest.config.js e2e/money.live.ts
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
      ctk: "0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D",
      pair: "0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae",
      whitelister: "0x7c10F56d6f04a51376393a1C3670e966863F6BD5",
    },
  };
});

import { getTestDollars, type Signer } from "../src/kitty";
import { balances, claimLink, convert, createSendLink, isSwapper, parseSendLink, sendLinks, sendMoney } from "../src/money";
import { getProfileData, putProfile } from "../src/vault";

jest.setTimeout(10 * 60_000);

const signer = (): Signer => {
  const account = privateKeyToAccount(generatePrivateKey());
  return { address: account.address, account, prf: crypto.getRandomValues(new Uint8Array(32)) };
};

const ONE = 1_000000n;

it("sends dollars, sends ready to cash out, converts, and sends by link", async () => {
  const ama = signer();
  const kofi = signer();
  await getTestDollars(ama);
  const start = await balances(ama.address);
  expect(start.dollars).toBeGreaterThanOrEqual(5n * ONE);

  // FR-SND-01: dollars, one transfer
  const plain = await sendMoney(ama, kofi.address, ONE, "dollars", Date.now());
  console.log(`dollars settled in ${plain.ms} ms (${plain.afterSigning} ms after signing)`, plain.hash);
  expect((await balances(kofi.address)).dollars).toBe(ONE);

  // FR-SND-02/03: ready to cash out, through the pair with Kofi as the swap's `to`
  const cash = await sendMoney(ama, kofi.address, 2n * ONE, "cashOut", Date.now());
  console.log(`cash-out settled in ${cash.ms} ms`, cash.hash);
  expect(await isSwapper(ama.address)).toBe(true);
  expect((await balances(kofi.address)).cashOut).toBe(2n * ONE);

  // FR-SND-05: Kofi moves half back to dollars
  await convert(kofi, "dollars", ONE, Date.now());
  expect(await balances(kofi.address)).toEqual({ dollars: 2n * ONE, cashOut: ONE });

  // FR-SND-08: a link only Kofi's tap collects, re-derived from Ama's passkey
  const { url } = await createSendLink(ama, ONE, "Ama", Date.now());
  const link = parseSendLink(url);
  expect(link?.from).toBe("Ama");
  expect((await sendLinks(ama.prf)).map((l) => l.balance)).toEqual([ONE]);
  const claimed = await claimLink(kofi, link!.key, Date.now());
  expect(claimed.amount).toBe(ONE);
  expect((await balances(kofi.address)).dollars).toBe(3n * ONE);
  expect((await sendLinks(ama.prf)).map((l) => l.balance)).toEqual([0n]);
  await expect(claimLink(kofi, link!.key, Date.now())).rejects.toThrow("already");

  // a second link is taken back by the sender instead
  const back = await createSendLink(ama, ONE, "Ama", Date.now());
  expect((await sendLinks(ama.prf)).length).toBe(2);
  const before = (await balances(ama.address)).dollars;
  await claimLink(ama, parseSendLink(back.url)!.key, Date.now());
  expect((await balances(ama.address)).dollars).toBe(before + ONE);
});

it("stores the profile sealed and gets it back from the passkey alone (FR-RST-01)", async () => {
  const prf = crypto.getRandomValues(new Uint8Array(32));
  expect(await getProfileData(prf)).toBeNull();
  await putProfile(prf, { name: "Ẹniọlá", country: "NG" });
  expect(await getProfileData(prf)).toEqual({ name: "Ẹniọlá", country: "NG" });
  // another passkey reads nothing
  expect(await getProfileData(crypto.getRandomValues(new Uint8Array(32)))).toBeNull();
});
