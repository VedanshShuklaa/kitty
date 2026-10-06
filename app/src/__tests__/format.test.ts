import { parseMoney } from "../format";

describe("parseMoney with a comma decimal pad", () => {
  it("reads a trailing comma and one or two digits as the decimal part", () => {
    expect(parseMoney("2,5")).toBe(2_500000n);
    expect(parseMoney("0,50")).toBe(500000n);
    expect(parseMoney("12,05")).toBe(12_050000n);
    expect(parseMoney("$7,5")).toBe(7_500000n);
  });

  it("still treats other commas as thousands separators", () => {
    expect(parseMoney("1,200")).toBe(1_200_000000n);
    expect(parseMoney("1,200.50")).toBe(1_200_500000n);
    expect(parseMoney("1,200,000")).toBe(1_200_000_000000n);
    expect(parseMoney("1,200,50")).toBe(1_200_500000n);
  });

  it("reads dot-grouped comma-decimal amounts", () => {
    expect(parseMoney("1.200,50")).toBe(1_200_500000n);
    expect(parseMoney("1.5,50")).toBeNull();
  });

  it("keeps dot decimals and rejects junk", () => {
    expect(parseMoney("12.5")).toBe(12_500000n);
    expect(parseMoney("2,555")).toBe(2_555_000000n);
    expect(parseMoney("12.345")).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("ten")).toBeNull();
  });
});
