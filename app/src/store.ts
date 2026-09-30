import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { Address, Hex } from "viem";

// What this phone remembers. Nothing here is secret except the organizer's
// invite keys, which live in the OS keystore. The passkey's PRF output is
// never stored (FR-ACC-04).

export type Profile = { name: string; address: Address; country: string };

export type CircleRef = {
  address: Address;
  title: string;
  names: string[]; // by seat; seat 0 is the organizer
  seat: number;
  organizer: boolean;
  addedAt: number; // unix ms
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

/** Seat-indexed invite keys; index 0 (the organizer's seat) is null. */
export async function saveInviteKeys(circle: Address, keys: (Hex | null)[]): Promise<void> {
  await SecureStore.setItemAsync(invitesKey(circle), JSON.stringify(keys));
}

export async function getInviteKeys(circle: Address): Promise<(Hex | null)[] | null> {
  const raw = await SecureStore.getItemAsync(invitesKey(circle));
  return raw ? (JSON.parse(raw) as (Hex | null)[]) : null;
}
