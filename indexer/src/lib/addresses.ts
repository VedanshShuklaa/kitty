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
  "0xc91af00c71eb71eb0fa4bb58e41d7a9c66becbfb", // 4 Oct, static-analysis fixes
  "0x62cf4ec7fdb95443622494adc8fa58c47f87d136",
  "0x35f8a20d394e3af13ac82fa0a1671ee229081a7e", // 5 Oct, Feed the Kitty
  "0x8912100fc8df228766809b3107fa9fb9249d1337",
  "0x7953f85f2147b5edcf72a4d68df9ee92491adc2e", // 5 Oct, people filter
  "0x068d6e51408c49a17558786e8a06074ff32fd75b",
]);

// "Feed the Kitty": the standing record and the cats, as in deployments/10143.json
export const KITTY_RECORD = "0x1917a3812c61fc5fb6cee680224bc485e1ee4b7a"; // 5 Oct, people filter
export const KITTY_CATS = "0xbacf87e4c7c6c7ed9e1be5f3f6b6482d3aa1007b";
