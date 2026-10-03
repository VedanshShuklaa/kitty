import { parseAbi } from "viem";

import { addressParam, isSealed, json, kvGet, kvSet, publicClient, signedBy } from "./_lib/kv.js";

// A circle's roster: its title and member names, sealed on the organizer's
// phone under the circle's roster key (FR-KEY-03). Anyone may read the
// ciphertext, which is useless without the key from the invite link. Only
// the circle's organizer, as recorded onchain, may write it.
//
//   GET /api/roster?circle=0x…           -> { blob } | 404
//   PUT /api/roster?circle=0x…  { blob, at, sig }

const circleAbi = parseAbi(["function organizer() view returns (address)"]);

export async function GET(req: Request): Promise<Response> {
  const circle = addressParam(new URL(req.url), "circle");
  if (!circle) return json({ error: "Bad request." }, 400);
  const raw = await kvGet(`roster:${circle}`);
  return raw ? json({ blob: JSON.parse(raw) }) : json({ error: "Not found." }, 404);
}

export async function PUT(req: Request): Promise<Response> {
  const circle = addressParam(new URL(req.url), "circle");
  const body = (await req.json().catch(() => null)) as { blob?: unknown; at?: unknown; sig?: unknown } | null;
  if (!circle || !body || !isSealed(body.blob)) return json({ error: "Bad request." }, 400);

  let organizer;
  try {
    organizer = await publicClient().readContract({ address: circle, abi: circleAbi, functionName: "organizer" });
  } catch {
    return json({ error: "That circle doesn't exist yet." }, 404);
  }
  if (!(await signedBy(organizer, "roster", circle, body.blob, body.at, body.sig))) {
    return json({ error: "Only the circle's organizer can change its names." }, 403);
  }
  await kvSet(`roster:${circle}`, JSON.stringify(body.blob));
  return json({ ok: true });
}
