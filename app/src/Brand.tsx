import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, radius } from "./theme";

export function KittyLogo({ size = 48 }: { size?: number }) {
  return <Image source={require("../assets/kitty-logo.png")} accessibilityLabel="Kitty" style={{ width: size, height: size, borderRadius: size * 0.28 }} />;
}

/** Every destination stays labelled; there are no hidden swipe-only routes. */
export function BottomNav({ active, onHome, onJoin, onAccount }: {
  active: "Home" | "Account";
  onHome: () => void;
  onJoin: () => void;
  onAccount: () => void;
}) {
  const tabs = [
    { label: "Home", symbol: "⌂", press: onHome },
    { label: "Join circle", symbol: "+", press: onJoin },
    { label: "Account", symbol: "○", press: onAccount },
  ];
  return <View style={styles.nav}>
    {tabs.map((tab) => <Pressable key={tab.label} accessibilityRole="button" accessibilityLabel={tab.label}
      accessibilityState={{ selected: active === tab.label }} onPress={tab.press}
      style={({ pressed }) => [styles.tab, active === tab.label && styles.active, pressed && { opacity: 0.7 }]}>
      <Text accessible={false} style={[styles.symbol, active === tab.label && { color: color.pink }]}>{tab.symbol}</Text>
      <Text style={[styles.label, active === tab.label && { color: color.pink }]}>{tab.label}</Text>
    </Pressable>)}
  </View>;
}

const styles = StyleSheet.create({
  nav: { flexDirection: "row", padding: 5, gap: 4, backgroundColor: color.surface, borderRadius: radius.card, borderWidth: 1, borderColor: color.line },
  tab: { flex: 1, minHeight: 58, paddingVertical: 7, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", gap: 2, borderRadius: 17 },
  active: { backgroundColor: color.pinkSoft },
  symbol: { fontSize: 23, lineHeight: 25, color: color.slate, fontFamily: font.bodyMedium },
  label: { fontSize: 14, fontFamily: font.bodyBold, color: color.slate, textAlign: "center" },
});
