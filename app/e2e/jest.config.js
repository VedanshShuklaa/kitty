// Live tests need Node's real fetch; the jest-expo preset replaces it with
// React Native's stub, which never reaches the network.
//   pnpm exec jest --config e2e/jest.config.js
module.exports = {
  rootDir: "..",
  testEnvironment: "node",
  testMatch: ["<rootDir>/e2e/*.live.ts"],
  transform: { "\\.[jt]sx?$": ["babel-jest", { presets: ["babel-preset-expo"] }] },
  transformIgnorePatterns: [],
};
