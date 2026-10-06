import { bytesToHex, hexToBytes, type Address, type Hex } from "viem";

import { circlesOf } from "./indexer";
import type { Signer } from "./kitty";
import { listCircles, saveCircle, type CircleRef } from "./store";
import { getMemberKey, getRoster, organizerRosterKey, putMemberKey, putRoster, type Roster } from "./vault";

// The stateless test (SRS 15.4, FR-RST-01): after storage is cleared, or on a
// second phone, the circle list comes back from the indexer, and each
// circle's title and names from its encrypted roster. Local storage is only a
// cache of what this rebuilds. Any piece that's unavailable falls back
// ("Savings circle", "Member 2") and is filled in on a later pass.

export const FALLBACK_TITLE = "Savings circle";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The roster key this account can open a circle's roster with: derived if it organized it, unwrapped if it joined. */
async function keyFor(s: Signer, circle: Address, organizer: boolean): Promise<Uint8Array | null> {
  return organizer ? organizerRosterKey(s, circle) : getMemberKey(s, circle);
}

export async function fetchRoster(s: Signer, circle: Address, organizer: boolean): Promise<Roster | null> {
  const key = await keyFor(s, circle, organizer);
  return key ? getRoster(circle, key) : null;
}

export type Restored = { circles: number; named: number; indexerDown: boolean };

export async function restoreCircles(s: Signer): Promise<Restored> {
  const cached = await listCircles(s.address);
  let mine;
  try {
    mine = await circlesOf(s.address);
  } catch {
    return { circles: cached.length, named: cached.filter((c) => c.title !== FALLBACK_TITLE).length, indexerDown: true };
  }
  let named = 0;
  for (const c of mine) {
    if (c.seat === null) continue; // organized but never joined: nothing to show
    const known = cached.find((k) => same(k.address, c.address));
    const organizer = same(c.organizer, s.address);
    let roster: Roster | null = null;
    if (!known || known.title === FALLBACK_TITLE || known.names.length === 0) {
      roster = await fetchRoster(s, c.address, organizer).catch(() => null);
    }
    const ref: CircleRef = {
      address: c.address,
      title: roster?.title ?? known?.title ?? FALLBACK_TITLE,
      names: roster?.names ?? known?.names ?? [],
      seat: c.seat,
      organizer,
      addedAt: known?.addedAt ?? Date.now(),
      synced: known?.synced || !!roster,
      // a circle the member archived on this phone stays archived
      ...(known?.archived ? { archived: true } : {}),
    };
    if (ref.title !== FALLBACK_TITLE) named++;
    await saveCircle(s.address, ref);
  }
  return { circles: mine.filter((c) => c.seat !== null).length, named, indexerDown: false };
}

/**
 * Puts this phone's knowledge of a circle into Kitty's storage, once: the
 * organizer stores the sealed roster, a member stores their wrapped copy of
 * the roster key. Best effort; a later visit retries. Resolves true only when
 * something was saved (so callers re-read the circle only then).
 */
export async function syncCircle(s: Signer, ref: CircleRef, rosterKey: Hex | null = null): Promise<boolean> {
  if (ref.synced) return false;
  if (ref.organizer) {
    if (ref.names.length === 0) return false;
    await putRoster(s, ref.address, { title: ref.title, names: ref.names });
  } else {
    if (!rosterKey) return false;
    await putMemberKey(s, ref.address, hexToBytes(rosterKey));
  }
  await saveCircle(s.address, { ...ref, synced: true });
  return true;
}

/** The roster key to put in an organizer's invite links. */
export const rosterKeyHex = (s: Signer, circle: Address): Hex => bytesToHex(organizerRosterKey(s, circle));
