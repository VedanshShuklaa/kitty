import {
  BricolageGrotesque_500Medium,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from "@expo-google-fonts/bricolage-grotesque";
import { Figtree_400Regular, Figtree_500Medium, Figtree_700Bold } from "@expo-google-fonts/figtree";
import { DefaultTheme, NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { parseInvite } from "./src/links";
import type { Routes } from "./src/nav";
import { BidScreen } from "./src/screens/BidScreen";
import { CircleScreen } from "./src/screens/CircleScreen";
import { CreateScreen } from "./src/screens/CreateScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { JoinScreen } from "./src/screens/JoinScreen";
import { MeScreen } from "./src/screens/MeScreen";
import { PasteScreen } from "./src/screens/PasteScreen";
import { WelcomeScreen } from "./src/screens/WelcomeScreen";
import { SessionProvider, useSession } from "./src/session";
import { color } from "./src/theme";

const Stack = createNativeStackNavigator<Routes>();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: color.paper, card: color.paper, text: color.indigo, primary: color.indigo },
};

export default function App() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_500Medium,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_700Bold,
  });
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: color.indigo }} />;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Root />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { status } = useSession();
  const nav = useNavigationContainerRef<Routes>();
  const [navReady, setNavReady] = useState(false);
  // FR-INV-04: an invite link opens the join screen, after unlocking if needed
  const url = Linking.useURL();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (url && parseInvite(url)) setPending(url);
  }, [url]);

  useEffect(() => {
    if (status === "ready" && navReady && pending) {
      nav.navigate("Join", { link: pending });
      setPending(null);
    }
  }, [status, navReady, pending, nav]);

  if (status === "loading") return <View style={{ flex: 1, backgroundColor: color.indigo }} />;

  if (status !== "ready") {
    return (
      <>
        <StatusBar style="light" />
        <WelcomeScreen />
      </>
    );
  }

  return (
    <NavigationContainer ref={nav} theme={theme} onReady={() => setNavReady(true)}>
      <StatusBar style="dark" />
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.paper }, animation: "slide_from_right" }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Create" component={CreateScreen} />
        <Stack.Screen name="Circle" component={CircleScreen} />
        <Stack.Screen name="Bid" component={BidScreen} options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="Join" component={JoinScreen} />
        <Stack.Screen name="Paste" component={PasteScreen} />
        <Stack.Screen name="Me" component={MeScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
