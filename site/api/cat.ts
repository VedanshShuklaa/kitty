import { createPublicClient, defineChain, getAddress, http, isAddress, parseAbi, type Address } from "viem";

import { catSvg, STAGE_LINE, STAGES, traitsOf } from "./_lib/cat.js";
import { json } from "./_lib/kv.js";

// KittyCats.tokenURI points here: ERC-721 metadata for one member's cat, with
// her drawing inline. Her stage is read from KittyRecord on every request, so
// nothing here can go stale and nothing is signed. Holds no key.
//
//   GET /api/cat/<address>          metadata JSON
//   GET /api/cat/<address>?svg=1    the drawing itself
//
// vercel.json rewrites /api/cat/<address> to /api/cat?address=<address>.

const chain = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz"] } },
});
const client = createPublicClient({ chain, transport: http() });
const recordAbi = parseAbi(["function stageOf(address a) view returns (uint8)"]);
const NAMES = { Away: "Away", Wary: "Wary", Shy: "Shy", Friendly: "Friendly", AtHome: "At home", Family: "Family" } as const;

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const raw = url.searchParams.get("address") ?? "";
  if (!isAddress(raw)) return json({ error: "Not a Kitty account." }, 400);
  const owner = getAddress(raw) as Address;
  const record = process.env.KITTY_RECORD;
  if (!record || !isAddress(record)) return json({ error: "Kitty's record isn't configured." }, 503);

  let stage: (typeof STAGES)[number];
  try {
    const s = await client.readContract({ address: record, abi: recordAbi, functionName: "stageOf", args: [owner] });
    stage = STAGES[s] ?? "Shy";
  } catch {
    return json({ error: "Couldn't read her stage right now." }, 502);
  }

  const svg = catSvg(owner, stage);
  // her stage can change with any circle's next write; a minute is plenty
  const cache = { "cache-control": "public, max-age=60" };
  if (url.searchParams.get("svg")) return new Response(svg, { headers: { "content-type": "image/svg+xml", ...cache } });

  const { coat, markings } = traitsOf(owner);
  return json(
    {
      name: `Kitty cat of ${owner.slice(0, 6)}…${owner.slice(-4)}`,
      description: `${STAGE_LINE[stage]}. A Kitty member's cat shows how much the circles trust them: kept promises raise it slowly, broken ones lower it fast. She is locked to the account and holds no money.`,
      image: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      attributes: [
        { trait_type: "Stage", value: NAMES[stage] },
        { trait_type: "Coat", value: coat },
        { trait_type: "Markings", value: markings },
      ],
    },
    200,
    cache,
  );
}
