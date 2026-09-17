import type { ExpoConfig } from "expo/config";

const rpId = process.env.EXPO_PUBLIC_RP_ID ?? "kitty-circle.xyz";
const applicationId = "xyz.kitty.app";

const config: ExpoConfig = {
  name: "Kitty",
  slug: "kitty",
  scheme: "kitty",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: applicationId,
    supportsTablet: true,
    associatedDomains: [`webcredentials:${rpId}`, `applinks:${rpId}`],
  },
  android: {
    package: applicationId,
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
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
    ["expo-secure-store", { faceIDPermission: "Unlock the circle account on this phone." }],
    "expo-notifications",
  ],
  extra: { rpId },
};

export default config;
