import { json } from "./_lib/kv.js";

// Forwards the app's read-only queries to Kitty's Envio indexer (SRS 15.6).
// The phone can also call the indexer directly; going through here means the
// hosted indexer can move without a new app build. INDEXER_URL is the
// deployment's GraphQL endpoint.
//
//   POST /api/graphql  { query, variables }

// The schema is cyclic (circle -> members -> circle ...), so a deep query
// costs the indexer far more than its length suggests. The app's deepest
// query nests 4 levels and its longest is well under 1,000 characters.
const MAX_DEPTH = 6;
const MAX_LENGTH = 3_000;

function depth(q: string): number {
  let d = 0;
  let max = 0;
  for (const c of q) {
    if (c === "{") max = Math.max(max, ++d);
    else if (c === "}") d--;
  }
  return max;
}

export async function POST(req: Request): Promise<Response> {
  const upstream = process.env.INDEXER_URL;
  if (!upstream) return json({ errors: [{ message: "Indexer not configured." }] }, 503);
  const body = (await req.json().catch(() => null)) as { query?: unknown; variables?: unknown } | null;
  if (
    !body ||
    typeof body.query !== "string" ||
    body.query.length > MAX_LENGTH ||
    depth(body.query) > MAX_DEPTH ||
    /\b(mutation|subscription)\b/i.test(body.query)
  ) {
    return json({ errors: [{ message: "Only queries are allowed." }] }, 400);
  }
  try {
    const res = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: body.query, variables: body.variables ?? {} }),
      signal: AbortSignal.timeout(8_000),
    });
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  } catch {
    return json({ errors: [{ message: "The indexer didn't answer." }] }, 502);
  }
}
