import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Children, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
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
export const Title = (p: TProps) => <Text accessibilityRole="header" {...p} style={[t.title, p.style]} />;
export const Heading = (p: TProps) => <Text accessibilityRole="header" {...p} style={[t.heading, p.style]} />;
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
  /** "row": a smaller button that sits inside a list row; still 48px tall */
  size?: "full" | "row";
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** What a screen reader says when the visible label alone is ambiguous (e.g. "Send" in a list of invites). */
  a11yLabel?: string;
};

// Press feedback: a quick ease-out squeeze on touch, a slightly slower release.
// Transform only, so it never moves layout; it is feedback, not decoration.
function usePressScale(to = 0.97) {
  const [scale] = useState(() => new Animated.Value(1));
  const go = (v: number, ms: number) =>
    Animated.timing(scale, { toValue: v, duration: ms, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: Platform.OS !== "web" }).start();
  return { scale, onPressIn: () => go(to, 100), onPressOut: () => go(1, 160) };
}

export function Button({ label, onPress, tone = "primary", size = "full", busy, disabled, style, a11yLabel }: ButtonProps) {
  const off = disabled || busy;
  const press = usePressScale();
  // the caller's style places the button; the squeeze wraps it so it never fights the press style
  return (
    <Animated.View style={[{ transform: [{ scale: press.scale }] }, style]}>
    <Pressable
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      aria-busy={!!busy}
      disabled={off}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      // flexGrow fills the wrapper, so paired buttons in a row share one height
      style={({ pressed }) => [b.base, b[tone], size === "row" && b.row, off && b.off, pressed && b.pressed, { flexGrow: 1 }]}
    >
      {busy && <ActivityIndicator color={tone === "quiet" ? color.pink : color.surface} />}
      <Text style={[b.label, tone !== "quiet" && { color: color.surface }]}>{busy ? "Please wait…" : label}</Text>
    </Pressable>
    </Animated.View>
  );
}

const b = StyleSheet.create({
  base: { minHeight: 56, borderRadius: radius.control, flexDirection: "row", gap: space.sm, alignItems: "center", justifyContent: "center", paddingHorizontal: space.md, paddingVertical: space.md },
  primary: { backgroundColor: color.pink },
  dark: { backgroundColor: color.indigo },
  quiet: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line },
  row: { minHeight: 48, paddingVertical: space.sm },
  off: { opacity: 0.45 },
  pressed: { opacity: 0.92 },
  label: { fontFamily: font.bodyBold, fontSize: 16, color: color.indigo, textAlign: "center", flexShrink: 1 },
});

// ----------------------------------------------------------------- screen

/** FR-APP-04: every screen carries a quiet testnet marker. */
export function TestnetMarker({ onIndigo }: { onIndigo?: boolean }) {
  // the dot centres on the first line, which grows with the system text size
  const { fontScale } = useWindowDimensions();
  return (
    <View style={s.marker} accessibilityLabel="Test dollars on Monad testnet">
      <View style={[s.markerDot, { marginTop: (16 * fontScale - 6) / 2 }]} />
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
  const { height, fontScale } = useWindowDimensions();
  // Short displays / large type need a scrolling footer instead of obscured content.
  const inlineFooter = height < 650 || fontScale > 1.3;
  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={s.frame} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={s.top}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={s.back}>
            <Ionicons name="chevron-back" size={22} color={color.ink} accessibilityElementsHidden importantForAccessibility="no" />
            <Text style={s.backText}>Back</Text>
          </Pressable>
        ) : (
          <TestnetMarker />
        )}
        {right}
      </View>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={color.indigo} /> : undefined
        }
      >
        {onBack && <TestnetMarker />}
        {children}
        {footer && inlineFooter && <View style={s.inlineFooter}>{footer}</View>}
      </ScrollView>
      {footer && !inlineFooter && <View style={s.footer}>{footer}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper },
  frame: { flex: 1, width: "100%", maxWidth: 600, alignSelf: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 48 },
  back: { minHeight: 48, paddingRight: space.md, marginLeft: -6, flexDirection: "row", alignItems: "center", gap: 2 },
  backText: { fontFamily: font.bodyBold, fontSize: 16, color: color.indigo },
  content: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.xl, gap: space.md },
  inlineFooter: { gap: space.sm, marginTop: space.sm },
  footer: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm, backgroundColor: color.paper, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  marker: { flexDirection: "row", alignItems: "flex-start", gap: 6, flexShrink: 1 },
  markerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.marigold },
  markerText: { fontFamily: font.bodyMedium, fontSize: 12, lineHeight: 16, color: color.slate, flexShrink: 1 },
});

// ------------------------------------------------------------------ input

/** The visible label above a field or a group of choices. */
export const Label = (p: TProps) => <Text {...p} style={[f.label, p.style]} />;

export function Field({ label, hint, prefix, ...rest }: TextInputProps & { label: string; hint?: string; prefix?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.xs }}>
      <Label>{label}</Label>
      <View style={[f.box, focused && { borderColor: color.pink, borderWidth: 2 }]}>
        {prefix && <Text style={f.prefix}>{prefix}</Text>}
        <TextInput placeholderTextColor={color.slate} accessibilityLabel={label} accessibilityHint={hint} {...rest}
          onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }} style={[f.input, rest.style]} />
      </View>
      {hint && <Small>{hint}</Small>}
    </View>
  );
}

const f = StyleSheet.create({
  label: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 20, color: color.ink },
  box: { flexDirection: "row", alignItems: "center", backgroundColor: color.surface, borderRadius: radius.control, borderWidth: 1, borderColor: color.line, paddingHorizontal: space.md },
  prefix: { fontFamily: font.display, fontSize: 20, color: color.slate, marginRight: 4 },
  input: { flex: 1, minWidth: 0, minHeight: 54, paddingVertical: 12, fontFamily: font.body, fontSize: 17, color: color.indigo },
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
            accessibilityState={{ checked: on }}
            aria-checked={on}
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
  pill: { minHeight: 48, justifyContent: "center", paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.control, borderWidth: 1, borderColor: color.line, backgroundColor: color.surface },
  on: { backgroundColor: color.pinkSoft, borderColor: color.pink },
  text: { fontFamily: font.bodyMedium, fontSize: 15, color: color.indigo },
  textOn: { color: color.pink, fontFamily: font.bodyBold },
});

export function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      aria-checked={value}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onChange(!value);
      }}
      style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm }}
    >
      <View style={[k.box, value && k.on]}>{value && <Ionicons name="checkmark" size={18} color={color.surface} accessibilityElementsHidden importantForAccessibility="no" />}</View>
      <Body style={{ flex: 1 }}>{label}</Body>
    </Pressable>
  );
}

const k = StyleSheet.create({
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: color.slate, alignItems: "center", justifyContent: "center", backgroundColor: color.surface },
  on: { backgroundColor: color.pink, borderColor: color.pink },
});

// ---------------------------------------------------------------- notices

/**
 * Every notice can be closed. A closed notice comes back only when its text
 * changes, so a new error after a dismissed one still shows.
 */
export function Notice({ tone, children, onClose }: { tone: "error" | "good" | "info"; children: ReactNode; onClose?: () => void }) {
  const bg = tone === "error" ? color.claySoft : tone === "good" ? color.leafSoft : color.indigoMist;
  const fg = tone === "error" ? color.clay : tone === "good" ? color.leaf : color.indigo;
  const text = Children.toArray(children).join("");
  const [closed, setClosed] = useState(false);
  useEffect(() => setClosed(false), [text]);
  if (closed) return null;
  return (
    <View
      style={{ backgroundColor: bg, borderRadius: radius.control, paddingVertical: space.md, paddingLeft: space.md, flexDirection: "row", alignItems: "flex-start" }}
      accessibilityLiveRegion="polite"
    >
      <Text style={{ flex: 1, fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 22, color: fg }} selectable>
        {children}
      </Text>
      <Pressable
        onPress={() => {
          setClosed(true);
          onClose?.();
        }}
        accessibilityRole="button"
        accessibilityLabel="Close this message"
        hitSlop={8}
        style={{ minWidth: 48, minHeight: 48, marginTop: -13, alignItems: "center", justifyContent: "center" }}
      >
        <Ionicons name="close" size={22} color={fg} accessibilityElementsHidden importantForAccessibility="no" />
      </Pressable>
    </View>
  );
}

export type StepState = "done" | "active" | "todo" | "failed";

/** A real sequence, so it is shown as one: each step waits for the last. */
export function Steps({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <View style={{ gap: space.md }}>
      {steps.map((st, i) => (
        <View
          key={st.label}
          accessible
          accessibilityLabel={`Step ${i + 1}, ${st.label}: ${{ done: "done", active: "in progress", todo: "not started", failed: "didn't go through" }[st.state]}`}
          style={{ flexDirection: "row", alignItems: "center", gap: space.md }}
        >
          <View
            style={[
              p.dot,
              st.state === "done" && { backgroundColor: color.leaf, borderColor: color.leaf },
              st.state === "failed" && { backgroundColor: color.clay, borderColor: color.clay },
              st.state === "active" && { borderColor: color.pink },
            ]}
          >
            {st.state === "active" ? (
              <ActivityIndicator size="small" color={color.pink} />
            ) : (
              st.state === "done" || st.state === "failed" ? (
                <Ionicons name={st.state === "done" ? "checkmark" : "alert"} size={20} color={color.surface} accessibilityElementsHidden importantForAccessibility="no" />
              ) : (
                <Text style={p.num}>{i + 1}</Text>
              )
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
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "baseline", justifyContent: "space-between" }}>
        <Heading>{title}</Heading>
        {right}
      </View>
      {children}
    </View>
  );
}

/** A group of rows on one surface, separated by hairlines. */
export function List({ children }: { children: ReactNode }) {
  return <View style={{ backgroundColor: color.surface, borderRadius: radius.card, borderWidth: 1, borderColor: color.line, overflow: "hidden" }}>{children}</View>;
}

/** A pressable row ends in a chevron; pass `external` when it leaves the app. */
export function Row({ children, onPress, last, external }: { children: ReactNode; onPress?: () => void; last?: boolean; external?: boolean }) {
  const style = [
    { flexDirection: "row" as const, alignItems: "center" as const, gap: space.md, paddingHorizontal: space.md, paddingVertical: 14 },
    !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  ];
  if (!onPress) return <View style={style}>{children}</View>;
  return (
    <Pressable accessibilityRole={external ? "link" : "button"} onPress={onPress} style={({ pressed }) => [style, pressed && { backgroundColor: color.pinkTile }]}>
      {children}
      <Ionicons name={external ? "open-outline" : "chevron-forward"} size={20} color={color.slate} accessibilityElementsHidden importantForAccessibility="no" />
    </Pressable>
  );
}

export function Bead({ label, tone = "indigo", size = 36 }: { label: string; tone?: "indigo" | "leaf" | "marigold" | "clay" | "mist" | "paper"; size?: number }) {
  // "paper" is for beads that sit on a pink panel, where "mist" would vanish
  const bg = { indigo: color.indigo, leaf: color.leaf, marigold: color.marigold, clay: color.clay, mist: color.indigoMist, paper: color.surface }[tone];
  const fg = tone === "marigold" || tone === "mist" || tone === "paper" ? color.indigo : color.surface;
  return (
    // initials beside a written name: decorative, so screen readers skip them
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ fontFamily: font.bodyBold, fontSize: size * 0.36, color: fg }}>{label}</Text>
    </View>
  );
}

export function Tag({ label, tone }: { label: string; tone: "leaf" | "clay" | "slate" | "marigold" }) {
  const fg = { leaf: color.leaf, clay: color.clay, slate: color.slate, marigold: color.pink }[tone];
  const bg = { leaf: color.leafSoft, clay: color.claySoft, slate: color.mist, marigold: color.marigoldSoft }[tone];
  return (
    <View style={{ maxWidth: "55%", flexShrink: 1, backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: space.xs }}>
      <Text style={{ fontFamily: font.bodyBold, fontSize: 14, lineHeight: 18, color: fg }}>{label}</Text>
    </View>
  );
}

/** A written count with a bar under it; the bar supplements the words, never replaces them. */
export function Progress({ value, total, label, onSoft }: { value: number; total: number; label: string; onSoft?: boolean }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: total, now: value }}
      style={{ height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: onSoft ? color.surface : color.line }}
    >
      <View style={{ height: 8, borderRadius: 4, width: `${pct}%`, backgroundColor: color.pink }} />
    </View>
  );
}

/** An underlined link out of the app (the public record), with a full-size touch target. */
export function LinkText({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={label} style={{ minHeight: 48, justifyContent: "center", alignSelf: "flex-start" }}>
      <Text style={[t.small, { color: color.ink, textDecorationLine: "underline" }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * The three surfaces screens group things on: "hero" for the one money
 * summary a screen leads with, "tile" for a quiet group, "outline" for a
 * white group that sits on the page (a code, a form section). Never nest them.
 */
export function Panel({ tone = "tile", children, style }: { tone?: "hero" | "tile" | "outline"; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[pn.base, pn[tone], style]}>{children}</View>;
}

const pn = StyleSheet.create({
  base: { gap: space.sm },
  hero: { backgroundColor: color.pinkSoft, borderRadius: radius.hero, padding: space.lg },
  tile: { backgroundColor: color.pinkTile, borderRadius: radius.card, padding: space.md },
  outline: { backgroundColor: color.surface, borderRadius: radius.card, borderWidth: 1, borderColor: color.line, padding: space.md },
});

/** Short labelled figures side by side (each round, people, deposit). They wrap; values are never truncated. */
export function Facts({ items }: { items: { label: string; value: string }[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.lg, rowGap: space.sm }}>
      {items.map((it) => (
        // four figures sit as a 2×2 grid; two or three share one line
        <View key={it.label} accessible accessibilityLabel={`${it.label}: ${it.value}`} style={{ minWidth: 72, maxWidth: "100%", flexShrink: 1, flexGrow: 1, flexBasis: items.length === 4 ? "40%" : undefined, gap: 2 }}>
          <Text style={[t.small, { color: color.indigoSoft }]}>{it.label}</Text>
          <Text style={[t.heading, { fontVariant: ["tabular-nums"] }]}>{it.value}</Text>
        </View>
      ))}
    </View>
  );
}
