import { useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from "react-native";

import { color, font } from "./theme";

// The circle, drawn as what it is: one bead per seat around a ring, the pot
// in the middle. Paid beads fill in; the bead whose turn it is wears gold.

export type BeadTone = "paid" | "waiting" | "late" | "empty" | "out";
export type RingBead = { label: string; tone: BeadTone; turn?: boolean; received?: boolean };

export function Ring({ beads, size = 272, children }: { beads: RingBead[]; size?: number; children?: ReactNode }) {
  const n = Math.max(beads.length, 1);
  const bead = n <= 6 ? 48 : n <= 9 ? 40 : 34;
  const r = size / 2 - bead / 2 - 6;
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.track, { left: size / 2 - r, top: size / 2 - r, width: r * 2, height: r * 2, borderRadius: r }]} />
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        {children}
      </View>
      {beads.map((b, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = size / 2 + r * Math.cos(angle) - bead / 2;
        const y = size / 2 + r * Math.sin(angle) - bead / 2;
        return <RingBeadView key={i} bead={b} size={bead} x={x} y={y} />;
      })}
    </View>
  );
}

function RingBeadView({ bead, size, x, y }: { bead: RingBead; size: number; x: number; y: number }) {
  // The one motion in the app: a bead pops when it fills in.
  const scale = useRef(new Animated.Value(1)).current;
  const prev = useRef(bead.tone);
  useEffect(() => {
    if (prev.current !== "paid" && bead.tone === "paid") {
      AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
        if (reduce) return;
        scale.setValue(0.6);
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }).start();
      });
    }
    prev.current = bead.tone;
  }, [bead.tone, scale]);

  const fill =
    bead.tone === "paid" ? color.leaf : bead.tone === "late" ? color.clay : bead.tone === "out" ? color.indigoSoft : "transparent";
  const border = bead.tone === "waiting" || bead.tone === "empty" ? color.onIndigoMuted : fill;
  const text = bead.tone === "out" || bead.tone === "empty" ? color.onIndigoMuted : color.onIndigo;

  return (
    <Animated.View style={{ position: "absolute", left: x, top: y, width: size, height: size, transform: [{ scale }] }}>
      {bead.turn && <View style={[styles.halo, { borderRadius: (size + 10) / 2, width: size + 10, height: size + 10 }]} />}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: fill,
          borderWidth: 2,
          borderColor: bead.turn ? color.marigold : border,
          borderStyle: bead.tone === "empty" ? "dashed" : "solid",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontFamily: font.bodyBold, fontSize: size * 0.34, color: text }}>{bead.label}</Text>
      </View>
      {bead.received && <View style={[styles.badge, { right: -1, top: -1 }]} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: { position: "absolute", borderWidth: 1.5, borderColor: "rgba(169,166,214,0.35)" },
  center: { alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute", left: -5, top: -5, borderWidth: 2, borderColor: "rgba(242,178,51,0.45)" },
  badge: { position: "absolute", width: 12, height: 12, borderRadius: 6, backgroundColor: color.marigold, borderWidth: 2, borderColor: color.indigo },
});

/** Small static ring for lists: no labels, just who has paid. */
export function MiniRing({ tones, turn }: { tones: BeadTone[]; turn?: number }) {
  const size = 52;
  const n = Math.max(tones.length, 1);
  const d = 10;
  const r = (size / 2 - d / 2 - 1) * 0.72;
  return (
    <View style={{ width: size, height: size, backgroundColor: color.indigo, borderRadius: size / 2 }}>
      {tones.map((tone, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const bg = i === turn ? color.marigold : tone === "paid" ? color.leaf : tone === "late" ? color.clay : "transparent";
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              left: size / 2 + r * Math.cos(a) - d / 2,
              top: size / 2 + r * Math.sin(a) - d / 2,
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: bg,
              borderWidth: bg === "transparent" ? 1.5 : 0,
              borderColor: color.onIndigoMuted,
            }}
          />
        );
      })}
    </View>
  );
}
