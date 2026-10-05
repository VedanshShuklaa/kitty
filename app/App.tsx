import { BricolageGrotesque_500Medium } from "@expo-google-fonts/bricolage-grotesque/500Medium";
import { BricolageGrotesque_700Bold } from "@expo-google-fonts/bricolage-grotesque/700Bold";
import { BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque/800ExtraBold";
import { Figtree_400Regular } from "@expo-google-fonts/figtree/400Regular";
import { Figtree_500Medium } from "@expo-google-fonts/figtree/500Medium";
import { Figtree_700Bold } from "@expo-google-fonts/figtree/700Bold";
import { DefaultTheme, NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import type { Routes } from "./src/nav";
import { routeFor } from "./src/route";
import { BidScreen } from "./src/screens/BidScreen";
import { ClaimScreen } from "./src/screens/ClaimScreen";
import { CircleScreen } from "./src/screens/CircleScreen";
import { CreateScreen } from "./src/screens/CreateScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { JoinScreen } from "./src/screens/JoinScreen";
import { MeetCatScreen } from "./src/screens/MeetCatScreen";
import { MeScreen } from "./src/screens/MeScreen";
import { PasteScreen } from "./src/screens/PasteScreen";
import { ReceiveScreen } from "./src/screens/ReceiveScreen";
import { ScanScreen } from "./src/screens/ScanScreen";
import { SendScreen } from "./src/screens/SendScreen";
import { WelcomeScreen } from "./src/screens/WelcomeScreen";
import { SessionProvider, useSession } from "./src/session";
import { color, font } from "./src/theme";
import { KittyLogo } from "./src/Brand";

const Stack = createNativeStackNavigator<Routes>();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: color.paper, card: color.paper, text: color.indigo, primary: color.indigo },
};

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_500Medium,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_700Bold,
  });
  if (!fontsLoaded && !fontError) return <Loading />;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Root />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { status, touch, profile } = useSession();
  const nav = useNavigationContainerRef<Routes>();
  const [navReady, setNavReady] = useState(false);
  // FR-INV-04, FR-SND-01, FR-SND-08: a Kitty link opens its screen, after unlocking if needed
  const url = Linking.useURL();
  const [pending, setPending] = useState<string | null>(null);
  const signedIn = status === "ready" || status === "paused";

  useEffect(() => {
    if (url && routeFor(url)) setPending(url);
  }, [url]);

  useEffect(() => {
    const to = pending && routeFor(pending);
    if (signedIn && navReady && to) {
      nav.navigate(to.name, to.params as never);
      setPending(null);
    }
  }, [signedIn, navReady, pending, nav]);

  if (status === "loading") return <Loading />;

  if (!signedIn) {
    return (
      <>
        <StatusBar style="dark" />
        <WelcomeScreen />
      </>
    );
  }

  // every tap counts as activity for the idle limit (FR-SES-02)
  return (
    <View style={{ flex: 1 }} onTouchStart={touch}>
      {status === "paused" && <LockBar />}
      <NavigationContainer ref={nav} theme={theme} onReady={() => setNavReady(true)}>
        <StatusBar style="dark" />
        <Stack.Navigator
          // "Meet your cat" comes once, right after the passkey, until she has a name or the member skips it
          initialRouteName={profile?.catName === undefined ? "MeetCat" : "Home"}
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.paper }, animation: "slide_from_right" }}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="MeetCat" component={MeetCatScreen} />
          <Stack.Screen name="Create" component={CreateScreen} />
          <Stack.Screen name="Circle" component={CircleScreen} />
          <Stack.Screen name="Bid" component={BidScreen} options={{ presentation: "modal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="Join" component={JoinScreen} />
          <Stack.Screen name="Paste" component={PasteScreen} />
          <Stack.Screen name="Me" component={MeScreen} />
          <Stack.Screen name="Send" component={SendScreen} />
          <Stack.Screen name="Scan" component={ScanScreen} />
          <Stack.Screen name="Receive" component={ReceiveScreen} />
          <Stack.Screen name="Claim" component={ClaimScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

/** SRS 15.4: once the session ends the screens stay readable; signing waits for one unlock. */
function LockBar() {
  const { need } = useSession();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        paddingBottom: 8,
        paddingHorizontal: 16,
        backgroundColor: color.ink,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <Text style={{ flex: 1, color: color.paper, fontFamily: font.bodyMedium, fontSize: 15 }}>Locked. Unlock to make changes.</Text>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => {
          setBusy(true);
          need()
            .catch(() => {})
            .finally(() => setBusy(false));
        }}
        style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: color.pink, justifyContent: "center" }}
      >
        <Text style={{ color: color.paper, fontFamily: font.bodyMedium, fontSize: 15 }}>{busy ? "Unlocking…" : "Unlock"}</Text>
      </Pressable>
    </View>
  );
}

function Loading() {
  return <View style={{ flex: 1, backgroundColor: color.paper, alignItems: "center", justifyContent: "center", gap: 16 }}>
    <KittyLogo size={80} />
    <ActivityIndicator color={color.pink} />
    <Text style={{ color: color.ink, fontSize: 16 }}>Opening Kitty…</Text>
  </View>;
}
