// The only file that imports @category-labs/mera directly, so the rest of
// the app depends on this module's return shape, not on Mera's API surface.
import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
} from "@category-labs/mera";
import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

const rpId = process.env.EXPO_PUBLIC_RP_ID!;
const ACCOUNT_PATH = "m/44'/60'/0'/0/0";

export async function createAccount(displayName: string) {
  const { prfOutput, credentialId } = await createPasskeyWithPrfOutput({
    rp: { id: rpId, name: "Kitty" },
    user: { name: `${displayName}@kitty`, displayName },
    webAuthnClient: reactNativeWebAuthnClient,
  });
  return fromPrf(prfOutput, credentialId);
}

export async function signIn() {
  const { prfOutput, credentialId } = await getPasskeyPrfOutput({
    rpId,
    webAuthnClient: reactNativeWebAuthnClient,
  });
  return fromPrf(prfOutput, credentialId);
}

function fromPrf(prfOutput: Uint8Array, credentialId: string) {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(ACCOUNT_PATH);
  if (!node.privateKey) throw new Error("derivation produced no key");
  const session = createSecp256k1SigningSession({ privateKey: node.privateKey });
  return {
    address: getEvmAddress(session.publicKey),
    account: toViemAccount(session), // hand this to viem's wallet client
    prfOutput, // stays in memory only; never persisted or logged (NFR-SEC-05)
    credentialId,
    end: () => session.end(),
  };
}
