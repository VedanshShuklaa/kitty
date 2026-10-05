import type { ExpoConfig } from "expo/config";
import { readFileSync } from "fs";
import { join } from "path";

const rpId = process.env.EXPO_PUBLIC_RP_ID ?? "kitty-circle.vercel.app";
const siteUrl = `https://${rpId}`;
const applicationId = "xyz.kitty.app";

// The deploy script writes deployments/<chainId>.json; it is the single
// source of contract addresses for the app, services and indexer.
const deployment = JSON.parse(readFileSync(join(__dirname, "..", "deployments", "10143.json"), "utf8"));
const contracts = {
  chainId: deployment.chainId as number,
  circleFactory: deployment.circleFactory as string,
  ausd: deployment.ausd as string,
  // "Feed the Kitty": standing kept by the circles, and the cat that shows it
  kittyRecord: deployment.kittyRecord as string,
  kittyCats: deployment.kittyCats as string,
  ausdFaucet: process.env.AUSD_FAUCET ?? "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C",
  // Agora Instant Settlement on testnet (SRS 15.3): CTK stands in for USDC
  ctk: "0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D",
  pair: "0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae",
  whitelister: "0x7c10F56d6f04a51376393a1C3670e966863F6BD5",
};

const config: ExpoConfig = {
  name: "Kitty",
  slug: "kitty",
  scheme: "kitty",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/kitty-icon.png",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: applicationId,
    supportsTablet: true,
    associatedDomains: [`webcredentials:${rpId}`, `applinks:${rpId}`],
  },
  android: {
    package: applicationId,
    adaptiveIcon: {
      backgroundColor: "#FAFBE6",
      foregroundImage: "./assets/kitty-adaptive.png",
    },
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: rpId, pathPrefix: "/j/" },
          { scheme: "https", host: rpId, pathPrefix: "/p/" },
          { scheme: "https", host: rpId, pathPrefix: "/s/" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    favicon: "./assets/kitty-favicon.png",
  },
  plugins: [
    ["expo-splash-screen", { image: "./assets/kitty-icon.png", imageWidth: 200, backgroundColor: "#FAFBE6" }],
    ["expo-secure-store", { faceIDPermission: "Unlock the circle account on this phone." }],
    "expo-notifications",
    ["expo-camera", { cameraPermission: "Scan a Kitty code to send money to someone." }],
  ],
  extra: {
    rpId,
    siteUrl,
    // Sponsor endpoint lives on the same Vercel project as the site
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? siteUrl,
    // The Envio indexer's GraphQL endpoint. Unset, the app goes through the
    // site's /api/graphql, which forwards to wherever the indexer is hosted.
    indexerUrl: process.env.EXPO_PUBLIC_INDEXER_URL ?? `${process.env.EXPO_PUBLIC_API_URL ?? siteUrl}/api/graphql`,
    contracts,
    eas: { projectId: "a2794367-b084-405b-b948-1b85ccf6c8fd" },
  },
};

export default config;
