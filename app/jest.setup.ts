// react-native has no WebCrypto; the noble/scure stack used by src/account
// needs crypto.getRandomValues even under Jest's node environment.
import { webcrypto } from "node:crypto";

if (typeof globalThis.crypto?.getRandomValues !== "function") {
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
}
