// The passkey's PRF output is the root of every other key Kitty needs: one
// passkey, many keys (SRS 15.5), each domain-separated by its HKDF info so a
// bid salt can never collide with a roster key or an invite key. None of
// these is ever written to disk or sent anywhere; each is re-derived from the
// passkey when it is needed.
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils";
import { bytesToNumberBE, hexToBytes, numberToBytesBE } from "@noble/curves/abstract/utils";
import { secp256k1 } from "@noble/curves/secp256k1";

type Hex = `0x${string}`;

const SALT = utf8ToBytes("kitty/v1");

const expand = (prf: Uint8Array, info: Uint8Array, length = 32) => hkdf(sha256, prf, SALT, info, length);
const circleInfo = (label: string, chainId: bigint, circle: Hex) =>
  concatBytes(utf8ToBytes(label), numberToBytesBE(chainId, 8), hexToBytes(circle.slice(2)));

/**
 * A secp256k1 private key from 48 bytes of HKDF output, reduced into
 * [1, n - 1]. The extra 16 bytes make the reduction's bias negligible.
 */
function scalar(prf: Uint8Array, info: Uint8Array): Hex {
  const n = secp256k1.CURVE.n;
  const k = (bytesToNumberBE(expand(prf, info, 48)) % (n - 1n)) + 1n;
  return `0x${bytesToHex(numberToBytesBE(k, 32))}`;
}

/** info = "bid" | chainId (8 bytes BE) | circle (20 bytes) | round (4 bytes BE) */
export function bidSalt(prf: Uint8Array, chainId: bigint, circle: Hex, round: number): Uint8Array {
  return expand(prf, concatBytes(circleInfo("bid", chainId, circle), numberToBytesBE(BigInt(round), 4)));
}

/** Wraps each circle's roster key, so the wrapped copy can sit on untrusted storage. */
export const rosterWrapKey = (prf: Uint8Array): Uint8Array => expand(prf, utf8ToBytes("roster-wrap"));

/** Organizer only: the circle's shared key for its encrypted title and names. */
export const rosterKey = (prf: Uint8Array, chainId: bigint, circle: Hex): Uint8Array =>
  expand(prf, circleInfo("roster", chainId, circle));

/**
 * Organizer only: the seat's invite key, whose address the circle checks at
 * join. `circle` is the factory's predicted address, known before creation,
 * so the keys never need to be stored (FR-KEY-02).
 */
export const inviteKey = (prf: Uint8Array, chainId: bigint, circle: Hex, seat: number): Hex =>
  scalar(prf, concatBytes(circleInfo("invite", chainId, circle), Uint8Array.of(seat)));

/** Encrypts the member's profile (name, country) on untrusted storage. */
export const profileKey = (prf: Uint8Array): Uint8Array => expand(prf, utf8ToBytes("profile"));

/** Where the profile is stored: found from the passkey alone, not from the address. */
export const profileId = (prf: Uint8Array): Hex => `0x${bytesToHex(expand(prf, utf8ToBytes("profile-id")))}`;

/** A per-circle pseudonym for push registrations, unlinkable to the address (FR-KEY-04). */
export const pushId = (prf: Uint8Array, chainId: bigint, circle: Hex): Hex =>
  `0x${bytesToHex(expand(prf, circleInfo("push", chainId, circle)))}`;

/** The n-th one-time key for money sent by link (FR-SND-08). */
export const sendLinkKey = (prf: Uint8Array, n: number): Hex =>
  scalar(prf, concatBytes(utf8ToBytes("send-link"), numberToBytesBE(BigInt(n), 4)));
