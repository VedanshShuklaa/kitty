import { parseInvite } from "./links";
import { parsePayee, parseSendLink } from "./money";
import type { Routes } from "./nav";

/** Where a Kitty link opens: an invite joins, a pay link sends, a send link collects. */
export type LinkRoute = { name: "Join"; params: Routes["Join"] } | { name: "Send"; params: Routes["Send"] } | { name: "Claim"; params: Routes["Claim"] };

export function routeFor(url: string): LinkRoute | null {
  const t = url.trim();
  if (parseInvite(t)) return { name: "Join", params: { link: t } };
  if (parseSendLink(t)) return { name: "Claim", params: { link: t } };
  // a bare address is a fine thing to paste, but never a link to open
  const payee = /\/p\//.test(t) ? parsePayee(t) : null;
  if (payee) return { name: "Send", params: { to: payee.address, name: payee.name ?? undefined } };
  return null;
}
