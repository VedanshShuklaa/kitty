import { createWalletClient, http, parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "../chain.js";

// One capped MON top-up per invited member (FR-GAS-01/02): never holds
// AUSD, and refuses anything it cannot verify against the invite signature.
export const GRANT_AMOUNT = parseEther("0.25");

export function createSponsor(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({ account, chain: monadTestnet, transport: http() });

  async function grant(recipient: Address) {
    return walletClient.sendTransaction({ to: recipient, value: GRANT_AMOUNT });
  }

  return { grant, address: account.address };
}
