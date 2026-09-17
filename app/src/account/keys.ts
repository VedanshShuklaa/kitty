// The passkey's PRF output is the root of every other key Kitty needs: one
// passkey, many keys, each domain-separated by HKDF info so a bid salt can
// never collide with the roster-wrap key.
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils";
import { numberToBytesBE, hexToBytes } from "@noble/curves/abstract/utils";

const SALT = utf8ToBytes("kitty/v1");

/** info = "bid" | chainId (8 bytes BE) | circle (20 bytes) | round (4 bytes BE) */
export function bidSalt(prf: Uint8Array, chainId: bigint, circle: `0x${string}`, round: number): Uint8Array {
  const info = concatBytes(
    utf8ToBytes("bid"),
    numberToBytesBE(chainId, 8),
    hexToBytes(circle.slice(2)),
    numberToBytesBE(BigInt(round), 4),
  );
  return hkdf(sha256, prf, SALT, info, 32);
}

export const rosterWrapKey = (prf: Uint8Array): Uint8Array =>
  hkdf(sha256, prf, SALT, utf8ToBytes("roster-wrap"), 32);
