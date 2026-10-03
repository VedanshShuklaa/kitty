import { addressParam, isSealed, json, kvGet, kvSet, signedBy } from "./_lib/kv.js";

// Each member's copy of a circle's roster key, wrapped under a key only their
// passkey can derive (FR-KEY-03). It is what lets a member who cleared their
// phone, or picked up a new one, read the circle's names again.
//
//   GET /api/keys?circle=0x…&member=0x…           -> { blob } | 404
//   PUT /api/keys?circle=0x…&member=0x…  { blob, at, sig }   signed by the member

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const circle = addressParam(url, "circle");
  const member = addressParam(url, "member");
  if (!circle || !member) return json({ error: "Bad request." }, 400);
  const raw = await kvGet(`key:${circle}:${member}`);
  return raw ? json({ blob: JSON.parse(raw) }) : json({ error: "Not found." }, 404);
}

export async function PUT(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const circle = addressParam(url, "circle");
  const member = addressParam(url, "member");
  const body = (await req.json().catch(() => null)) as { blob?: unknown; at?: unknown; sig?: unknown } | null;
  if (!circle || !member || !body || !isSealed(body.blob)) return json({ error: "Bad request." }, 400);
  if (!(await signedBy(member, "key", `${circle}:${member}`, body.blob, body.at, body.sig))) {
    return json({ error: "Not signed by this member." }, 403);
  }
  await kvSet(`key:${circle}:${member}`, JSON.stringify(body.blob));
  return json({ ok: true });
}
