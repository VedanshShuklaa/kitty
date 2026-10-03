import { keccak256, toBytes, type Address } from "viem";

import { profileId, profileKey, rosterKey, rosterWrapKey } from "./account/keys";
import { isSealed, open, openJson, seal, sealJson, type Sealed } from "./account/seal";
import { apiUrl, contracts } from "./config";
import type { Signer } from "./kitty";
import { timedFetch } from "./net";

// The Kitty API (site/api) as the phone sees it: untrusted storage that only
// ever receives ciphertext (FR-RST-02). Losing it costs names, never money or
// membership, so every read here may come back empty and callers carry on.

export type Roster = { title: string; names: string[] };
export type ProfileData = { name: string; country: string };

const chainId = () => BigInt(contracts.chainId);

/** Must match site/api/_lib/kv.ts writeMessage. */
const writeMessage = (kind: string, where: string, blob: Sealed, at: number) =>
  `kitty.api.v1|${kind}|${where.toLowerCase()}|${keccak256(toBytes(JSON.stringify(blob)))}|${at}`;

async function getBlob(path: string): Promise<Sealed | null> {
  const res = await timedFetch(`${apiUrl}${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Kitty's storage answered ${res.status}`);
  const body = (await res.json()) as { blob?: unknown };
  return isSealed(body.blob) ? body.blob : null;
}

async function putBlob(path: string, body: Record<string, unknown>): Promise<void> {
  const res = await timedFetch(`${apiUrl}${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Kitty's storage answered ${res.status}`);
  }
}

async function signedPut(s: Signer, path: string, kind: string, where: string, blob: Sealed): Promise<void> {
  const at = Math.floor(Date.now() / 1000);
  const sig = await s.account.signMessage({ message: writeMessage(kind, where, blob, at) });
  await putBlob(path, { blob, at, sig });
}

// ----------------------------------------------------------------- roster

const rosterAad = (circle: Address) => `roster:${circle.toLowerCase()}`;
const keyAad = (circle: Address, member: Address) => `key:${circle.toLowerCase()}:${member.toLowerCase()}`;

/** The organizer's roster key for a circle, re-derived from their passkey. */
export const organizerRosterKey = (s: Signer, circle: Address) => rosterKey(s.prf, chainId(), circle);

/** Organizer: seal the circle's title and names under its roster key and store them. */
export async function putRoster(s: Signer, circle: Address, roster: Roster): Promise<void> {
  const blob = sealJson(organizerRosterKey(s, circle), roster, rosterAad(circle));
  await signedPut(s, `/api/roster?circle=${circle}`, "roster", circle, blob);
}

export async function getRoster(circle: Address, key: Uint8Array): Promise<Roster | null> {
  const blob = await getBlob(`/api/roster?circle=${circle}`);
  if (!blob) return null;
  const r = openJson<Roster>(key, blob, rosterAad(circle));
  return typeof r.title === "string" && Array.isArray(r.names) ? { title: r.title, names: r.names.map(String) } : null;
}

/** Member: keep a copy of the circle's roster key, wrapped under their own passkey. */
export async function putMemberKey(s: Signer, circle: Address, key: Uint8Array): Promise<void> {
  const blob = seal(rosterWrapKey(s.prf), key, keyAad(circle, s.address));
  await signedPut(s, `/api/keys?circle=${circle}&member=${s.address}`, "key", `${circle}:${s.address}`, blob);
}

export async function getMemberKey(s: Signer, circle: Address): Promise<Uint8Array | null> {
  const blob = await getBlob(`/api/keys?circle=${circle}&member=${s.address}`);
  return blob ? open(rosterWrapKey(s.prf), blob, keyAad(circle, s.address)) : null;
}

// ---------------------------------------------------------------- profile

export async function putProfile(prf: Uint8Array, p: ProfileData): Promise<void> {
  await putBlob(`/api/profile?id=${profileId(prf)}`, { blob: sealJson(profileKey(prf), p, "profile") });
}

export async function getProfileData(prf: Uint8Array): Promise<ProfileData | null> {
  const blob = await getBlob(`/api/profile?id=${profileId(prf)}`);
  if (!blob) return null;
  const p = openJson<ProfileData>(profileKey(prf), blob, "profile");
  return typeof p.name === "string" ? { name: p.name, country: typeof p.country === "string" ? p.country : "" } : null;
}
