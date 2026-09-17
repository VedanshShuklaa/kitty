import { encodeAbiParameters, keccak256, parseAbiParameters, recoverMessageAddress, isAddressEqual, type Address, type Hex } from "viem";

// The pattern the rest of the API follows: verify a signature against the
// seat's registered invite signer before doing anything a member could abuse.
const SPONSOR_TYPEHASH = keccak256(new TextEncoder().encode("KittySponsorGrant(uint256 chainId,address circle,uint8 seat,address joiner)"));

export async function verifyGasGrantRequest(
  chainId: bigint,
  circle: Address,
  seat: number,
  joiner: Address,
  signature: Hex,
  expectedSigner: Address,
): Promise<boolean> {
  const digest = keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, uint256, address, uint8, address"), [
      SPONSOR_TYPEHASH,
      chainId,
      circle,
      seat,
      joiner,
    ]),
  );
  const signer = await recoverMessageAddress({ message: { raw: digest }, signature });
  return isAddressEqual(signer, expectedSigner);
}
