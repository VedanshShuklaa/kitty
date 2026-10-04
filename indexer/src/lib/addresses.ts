// Testnet addresses the money handlers compare against, lowercase as the
// indexer stores them. Kept apart from the handlers so tests can import them
// without registering the handlers a second time.

export const AUSD = "0xa9012a055bd4e0edff8ce09f960291c09d5322dc";
export const CTK = "0x7beb5d9db0d85cbea543c04f0de8c23c2176cd9d"; // stands in for USDC on testnet
export const PAIR = "0x1aa8958aa34cec8096ef4381cb335effe977b0ae"; // Agora Instant Settlement, CTK/AUSD
export const FAUCET = "0xd236c18d274e54faccc3dd9dda4b27965a73ee6c";
export const ZERO = "0x0000000000000000000000000000000000000000";

/** Stake vaults and earn vaults: money in and out of them is never a send. */
export const VAULTS = new Set([
  "0x9dceb8856d9c5fa71e83688d4050c8d9fcbcfc3f",
  "0x3f2a036b4f5838aa2944aa8bc0ff18af955040e8",
  "0xdf4065a2b21cccd060063f21b8864d0c6896714b",
  "0x8fd0e8eb4db03aed08c14fe686d10d59d9d5a31f",
  "0x4d681f775adb2e09eeaf5316a04a082b0182ed26", // 4 Oct
  "0x825b90eba7778cc554813b1f1e790a881d4190d0",
  "0xd31244805b5bc141b69bb88b4e510a399cea0ce0", // 4 Oct, tier attestations
  "0xfa0866e6d11f65a6f30beaaa5d4f24133ea4ac2e",
  "0xc91af00c71eb71eb0fa4bb58e41d7a9c66becbfb", // 4 Oct, main's redeploy
  "0x62cf4ec7fdb95443622494adc8fa58c47f87d136",
]);
