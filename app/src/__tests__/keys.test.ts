import { bidSalt, rosterWrapKey } from "../account/keys";

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
