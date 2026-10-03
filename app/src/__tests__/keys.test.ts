import { bytesToHex, hexToBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import vectors from "../../../test-vectors/crypto.json";
import {
  bidSalt,
  inviteKey,
  profileId,
  profileKey,
  pushId,
  rosterKey,
  rosterWrapKey,
  sendLinkKey,
} from "../account/keys";

const prf = new Uint8Array(32).fill(7);
const circle = "0x1111111111111111111111111111111111111111" as const;

describe("account/keys", () => {
  it("derives a 32-byte bid salt", () => {
    const salt = bidSalt(prf, 10143n, circle, 2);
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(32);
  });

  it("is deterministic for the same inputs", () => {
    expect(bidSalt(prf, 10143n, circle, 2)).toEqual(bidSalt(prf, 10143n, circle, 2));
  });

  it("changes with the round, so two rounds never share a bid salt", () => {
    expect(bidSalt(prf, 10143n, circle, 2)).not.toEqual(bidSalt(prf, 10143n, circle, 3));
  });

  it("derives a roster-wrap key domain-separated from the bid salt", () => {
    const wrapKey = rosterWrapKey(prf);
    expect(wrapKey.length).toBe(32);
    expect(wrapKey).not.toEqual(bidSalt(prf, 10143n, circle, 2));
  });
});

// FR-KEY-01: every namespace in SRS 15.5 against test-vectors/crypto.json,
// whose values were computed by an independent implementation.
describe("one passkey, many keys: vectors", () => {
  const v = vectors.namespaces;
  const root = hexToBytes(v.prfOutput as Hex);
  const chain = BigInt(v.chainId);
  const c = v.circle as Hex;

  it("roster", () => expect(bytesToHex(rosterKey(root, chain, c))).toBe(v.roster.expected));
  it("profile and its lookup id", () => {
    expect(bytesToHex(profileKey(root))).toBe(v.profile.expected);
    expect(profileId(root)).toBe(v.profileId.expected);
  });
  it("push pseudonym", () => expect(pushId(root, chain, c)).toBe(v.push.expected));

  it("invite key, and the signer address the circle checks", () => {
    const key = inviteKey(root, chain, c, v.invite.seat);
    expect(key).toBe(v.invite.privateKey);
    expect(privateKeyToAccount(key).address).toBe(v.invite.signerAddress);
  });

  it("send-link key", () => {
    const key = sendLinkKey(root, v.sendLink.n);
    expect(key).toBe(v.sendLink.privateKey);
    expect(privateKeyToAccount(key).address).toBe(v.sendLink.address);
  });

  it("keeps the earlier vectors stable", () => {
    expect(bytesToHex(bidSalt(root, chain, c, 2))).toBe(vectors.bidSalt.expected);
    expect(bytesToHex(rosterWrapKey(root))).toBe(vectors.rosterWrapKey.expected);
  });

  it("gives every seat, circle and namespace its own key", () => {
    const keys = new Set([
      inviteKey(root, chain, c, 1),
      inviteKey(root, chain, c, 2),
      inviteKey(root, chain, "0x2222222222222222222222222222222222222222", 1),
      inviteKey(root, 143n, c, 1),
      sendLinkKey(root, 0),
      sendLinkKey(root, 1),
      bytesToHex(rosterKey(root, chain, c)),
      bytesToHex(profileKey(root)),
    ]);
    expect(keys.size).toBe(8);
  });
});
