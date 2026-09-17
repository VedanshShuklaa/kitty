import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { verifyGasGrantRequest } from "../src/api/gasGrant.js";
import { encodeAbiParameters, keccak256, parseAbiParameters } from "viem";

const CIRCLE = "0x1111111111111111111111111111111111111111" as const;
const JOINER = "0x2222222222222222222222222222222222222222" as const;

async function signGrant(privateKey: `0x${string}`, chainId: bigint, circle: `0x${string}`, seat: number, joiner: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  const typehash = keccak256(new TextEncoder().encode("KittySponsorGrant(uint256 chainId,address circle,uint8 seat,address joiner)"));
  const digest = keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, uint256, address, uint8, address"), [typehash, chainId, circle, seat, joiner]),
  );
  return account.signMessage({ message: { raw: digest } });
}

describe("verifyGasGrantRequest", () => {
  it("accepts a signature from the expected invite signer", async () => {
    const privateKey = generatePrivateKey();
    const signer = privateKeyToAccount(privateKey).address;
    const signature = await signGrant(privateKey, 10143n, CIRCLE, 3, JOINER);

    await expect(verifyGasGrantRequest(10143n, CIRCLE, 3, JOINER, signature, signer)).resolves.toBe(true);
  });

  it("rejects a signature from a different signer", async () => {
    const privateKey = generatePrivateKey();
    const otherSigner = privateKeyToAccount(generatePrivateKey()).address;
    const signature = await signGrant(privateKey, 10143n, CIRCLE, 3, JOINER);

    await expect(verifyGasGrantRequest(10143n, CIRCLE, 3, JOINER, signature, otherSigner)).resolves.toBe(false);
  });

  it("rejects when the seat in the signed digest does not match", async () => {
    const privateKey = generatePrivateKey();
    const signer = privateKeyToAccount(privateKey).address;
    const signature = await signGrant(privateKey, 10143n, CIRCLE, 3, JOINER);

    await expect(verifyGasGrantRequest(10143n, CIRCLE, 4, JOINER, signature, signer)).resolves.toBe(false);
  });
});
