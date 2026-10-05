import { indexer, type EvmOnEventContext } from "envio";

import { aprBps } from "../lib/rate";

// The yield line on a circle (SRS 15.7) shows simulated testnet yield beside
// the real earnAUSD rate on mainnet. Both come in as share prices; the rate is
// measured over a trailing window of one to two weeks.

type Ctx = EvmOnEventContext;

const WEEK = 7n * 86_400n;
const ONE = 1_000000n;

async function point(context: Ctx, chainId: number, source: string, id: string, price: bigint, at: bigint, block: number) {
  context.YieldPoint.set({ id: `${chainId}-${id}`, chainId, source, sharePrice: price, at, block });
  const r = await context.EarnRate.get(source);
  if (!r) {
    context.EarnRate.set({
      id: source,
      chainId,
      sharePrice: price,
      at,
      anchorPrice: price,
      anchorAt: at,
      pendingPrice: price,
      pendingAt: at,
      aprBps: 0,
      points: 1,
    });
    return;
  }
  // a week after the pending point, it becomes the anchor and this point the
  // new pending one, so the anchor is always one to two weeks old
  const shift = at - r.pendingAt >= WEEK;
  const anchorPrice = shift ? r.pendingPrice : r.anchorPrice;
  const anchorAt = shift ? r.pendingAt : r.anchorAt;
  context.EarnRate.set({
    ...r,
    sharePrice: price,
    at,
    anchorPrice,
    anchorAt,
    pendingPrice: shift ? price : r.pendingPrice,
    pendingAt: shift ? at : r.pendingAt,
    aprBps: aprBps(anchorPrice, price, at - anchorAt),
    points: r.points + 1,
  });
}

// Upshift's earnAUSD vault on mainnet: each deposit prices a share.
indexer.onEvent({ contract: "EarnAUSD", event: "Deposit" }, async ({ event, context }) => {
  const { amountIn, shares } = event.params;
  if (shares === 0n) return;
  await point(
    context,
    143,
    "earnAUSD",
    `${event.transaction.hash}-${event.logIndex}`,
    (amountIn * ONE) / shares,
    BigInt(event.block.timestamp),
    event.block.number,
  );
});

// Kitty's testnet stand-in, which accrues from a funded reserve at a set rate.
indexer.onEvent({ contract: "KittyEarnVault", event: "Accrued" }, async ({ event, context }) => {
  const { totalAssets, totalShares } = event.params;
  if (totalShares === 0n) return;
  await point(
    context,
    10143,
    "KittyEarnVault",
    `${event.transaction.hash}-${event.logIndex}`,
    (totalAssets * ONE) / totalShares,
    BigInt(event.block.timestamp),
    event.block.number,
  );
});
