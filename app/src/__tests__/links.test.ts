import { privateKeyToAccount } from "viem/accounts";

import { parseInvite } from "../links";
import { parsePayee, parseSendLink } from "../money";

jest.mock("../config", () => ({
  siteUrl: "https://kitty-circle.vercel.app",
  contracts: {
    ausd: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
    ctk: "0x0000000000000000000000000000000000000c7c",
    pair: "0x1Aa8000000000000000000000000000000000e0a",
    whitelister: "0x7c10000000000000000000000000000000006BD5",
    circleFactory: "0x945B6959622DB5d8a7F8fBe8dc58BD675e023C10",
    kittyRecord: "0x1917a3812c61FC5FB6CeE680224BC485E1EE4b7A",
    kittyCats: "0xBaCf87e4C7C6C7ED9E1Be5f3f6b6482D3Aa1007B",
  },
}));

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ADDR = privateKeyToAccount(KEY).address;
const CIRCLE = "0x1111111111111111111111111111111111111111";

describe("crafted links", () => {
  it("a send link whose key isn't a valid key is ignored, not a crash", () => {
    for (const k of ["0x" + "0".repeat(64), "0x" + "f".repeat(64)]) {
      expect(parseSendLink(`https://kitty-circle.vercel.app/s/${ADDR}#k=${k}`)).toBeNull();
    }
  });

  it("refuses pay links to addresses money would vanish into", () => {
    expect(parsePayee("0x0000000000000000000000000000000000000000")).toBeNull();
    expect(parsePayee("https://kitty-circle.vercel.app/p/0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC#n=Ama")).toBeNull();
    expect(parsePayee(`https://kitty-circle.vercel.app/p/${ADDR}#n=Ama`)?.address).toBe(ADDR);
  });
});

describe("intent hand-over (query instead of fragment)", () => {
  it("reads invites, send links and pay links either way", () => {
    const tail = `k=${KEY}&m=${encodeURIComponent(JSON.stringify({ t: "Book club", n: ["Ada", "Kofi"] }))}`;
    for (const sep of ["#", "?"]) {
      expect(parseInvite(`https://kitty-circle.vercel.app/j/${CIRCLE}/1${sep}${tail}`)?.title).toBe("Book club");
      expect(parseSendLink(`https://kitty-circle.vercel.app/s/${ADDR}${sep}k=${KEY}&n=Ada`)?.address).toBe(ADDR);
      expect(parsePayee(`https://kitty-circle.vercel.app/p/${ADDR}${sep}n=Ama`)?.name).toBe("Ama");
    }
  });
});

describe("links that picked up someone else's query string", () => {
  it("still read the part after the #", () => {
    const tail = `k=${KEY}&m=${encodeURIComponent(JSON.stringify({ t: "Book club", n: ["Ada", "Kofi"] }))}`;
    expect(parseInvite(`https://kitty-circle.vercel.app/j/${CIRCLE}/1?utm=x#${tail}`)?.title).toBe("Book club");
    expect(parseSendLink(`https://kitty-circle.vercel.app/s/${ADDR}?utm=x#k=${KEY}&n=Ada`)?.address).toBe(ADDR);
    expect(parsePayee(`https://kitty-circle.vercel.app/p/${ADDR}?utm=x#n=Ama`)?.name).toBe("Ama");
  });
});
