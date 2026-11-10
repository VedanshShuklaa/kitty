import Ionicons from "@expo/vector-icons/Ionicons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, radius, space } from "./theme";

export function KittyLogo({ size = 48 }: { size?: number }) {
  return <Image source={require("../assets/kitty-logo.png")} accessibilityLabel="Kitty" style={{ width: size, height: size, borderRadius: size * 0.28 }} />;
}

export function KittyWordmark() {
  return <View style={styles.wordmark} accessible accessibilityLabel="Kitty">
    <KittyLogo size={36} />
    <Text style={styles.wordmarkText}>kitty</Text>
  </View>;
}

/** Every destination stays labelled; there are no hidden swipe-only routes. */
export function BottomNav({ active, onHome, onJoin, onAccount }: {
  active: "Home" | "Account";
  onHome: () => void;
  onJoin: () => void;
  onAccount: () => void;
}) {
  const tabs = [
    { label: "Home", icon: "home", press: onHome },
    { label: "Join circle", icon: "add-circle", press: onJoin },
    { label: "Account", icon: "person-circle", press: onAccount },
  ] as const;
  return <View style={styles.nav} accessibilityRole="tablist">
    {tabs.map((tab) => {
      const on = active === tab.label;
      return <Pressable key={tab.label} accessibilityRole="tab" accessibilityLabel={tab.label}
        accessibilityState={{ selected: on }} aria-selected={on} onPress={tab.press}
        style={({ pressed }) => [styles.tab, on && styles.active, pressed && { opacity: 0.7 }]}>
        <Ionicons name={on ? tab.icon : `${tab.icon}-outline`} size={24} color={on ? color.pink : color.slate}
          accessibilityElementsHidden importantForAccessibility="no" />
        <Text style={[styles.label, on && { color: color.pink }]}>{tab.label}</Text>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  wordmark: { flexDirection: "row", alignItems: "center", gap: space.sm },
  wordmarkText: { fontFamily: font.displayHeavy, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, color: color.ink },
  nav: { flexDirection: "row", padding: space.xs, gap: space.sm, backgroundColor: color.surface },
  tab: { flex: 1, minHeight: 56, paddingVertical: space.sm, paddingHorizontal: space.xs, alignItems: "center", justifyContent: "center", gap: 2, borderRadius: radius.control },
  active: { backgroundColor: color.pinkSoft },
  label: { fontSize: 14, fontFamily: font.bodyBold, color: color.slate, textAlign: "center" },
});
