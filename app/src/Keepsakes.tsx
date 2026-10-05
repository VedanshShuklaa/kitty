import { View } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

import { KEEPSAKES, type KeepsakeKind } from "./house";
import { color, font, radius, space } from "./theme";
import { Body, Small } from "./ui";

// "Feed the Kitty": milestones the cat keeps. Every one has a rule anyone can
// read, none is random, and none can be bought. Earned ones are in colour;
// the rest show greyed with their rule, so the way to each is never hidden.

function Art({ kind }: { kind: KeepsakeKind }) {
  switch (kind) {
    case "Yarn":
      return (
        <G>
          <Circle cx={15} cy={16} r={10} fill="#EC7BAD" />
          <Path d="M7,12 Q15,6 23,13 M6,17 Q15,11 24,18 M9,23 Q16,18 22,23" stroke="#AD245F" strokeWidth={1.5} fill="none" strokeLinecap="round" />
          <Path d="M24,21 Q30,25 26,29" stroke="#AD245F" strokeWidth={1.5} fill="none" strokeLinecap="round" />
        </G>
      );
    case "Wand":
      return (
        <G>
          <Path d="M6,28 L20,10" stroke="#8A5E4F" strokeWidth={2.2} strokeLinecap="round" />
          <Path d="M20,10 C23,2 31,3 28,10 C26,15 21,15 20,10 Z" fill="#7FBF9A" />
          <Path d="M20,10 L27,6" stroke="#4E9A5E" strokeWidth={1.2} strokeLinecap="round" />
        </G>
      );
    case "Fish":
      return (
        <G transform="translate(13 16)">
          <Ellipse rx={10} ry={6} fill="#A9B7C3" />
          <Path d="M8,0 L17,-6 L17,6 Z" fill="#A9B7C3" />
          <Circle cx={-5} cy={-1.5} r={1.4} fill={color.ink} />
        </G>
      );
    case "Box":
      return (
        <G>
          <Path d="M6,13 L2,8 L14,8 L16,13 Z M16,13 L18,8 L30,8 L26,13 Z" fill="#E2B07E" />
          <Rect x={6} y={13} width={20} height={14} fill="#D49A62" />
          <Path d="M16,13 V27" stroke="#B47A45" strokeWidth={1.5} />
        </G>
      );
    case "Gold":
      return (
        <G>
          <Path d="M5,15 L27,15 L23,25 L9,25 Z" fill="#E0B23F" />
          <Ellipse cx={16} cy={15} rx={11} ry={3} fill="#B8892A" />
          <Path d="M10,10 L11,7 M16,9 L16,5 M22,10 L21,7" stroke="#E0B23F" strokeWidth={1.6} strokeLinecap="round" />
        </G>
      );
  }
}

export function KeepsakeIcon({ kind, earned, size = 36 }: { kind: KeepsakeKind; earned: boolean; size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: 10, borderWidth: 1, borderColor: color.line, backgroundColor: color.surface, opacity: earned ? 1 : 0.35, padding: 2 }}
    >
      <Svg width="100%" height="100%" viewBox="0 0 32 32">
        <Art kind={kind} />
      </Svg>
    </View>
  );
}

/** Every keepsake with its rule; `earned` holds the kinds this account has. */
export function Keepsakes({ earned }: { earned: Set<string> }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {KEEPSAKES.map((k) => {
        const got = earned.has(k.kind);
        return (
          <View
            key={k.kind}
            accessible
            accessibilityLabel={`${k.name}: ${got ? "earned" : "not yet"}. ${k.rule}.`}
            style={{ flexBasis: "45%", flexGrow: 1, minWidth: 120, gap: space.sm, padding: space.md, borderRadius: radius.card, backgroundColor: got ? color.cream : color.surface, borderWidth: 1, borderColor: color.line }}
          >
            <KeepsakeIcon kind={k.kind} earned={got} size={52} />
            <View style={{ flex: 1 }}>
              <Body style={{ fontFamily: got ? font.bodyBold : font.body }}>{k.name}</Body>
              <Small>{k.rule}.</Small>
              <Small style={{ color: got ? color.leaf : color.slate, fontFamily: font.bodyBold, marginTop: space.sm }}>{got ? "Earned" : "Not yet"}</Small>
            </View>
          </View>
        );
      })}
    </View>
  );
}
