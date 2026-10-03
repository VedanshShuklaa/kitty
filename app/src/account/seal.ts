import { gcm } from "@noble/ciphers/aes";
import { bytesToHex, hexToBytes, isHex, toBytes, type Hex } from "viem";

// AES-256-GCM for everything Kitty keeps on untrusted storage: circle rosters,
// wrapped roster keys and the profile (FR-RST-02). The additional data binds
// a ciphertext to where it belongs, so a roster can't be replayed onto
// another circle.

export type Sealed = { v: 1; iv: Hex; ct: Hex };

export function seal(key: Uint8Array, plaintext: Uint8Array, aad: string): Sealed {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = gcm(key, iv, toBytes(aad)).encrypt(plaintext);
  return { v: 1, iv: bytesToHex(iv), ct: bytesToHex(ct) };
}

/** Throws if the key is wrong or anything was changed. */
export function open(key: Uint8Array, s: Sealed, aad: string): Uint8Array {
  return gcm(key, hexToBytes(s.iv), toBytes(aad)).decrypt(hexToBytes(s.ct));
}

// JSON is percent-encoded to ASCII before sealing, so names in any script
// round-trip without depending on the runtime's TextDecoder.
const ascii = (s: string) => Uint8Array.from(encodeURIComponent(s), (ch) => ch.charCodeAt(0));
const unascii = (b: Uint8Array) => decodeURIComponent(String.fromCharCode(...b));

export const sealJson = (key: Uint8Array, value: unknown, aad: string): Sealed => seal(key, ascii(JSON.stringify(value)), aad);

export const openJson = <T>(key: Uint8Array, s: Sealed, aad: string): T => JSON.parse(unascii(open(key, s, aad))) as T;

export function isSealed(x: unknown): x is Sealed {
  const s = x as Sealed;
  return !!s && s.v === 1 && isHex(s.iv) && s.iv.length === 26 && isHex(s.ct) && s.ct.length > 34;
}
