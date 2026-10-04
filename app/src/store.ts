import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { Address, Hex } from "viem";

// What this phone remembers, as a cache (FR-RST-01): everything here can be
// rebuilt from the passkey, the indexer and Kitty's encrypted storage. The
// passkey's PRF output and every key derived from it are never stored
// (FR-ACC-04, SRS 15.5).

/** `credentialId` is the passkey's public id (not a secret): it limits later prompts to this account's passkey. */
export type Profile = { name: string; address: Address; country: string; credentialId?: string };

export type CircleRef = {
  address: Address;
  title: string;
  names: string[]; // by seat; seat 0 is the organizer
  seat: number;
  organizer: boolean;
  addedAt: number; // unix ms
  /** The roster (organizer) or this member's wrapped roster key is in Kitty's storage. */
  synced?: boolean;
  /** Called off and fully collected: kept for the record, hidden from Home. */
  archived?: boolean;
};

const PROFILE = "kitty:profile";
const circlesKey = (me: Address) => `kitty:circles:${me.toLowerCase()}`;
const invitesKey = (circle: Address) => `kitty.invites.${circle.toLowerCase()}`;

export async function getProfile(): Promise<Profile | null> {
  const raw = await AsyncStorage.getItem(PROFILE);
  return raw ? (JSON.parse(raw) as Profile) : null;
}

export async function setProfile(p: Profile): Promise<void> {
  await AsyncStorage.setItem(PROFILE, JSON.stringify(p));
}

export async function clearProfile(): Promise<void> {
  await AsyncStorage.removeItem(PROFILE);
}

export async function listCircles(me: Address): Promise<CircleRef[]> {
  const raw = await AsyncStorage.getItem(circlesKey(me));
  const list = raw ? (JSON.parse(raw) as CircleRef[]) : [];
  return list.sort((a, b) => b.addedAt - a.addedAt);
}

export async function getCircle(me: Address, circle: Address): Promise<CircleRef | undefined> {
  return (await listCircles(me)).find((c) => c.address.toLowerCase() === circle.toLowerCase());
}

export async function saveCircle(me: Address, ref: CircleRef): Promise<void> {
  const list = (await listCircles(me)).filter((c) => c.address.toLowerCase() !== ref.address.toLowerCase());
  list.push(ref);
  await AsyncStorage.setItem(circlesKey(me), JSON.stringify(list));
}

export async function forgetCircles(me: Address): Promise<void> {
  await AsyncStorage.removeItem(circlesKey(me));
}

/**
 * Seat-indexed invite keys for circles created before invite keys were
 * derived from the passkey. Newer circles derive them (kitty.ts inviteKeyFor).
 */
export async function getInviteKeys(circle: Address): Promise<(Hex | null)[] | null> {
  const raw = await SecureStore.getItemAsync(invitesKey(circle));
  return raw ? (JSON.parse(raw) as (Hex | null)[]) : null;
}
