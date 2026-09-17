import { getRandomValues } from "expo-crypto";

// react-native has no WebCrypto by default; Mera and viem both need
// crypto.getRandomValues. Import this file first, before anything
// that touches mera, from index.ts.
if (typeof globalThis.crypto?.getRandomValues !== "function") {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { ...globalThis.crypto, getRandomValues },
  });
}
