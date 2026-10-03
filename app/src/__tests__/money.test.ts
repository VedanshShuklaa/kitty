import { privateKeyToAccount } from "viem/accounts";
import { getAddress, hexToBytes, type Address, type Hex } from "viem";

import vectors from "../../../test-vectors/crypto.json";

jest.mock("../config", () => ({
  rpId: "kitty-circle.vercel.app",
  siteUrl: "https://kitty-circle.vercel.app",
  apiUrl: "https://kitty-circle.vercel.app",
  indexerUrl: "https://kitty-circle.vercel.app/api/graphql",
  contracts: {
    chainId: 10143,
    circleFactory: "0x0000000000000000000000000000000000000001",
    ausd: "0x0000000000000000000000000000000000000002",
    ausdFaucet: "0x0000000000000000000000000000000000000003",
    ctk: "0x0000000000000000000000000000000000000004",
    pair: "0x0000000000000000000000000000000000000005",
    whitelister: "0x0000000000000000000000000000000000000006",
  },
}));
jest.mock("@react-native-async-storage/async-storage", () => ({ getItem: async () => null, setItem: async () => {} }));

import { sendLinkKey } from "../account/keys";
import { isSealed, open, openJson, seal, sealJson } from "../account/seal";
import { feedLine, moneyLine } from "../feed";
import { localEstimate } from "../fx";
import type { Activity, Transfer } from "../indexer";
import { fromCtk, parsePayee, parseSendLink, payLink, sendLinkUrl, toCtk } from "../money";
import { expired, promptFor } from "../policy";
import { routeFor } from "../route";

const ME = getAddress("0x00000000000000000000000000000000000000aa");
const AMA = getAddress("0xae68797ace1e16eed312529a94a650aa0a2eb165");
const who = (a: Address | null) => (a === null ? "Someone" : a.toLowerCase() === ME.toLowerCase() ? "You" : "Ama");

describe("pay links (FR-SND-01)", () => {
  it("round-trips an address and a name in any script", () => {
    const link = payLink(AMA, "Ẹniọlá A.");
    expect(link.startsWith("https://kitty-circle.vercel.app/p/0x")).toBe(true);
    expect(parsePayee(link)).toEqual({ address: AMA, name: "Ẹniọlá A." });
  });

  it("takes a bare address, rejects anything else", () => {
    expect(parsePayee(` ${AMA.toLowerCase()} `)).toEqual({ address: AMA, name: null });
    expect(parsePayee("https://kitty-circle.vercel.app/p/0x123")).toBeNull();
    expect(parsePayee("hello")).toBeNull();
  });
});

describe("send links (FR-SND-08)", () => {
  const v = vectors.namespaces.sendLink;
  const key = sendLinkKey(hexToBytes(vectors.namespaces.prfOutput as Hex), v.n);

  it("derives the vector's one-time key", () => {
    expect(key).toBe(v.privateKey);
    expect(privateKeyToAccount(key).address).toBe(v.address);
  });

  it("round-trips, and rejects a link whose key doesn't match its address", () => {
    const url = sendLinkUrl({ n: 0, key, address: v.address as Address }, "Kofi & Ama");
    expect(parseSendLink(url)).toEqual({ address: v.address, key, from: "Kofi & Ama" });
    expect(parseSendLink(url.replace(v.address.slice(2), AMA.slice(2)))).toBeNull();
    expect(parseSendLink(url.split("#")[0])).toBeNull();
  });

  it("keeps the key out of the part of the link a server sees", () => {
    const [path] = sendLinkUrl({ n: 0, key, address: v.address as Address }, "Kofi").split("#");
    expect(path).not.toContain(key.slice(2));
  });
});

describe("opening links", () => {
  it("sends each kind of Kitty link to its screen", () => {
    const send = sendLinkUrl({ n: 0, key: vectors.namespaces.sendLink.privateKey as Hex, address: vectors.namespaces.sendLink.address as Address }, "K");
    expect(routeFor(send)?.name).toBe("Claim");
    expect(routeFor(payLink(AMA, "Ama"))).toEqual({ name: "Send", params: { to: AMA, name: "Ama" } });
    expect(routeFor(`https://kitty-circle.vercel.app/j/0x1111111111111111111111111111111111111111/2#k=0x${"ab".repeat(32)}`)?.name).toBe("Join");
    expect(routeFor(AMA)).toBeNull();
    expect(routeFor("https://example.com")).toBeNull();
  });
});

describe("cash-out units", () => {
  it("maps 6-decimal dollars to the 18-decimal cash-out token and back", () => {
    expect(toCtk(1_000000n)).toBe(10n ** 18n);
    expect(fromCtk(toCtk(12_345678n))).toBe(12_345678n);
  });
});

describe("sealing (FR-RST-02)", () => {
  const key = new Uint8Array(32).fill(7);

  it("round-trips names in any script", () => {
    const roster = { title: "Àdùké's susu", names: ["Ama", "Ẹniọlá", "Wanjiru", "李"] };
    const s = sealJson(key, roster, "roster:0x11");
    expect(isSealed(s)).toBe(true);
    expect(openJson(key, s, "roster:0x11")).toEqual(roster);
  });

  it("fails on a wrong key, a changed byte, or another place", () => {
    const s = seal(key, new Uint8Array([1, 2, 3]), "profile");
    expect(() => open(new Uint8Array(32).fill(8), s, "profile")).toThrow();
    expect(() => open(key, s, "roster:0x11")).toThrow();
    const flipped = { ...s, ct: (s.ct.slice(0, -2) + (s.ct.endsWith("00") ? "01" : "00")) as Hex };
    expect(() => open(key, flipped, "profile")).toThrow();
  });

  it("uses a fresh nonce every time", () => {
    expect(seal(key, new Uint8Array([1]), "x").iv).not.toBe(seal(key, new Uint8Array([1]), "x").iv);
  });
});

describe("session policy (FR-SES-01/02)", () => {
  it("prompts for anything that sends money where the member chooses", () => {
    for (const a of ["pay", "bid", "close", "claim", "faucet", "withdraw"]) expect(promptFor(a)).toBe("none");
    for (const a of ["send", "convert", "join", "create", "sendLink", "takeBack"]) expect(promptFor(a)).toBe("fresh");
  });

  it("ends after 5 minutes away or 30 minutes idle", () => {
    const t = 1_000_000_000;
    expect(expired(t, t - 29 * 60_000, null)).toBe(false);
    expect(expired(t, t - 30 * 60_000, null)).toBe(true);
    expect(expired(t, t, t - 4 * 60_000)).toBe(false);
    expect(expired(t, t, t - 5 * 60_000)).toBe(true);
  });
});

describe("local estimates (FR-SND-07)", () => {
  const rates = { at: 0, rates: { GHS: 15.5, NGN: 1530.25, KES: 129 } };

  it("shows the member's currency, approximately", () => {
    expect(localEstimate(10_000000n, "GH", rates)).toBe("≈ GH₵155");
    expect(localEstimate(1_000000n, "GH", rates)).toBe("≈ GH₵15.5");
    expect(localEstimate(10_000000n, "NG", rates)).toBe("≈ ₦15,303");
  });

  it("says nothing without a rate or a currency", () => {
    expect(localEstimate(10_000000n, "US", rates)).toBeNull();
    expect(localEstimate(10_000000n, "GH", null)).toBeNull();
    expect(localEstimate(10_000000n, undefined, rates)).toBeNull();
  });
});

describe("feed lines", () => {
  const base: Activity = {
    id: "1",
    kind: "Paid",
    actor: AMA,
    round: 2,
    amount: 10_000000n,
    fromStake: null,
    fromPool: null,
    shortfall: null,
    bps: 0,
    at: 0,
    txHash: "0x",
  };

  it("says what happened in words", () => {
    expect(feedLine(base, who)).toBe("Ama paid $10 for round 2.");
    expect(feedLine({ ...base, bps: 1 }, who)).toBe("Ama paid $10 for round 2, after the due time.");
    expect(feedLine({ ...base, kind: "PotPaid", amount: 27_000000n, bps: 1_000 }, who)).toBe("Ama took the round 2 pot: $27, after giving up 10%.");
    expect(feedLine({ ...base, kind: "Unknown" }, who)).toBeNull();
  });

  it("says what covered a miss and whether the pot was whole (FR-DEF-04)", () => {
    const covered = { ...base, kind: "Covered", amount: null, fromStake: 7_000000n, fromPool: 3_000000n, shortfall: 0n };
    expect(feedLine(covered, who)).toBe("Ama missed round 2. Their deposit covered $7 and the pool $3, so the pot was paid in full.");
    expect(feedLine({ ...covered, fromPool: null, shortfall: 3_000000n }, who)).toBe(
      "Ama missed round 2. Their deposit covered $7, and the pot came up $3 short.",
    );
  });

  it("reads money from this account's side", () => {
    const t: Transfer = { id: "t", from: ME, to: AMA, token: "AUSD", amountUsd: 5_000000n, route: "Dollars", at: 0, txHash: "0x" };
    expect(moneyLine(t, ME, who)).toEqual({ text: "You sent Ama $5", sign: "out" });
    expect(moneyLine({ ...t, from: AMA, to: ME, route: "CashOut", token: "CTK" }, ME, who)).toEqual({ text: "Ama sent you $5, ready to cash out", sign: "in" });
    expect(moneyLine({ ...t, from: ME, to: ME, route: "Convert", token: "CTK" }, ME, who).sign).toBe("none");
  });
});
