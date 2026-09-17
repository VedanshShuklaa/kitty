import { createPublicClient, createWalletClient, http, parseAbi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "../chain.js";

// closeRound is permissionless by design (NFR-REL-01): the app itself can
// call it if this service is down. This loop is a convenience, not a
// single point of failure.
const circleAbi = parseAbi(["function closeRound(uint32 round) external"]);

const POLL_INTERVAL_MS = 30_000;

export function createKeeper(circleFactory: Address, privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain: monadTestnet, transport: http() });
  const walletClient = createWalletClient({ account, chain: monadTestnet, transport: http() });

  async function closeRound(circle: Address, round: number) {
    const gas = await publicClient.estimateContractGas({
      address: circle,
      abi: circleAbi,
      functionName: "closeRound",
      args: [round],
      account,
    });
    return walletClient.writeContract({
      address: circle,
      abi: circleAbi,
      functionName: "closeRound",
      args: [round],
      gas: (gas * 12n) / 10n, // Monad charges the gas limit, not gas used
    });
  }

  return { closeRound };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // TODO(C1): read overdue rounds from the Envio GraphQL endpoint once
  // CircleFactory is deployed, instead of this placeholder interval.
  setInterval(() => {
    console.log("keeper: waiting for a deployed CircleFactory (see deployments/10143.json)");
  }, POLL_INTERVAL_MS);
}
