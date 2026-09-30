import { isAddress, isHex, type Address, type Hex } from "viem";
import { siteUrl } from "./config";

// SRS 8.3. Everything secret sits after the `#`, which browsers never send
// to a server: the seat's invite key, and the circle's title and member
// names (which never go onchain, FR-ROS-01).
export type Invite = { circle: Address; seat: number; key: Hex; title: string; names: string[] };

export function inviteLink(i: Invite): string {
  const meta = encodeURIComponent(JSON.stringify({ t: i.title, n: i.names }));
  return `${siteUrl}/j/${i.circle}/${i.seat}#k=${i.key}&m=${meta}`;
}

export function parseInvite(url: string): Invite | null {
  const m = url.trim().match(/\/j\/(0x[0-9a-fA-F]{40})\/(\d{1,2})#(.+)$/);
  if (!m) return null;
  const [, circle, seatStr, fragment] = m;
  const params: Record<string, string> = {};
  for (const part of fragment.split("&")) {
    const eq = part.indexOf("=");
    if (eq > 0) params[part.slice(0, eq)] = part.slice(eq + 1);
  }
  const key = params.k;
  if (!isAddress(circle) || !key || !isHex(key) || key.length !== 66) return null;
  let title = "Savings circle";
  let names: string[] = [];
  try {
    const meta = JSON.parse(decodeURIComponent(params.m ?? ""));
    if (typeof meta.t === "string") title = meta.t;
    if (Array.isArray(meta.n)) names = meta.n.map(String);
  } catch {
    // names are a nicety; the invite still works without them
  }
  const seat = Number(seatStr);
  if (seat < 1 || seat > 11) return null;
  return { circle, seat, key, title, names };
}
