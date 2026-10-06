import { afterEach, describe, expect, it, vi } from "vitest";
import { jobFor, openCircles, type CircleView } from "../src/keeper/index.js";

const CIRCLE = "0x1111111111111111111111111111111111111111" as const;
const FACTORY = "0xAbCdEf0000000000000000000000000000000001" as const;

const active = (over: Partial<CircleView> = {}): CircleView => ({
  address: CIRCLE,
  state: 1,
  round: 2,
  due: 1_000n,
  grace: 20,
  joinDeadline: 500n,
  ...over,
});

describe("jobFor", () => {
  it("closes a round only once its grace has passed, as closeRound requires", () => {
    expect(jobFor(active(), 1_019n)).toBeNull();
    expect(jobFor(active(), 1_020n)).toEqual({ kind: "close", circle: CIRCLE, round: 2 });
  });

  it("calls off a forming circle from its join deadline on", () => {
    const forming = active({ state: 0, round: 0, due: 2_000n });
    expect(jobFor(forming, 499n)).toBeNull();
    expect(jobFor(forming, 500n)).toEqual({ kind: "cancel", circle: CIRCLE });
  });

  it("leaves completed and cancelled circles alone", () => {
    expect(jobFor(active({ state: 2 }), 10_000n)).toBeNull();
    expect(jobFor(active({ state: 3 }), 10_000n)).toBeNull();
  });
});

describe("openCircles", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks the indexer for one factory's open circles, lowercased", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: { Circle: [{ id: CIRCLE }] } })));
    vi.stubGlobal("fetch", fetch);
    await expect(openCircles("https://indexer.test/graphql", FACTORY)).resolves.toEqual([CIRCLE]);
    const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.variables).toEqual({ f: FACTORY.toLowerCase() });
  });

  it("throws the indexer's error instead of returning nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: "field not found" }] }))));
    await expect(openCircles("https://indexer.test/graphql", FACTORY)).rejects.toThrow("field not found");
  });
});
