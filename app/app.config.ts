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
  ausdFaucet: process.env.AUSD_FAUCET ?? "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C",
};

const config: ExpoConfig = {
  name: "Kitty",
  slug: "kitty",
  scheme: "kitty",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: applicationId,
    supportsTablet: true,
    associatedDomains: [`webcredentials:${rpId}`, `applinks:${rpId}`],
  },
  android: {
    package: applicationId,
    adaptiveIcon: {
      backgroundColor: "#25215E",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: rpId, pathPrefix: "/j/" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    ["expo-splash-screen", { image: "./assets/splash-icon.png", imageWidth: 200, backgroundColor: "#25215E" }],
    ["expo-secure-store", { faceIDPermission: "Unlock the circle account on this phone." }],
    "expo-notifications",
  ],
  extra: {
    rpId,
    siteUrl,
    // Sponsor endpoint lives on the same Vercel project as the site
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? siteUrl,
    contracts,
    eas: { projectId: "a2794367-b084-405b-b948-1b85ccf6c8fd" },
  },
};

export default config;
