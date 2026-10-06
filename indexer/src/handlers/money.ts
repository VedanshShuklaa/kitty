import { indexer, type EvmOnEventContext, type Transfer } from "envio";

import { AUSD, CTK, FAUCET, PAIR, VAULTS, ZERO } from "../lib/addresses";
import { bumpDay, logId, newAccount, saveAccount } from "../lib/records";

// Sends and receives (FR-SND-06). A transfer is person to person: money into
// or out of a circle, a vault or the settlement pair is already a Payment, a
// Payout or a swap, so it is skipped here.

type Ctx = EvmOnEventContext;

/** CTK has 18 decimals, AUSD 6; both are worth a dollar at the pair's price. */
const usd = (token: string, amount: bigint) => (token === CTK ? amount / 10n ** 12n : amount);

async function record(context: Ctx, t: Transfer): Promise<void> {
  context.Transfer.set(t);
  if (t.route === "Convert" || t.route === "Faucet") return;
  const [from, to] = await Promise.all([context.Account.get(t.from), context.Account.get(t.to)]);
  if (from) saveAccount(context, { ...from, sends: from.sends + 1, totalSent: from.totalSent + t.amountUsd }, t.at);
  if (to) saveAccount(context, { ...to, receives: to.receives + 1, totalReceivedDirect: to.totalReceivedDirect + t.amountUsd }, t.at);
  await bumpDay(context, t.at, { sends: 1, sent: t.amountUsd });
}

// Kitty whitelists every account for Instant Settlement when it is created
// (FR-SND-03), which makes the whitelisting the moment an account becomes a
// Kitty account, before it has joined anything.
indexer.contractRegister({ contract: "AgoraPair", event: "SetApprovedSwapper" }, async ({ event, context }) => {
  if (event.params.isApproved) context.chain.KittyAccount.add(event.params.approvedSwapper);
});

indexer.onEvent({ contract: "AgoraPair", event: "SetApprovedSwapper" }, async ({ event, context }) => {
  const who = event.params.approvedSwapper;
  const t = BigInt(event.block.timestamp);
  const a = await context.Account.get(who);
  if (a) context.Account.set({ ...a, approvedSwapper: event.params.isApproved });
  else if (event.params.isApproved) saveAccount(context, { ...newAccount(who, t), approvedSwapper: true }, t);
});

/**
 * token0 is CTK and token1 is AUSD. Paying in AUSD and delivering CTK to
 * someone else is a send that arrives ready to cash out; delivering to
 * yourself is a conversion.
 */
indexer.onEvent({ contract: "AgoraPair", event: "Swap" }, async ({ event, context }) => {
  const { sender, to, amount0In, amount1In, amount0Out, amount1Out } = event.params;
  const [s, r] = await Promise.all([context.Account.get(sender), context.Account.get(to)]);
  if (!s && !r) return; // someone else's swap
  const t = BigInt(event.block.timestamp);
  const toCashOut = amount1In > 0n; // AUSD in, CTK out
  await record(context, {
    id: logId(event),
    from: sender,
    to,
    token: toCashOut ? "CTK" : "AUSD",
    amount: toCashOut ? amount0Out : amount1Out,
    amountUsd: toCashOut ? amount1In : usd(CTK, amount0In),
    route: sender === to ? "Convert" : toCashOut ? "CashOut" : "Dollars",
    at: t,
    block: event.block.number,
    logIndex: event.logIndex,
    txHash: event.transaction.hash,
  });
  await bumpDay(context, t, { swaps: 1 });
});

// Wildcard: any token's Transfer whose sender or receiver is a registered
// Kitty account. Only AUSD and CTK are kept.
indexer.onEvent(
  {
    contract: "KittyAccount",
    event: "Transfer",
    wildcard: true,
    where: ({ chain }) => ({ params: [{ from: chain.KittyAccount.addresses }, { to: chain.KittyAccount.addresses }] }),
  },
  async ({ event, context }) => {
    const token = event.srcAddress;
    if (token !== AUSD && token !== CTK) return;
    const { from, to, value } = event.params;
    if (from === PAIR || to === PAIR || VAULTS.has(from) || VAULTS.has(to)) return;
    const [fromCircle, toCircle] = await Promise.all([context.Circle.get(from), context.Circle.get(to)]);
    if (fromCircle || toCircle) return;
    await record(context, {
      id: logId(event),
      from,
      to,
      token: token === CTK ? "CTK" : "AUSD",
      amount: value,
      amountUsd: usd(token, value),
      route: from === FAUCET || from === ZERO ? "Faucet" : "Dollars",
      at: BigInt(event.block.timestamp),
      block: event.block.number,
      logIndex: event.logIndex,
      txHash: event.transaction.hash,
    });
  },
);
