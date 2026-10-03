import { isHex } from "viem";

import { isSealed, json, kvGet, kvSet } from "./_lib/kv.js";

// A member's profile (display name, country), sealed under a key derived from
// their passkey and stored at an id also derived from it (SRS 15.4). The id
// says nothing about the address, and only the passkey can produce it, so it
// works as the capability to read and write the record.
//
//   GET /api/profile?id=0x<32 bytes>          -> { blob } | 404
//   PUT /api/profile?id=0x<32 bytes>  { blob }

function idParam(req: Request): string | null {
  const id = new URL(req.url).searchParams.get("id");
  return id && isHex(id) && id.length === 66 ? id.toLowerCase() : null;
}

export async function GET(req: Request): Promise<Response> {
  const id = idParam(req);
  if (!id) return json({ error: "Bad request." }, 400);
  const raw = await kvGet(`profile:${id}`);
  return raw ? json({ blob: JSON.parse(raw) }) : json({ error: "Not found." }, 404);
}

export async function PUT(req: Request): Promise<Response> {
  const id = idParam(req);
  const body = (await req.json().catch(() => null)) as { blob?: unknown } | null;
  if (!id || !body || !isSealed(body.blob)) return json({ error: "Bad request." }, 400);
  await kvSet(`profile:${id}`, JSON.stringify(body.blob));
  return json({ ok: true });
}
