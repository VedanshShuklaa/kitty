import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { color, font, radius, space } from "./theme";

// ------------------------------------------------------------------- type

type TProps = { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number; selectable?: boolean };

export const Display = (p: TProps) => <Text {...p} style={[t.display, p.style]} />;
export const Title = (p: TProps) => <Text {...p} style={[t.title, p.style]} />;
export const Heading = (p: TProps) => <Text {...p} style={[t.heading, p.style]} />;
export const Body = (p: TProps) => <Text {...p} style={[t.body, p.style]} />;
export const Small = (p: TProps) => <Text {...p} style={[t.small, p.style]} />;
export const Amount = (p: TProps) => <Text {...p} style={[t.amount, p.style]} />;

const t = StyleSheet.create({
  display: { fontFamily: font.displayHeavy, fontSize: 44, lineHeight: 46, color: color.indigo, letterSpacing: -1.2 },
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 31, color: color.indigo, letterSpacing: -0.5 },
  heading: { fontFamily: font.display, fontSize: 18, lineHeight: 24, color: color.indigo, letterSpacing: -0.2 },
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 24, color: color.indigo },
  small: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: color.slate },
  amount: { fontFamily: font.displayHeavy, fontSize: 40, lineHeight: 44, color: color.indigo, letterSpacing: -1, fontVariant: ["tabular-nums"] },
});

// ----------------------------------------------------------------- button

type ButtonProps = {
  label: string;
  onPress: () => void;
  tone?: "primary" | "dark" | "quiet";
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, tone = "primary", busy, disabled, style }: ButtonProps) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      disabled={off}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [b.base, b[tone], off && b.off, pressed && b.pressed, style]}
    >
      {busy ? (
        <ActivityIndicator color={tone === "dark" ? color.onIndigo : color.indigo} />
      ) : (
        <Text style={[b.label, tone === "dark" && { color: color.onIndigo }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const b = StyleSheet.create({
  base: { minHeight: 56, borderRadius: radius.control, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg },
  primary: { backgroundColor: color.marigold },
  dark: { backgroundColor: color.indigo },
  quiet: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: color.line, minHeight: 50 },
  off: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
  label: { fontFamily: font.bodyBold, fontSize: 17, color: color.indigo },
});

// ----------------------------------------------------------------- screen

/** FR-APP-04: every screen carries a quiet testnet marker. */
export function TestnetMarker({ onIndigo }: { onIndigo?: boolean }) {
  return (
    <View style={s.marker} accessibilityLabel="Test dollars on Monad testnet">
      <View style={s.markerDot} />
      <Text style={[s.markerText, onIndigo && { color: color.onIndigoMuted }]}>Test dollars on Monad testnet</Text>
    </View>
  );
}

type ScreenProps = {
  children: ReactNode;
  footer?: ReactNode;
  onBack?: () => void;
  right?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
};

export function Screen({ children, footer, onBack, right, refreshing, onRefresh }: ScreenProps) {
  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <View style={s.top}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={s.back}>
            <Text style={s.backText}>‹ Back</Text>
          </Pressable>
        ) : (
          <TestnetMarker />
        )}
        {right}
      </View>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={color.indigo} /> : undefined
        }
      >
        {onBack && <TestnetMarker />}
        {children}
      </ScrollView>
      {footer && <View style={s.footer}>{footer}</View>}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 48 },
  back: { paddingVertical: space.xs },
  backText: { fontFamily: font.bodyBold, fontSize: 16, color: color.indigo },
  content: { paddingHorizontal: space.md, paddingBottom: space.xl, gap: space.md },
  footer: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm, backgroundColor: color.paper, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  marker: { flexDirection: "row", alignItems: "center", gap: 6 },
  markerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.marigold },
  markerText: { fontFamily: font.bodyMedium, fontSize: 12, color: color.slate },
});

// ------------------------------------------------------------------ input

export function Field({ label, hint, prefix, ...rest }: TextInputProps & { label: string; hint?: string; prefix?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={f.label}>{label}</Text>
      <View style={f.box}>
        {prefix && <Text style={f.prefix}>{prefix}</Text>}
        <TextInput placeholderTextColor={color.slate} {...rest} style={[f.input, rest.style]} />
      </View>
      {hint && <Small>{hint}</Small>}
    </View>
  );
}

const f = StyleSheet.create({
  label: { fontFamily: font.bodyMedium, fontSize: 15, color: color.indigo },
  box: { flexDirection: "row", alignItems: "center", backgroundColor: color.surface, borderRadius: radius.control, borderWidth: 1, borderColor: color.line, paddingHorizontal: space.md },
  prefix: { fontFamily: font.display, fontSize: 20, color: color.slate, marginRight: 4 },
  input: { flex: 1, minHeight: 52, fontFamily: font.body, fontSize: 17, color: color.indigo },
});

export function Choice<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={c.row} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            style={[c.pill, on && c.on]}
          >
            <Text style={[c.text, on && c.textOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const c = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, backgroundColor: color.surface },
  on: { backgroundColor: color.indigo, borderColor: color.indigo },
  text: { fontFamily: font.bodyMedium, fontSize: 15, color: color.indigo },
  textOn: { color: color.onIndigo },
});

export function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs }}
    >
      <View style={[k.box, value && k.on]}>{value && <Text style={k.tick}>✓</Text>}</View>
      <Body style={{ flex: 1 }}>{label}</Body>
    </Pressable>
  );
}

const k = StyleSheet.create({
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: color.slate, alignItems: "center", justifyContent: "center", backgroundColor: color.surface },
  on: { backgroundColor: color.indigo, borderColor: color.indigo },
  tick: { color: color.onIndigo, fontFamily: font.bodyBold, fontSize: 14, lineHeight: 16 },
});

// ---------------------------------------------------------------- notices

export function Notice({ tone, children }: { tone: "error" | "good" | "info"; children: ReactNode }) {
  const bg = tone === "error" ? color.claySoft : tone === "good" ? color.leafSoft : color.indigoMist;
  const fg = tone === "error" ? color.clay : tone === "good" ? color.leaf : color.indigo;
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.control, padding: space.md }} accessibilityLiveRegion="polite">
      <Text style={{ fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 22, color: fg }} selectable>
        {children}
      </Text>
    </View>
  );
}

export type StepState = "done" | "active" | "todo" | "failed";

/** A real sequence, so it is shown as one: each step waits for the last. */
export function Steps({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <View style={{ gap: space.md }}>
      {steps.map((st, i) => (
        <View key={st.label} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View
            style={[
              p.dot,
              st.state === "done" && { backgroundColor: color.leaf, borderColor: color.leaf },
              st.state === "failed" && { backgroundColor: color.clay, borderColor: color.clay },
              st.state === "active" && { borderColor: color.marigold },
            ]}
          >
            {st.state === "active" ? (
              <ActivityIndicator size="small" color={color.indigo} />
            ) : (
              <Text style={[p.num, (st.state === "done" || st.state === "failed") && { color: color.surface }]}>
                {st.state === "done" ? "✓" : st.state === "failed" ? "!" : i + 1}
              </Text>
            )}
          </View>
          <Body style={[{ flex: 1 }, st.state === "todo" && { color: color.slate }]}>{st.label}</Body>
        </View>
      ))}
    </View>
  );
}

const p = StyleSheet.create({
  dot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: color.line, alignItems: "center", justifyContent: "center", backgroundColor: color.surface },
  num: { fontFamily: font.bodyBold, fontSize: 14, color: color.slate },
});

// ------------------------------------------------------------------- misc

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ gap: space.sm, marginTop: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Heading>{title}</Heading>
        {right}
      </View>
      {children}
    </View>
  );
}

/** A group of rows on one surface, separated by hairlines. */
export function List({ children }: { children: ReactNode }) {
  return <View style={{ backgroundColor: color.surface, borderRadius: radius.card, overflow: "hidden" }}>{children}</View>;
}

export function Row({ children, onPress, last }: { children: ReactNode; onPress?: () => void; last?: boolean }) {
  const style = [
    { flexDirection: "row" as const, alignItems: "center" as const, gap: space.md, paddingHorizontal: space.md, paddingVertical: 14 },
    !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  ];
  if (!onPress) return <View style={style}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [style, pressed && { backgroundColor: color.paper }]}>
      {children}
    </Pressable>
  );
}

export function Bead({ label, tone = "indigo", size = 36 }: { label: string; tone?: "indigo" | "leaf" | "marigold" | "clay" | "mist"; size?: number }) {
  const bg = { indigo: color.indigo, leaf: color.leaf, marigold: color.marigold, clay: color.clay, mist: color.indigoMist }[tone];
  const fg = tone === "marigold" || tone === "mist" ? color.indigo : color.surface;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: font.bodyBold, fontSize: size * 0.36, color: fg }}>{label}</Text>
    </View>
  );
}

export function Tag({ label, tone }: { label: string; tone: "leaf" | "clay" | "slate" | "marigold" }) {
  const fg = { leaf: color.leaf, clay: color.clay, slate: color.slate, marigold: "#8A5A00" }[tone];
  const bg = { leaf: color.leafSoft, clay: color.claySoft, slate: color.paper, marigold: color.marigoldSoft }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ fontFamily: font.bodyBold, fontSize: 13, color: fg }}>{label}</Text>
    </View>
  );
}
