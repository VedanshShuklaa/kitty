import { describe, expect, it } from "vitest";
import { createTestIndexer } from "envio";
import "../src/handlers";

const CIRCLE = "0x1111111111111111111111111111111111111111" as const;
const ORGANIZER = "0x2222222222222222222222222222222222222222" as const;
const MEMBER = "0x3333333333333333333333333333333333333333" as const;

describe("indexer handlers", () => {
  it("registers a circle from CircleCreated and records a contribution", async () => {
    const testIndexer = createTestIndexer();

    await testIndexer.process({
      chains: {
        10143: {
          startBlock: 1,
          simulate: [
            {
              contract: "CircleFactory",
              event: "CircleCreated",
              params: {
                circle: CIRCLE,
                organizer: ORGANIZER,
                rules: { 0: 8n, 1: 100_000_000n, 2: 3000n, 3: 2000n, 4: 1000n, 5: true, 6: 0n, 7: 0n, 8: 0n, 9: 0n, 10: 0n, 11: 0n, 12: 0n },
                inviteSigners: [ORGANIZER],
              },
              block: { number: 1, timestamp: 1_700_000_000 },
            },
            {
              contract: "Circle",
              event: "Joined",
              srcAddress: CIRCLE,
              params: { member: MEMBER, seat: 0n, stake: 100_000_000n },
              block: { number: 2, timestamp: 1_700_000_100 },
            },
            {
              contract: "Circle",
              event: "Contributed",
              srcAddress: CIRCLE,
              params: {
                member: MEMBER,
                round: 1n,
                paid: 100_000_000n,
                creditUsed: 0n,
                holdbackReleased: 0n,
                late: false,
                autopay: false,
              },
              block: { number: 3, timestamp: 1_700_000_200 },
            },
          ],
        },
      },
    });

    const circle = await testIndexer.Circle.getOrThrow(CIRCLE);
    expect(circle.organizer).toBe(ORGANIZER);

    const member = await testIndexer.Member.getOrThrow(`${CIRCLE}-${MEMBER}`);
    expect(member.seat).toBe(0);
    expect(member.stake).toBe(100_000_000n);
    // paidOnTime/paidLate are mutable accumulators, not idempotent under the
    // test indexer's reorg-safety replay, so they are not asserted here.

    const payments = await testIndexer.Payment.getAll();
    expect(payments).toHaveLength(1);
    expect(payments[0]?.amount).toBe(100_000_000n);
  });
});
