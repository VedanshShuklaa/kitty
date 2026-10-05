import { View } from "react-native";
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";
import type { Address } from "viem";

import { lookOf, STAGE_LINE, type Stage } from "./standing";
import { color } from "./theme";

// "Feed the Kitty": the member's cat, drawn from parts so the app grows by
// kilobytes. Her pose is her stage; her coat and markings come from the
// account address (KittyCats.lookOf), so every phone draws the same cat.
// Still pictures only: no continuous animation (UI_GUIDE.md).

const COATS = [
  { fur: "#E89A52", dark: "#B8642A" }, // ginger
  { fur: "#3E3439", dark: "#1F191C", eye: "#F2D46B" }, // black
  { fur: "#F3EEE8", dark: "#CFC4BA" }, // white
  { fur: "#9C9296", dark: "#6C6267" }, // grey
  { fur: "#B88A63", dark: "#7E5A3C" }, // brown tabby
  { fur: "#EAD7B5", dark: "#C6A97A" }, // cream
];

type Look = { fur: string; dark: string; eye?: string; pattern: number };
type Eyes = "open" | "wide" | "closed" | "narrow";

function Head({ x, y, r, look, eyes, flat }: { x: number; y: number; r: number; look: Look; eyes: Eyes; flat?: boolean }) {
  const ear = r * 0.75;
  // flat ears point out to the sides instead of up
  const left = flat
    ? `M${x - r * 0.55},${y - r * 0.55} L${x - r * 1.35},${y - r * 0.35} L${x - r * 0.85},${y + r * 0.05} Z`
    : `M${x - r * 0.85},${y - r * 0.2} L${x - r * 0.7},${y - r - ear * 0.55} L${x - r * 0.15},${y - r * 0.8} Z`;
  const right = flat
    ? `M${x + r * 0.55},${y - r * 0.55} L${x + r * 1.35},${y - r * 0.35} L${x + r * 0.85},${y + r * 0.05} Z`
    : `M${x + r * 0.85},${y - r * 0.2} L${x + r * 0.7},${y - r - ear * 0.55} L${x + r * 0.15},${y - r * 0.8} Z`;
  const ex = r * 0.38;
  const ey = y - r * 0.05;
  const eye = (cx: number) => {
    if (eyes === "closed") return <Path d={`M${cx - r * 0.16},${ey} Q${cx},${ey + r * 0.14} ${cx + r * 0.16},${ey}`} stroke={look.eye ?? color.ink} strokeWidth={r * 0.08} fill="none" strokeLinecap="round" />;
    if (eyes === "narrow") return <Line x1={cx - r * 0.15} y1={ey} x2={cx + r * 0.15} y2={ey} stroke={look.eye ?? color.ink} strokeWidth={r * 0.1} strokeLinecap="round" />;
    return <Circle cx={cx} cy={ey} r={eyes === "wide" ? r * 0.14 : r * 0.1} fill={look.eye ?? color.ink} />;
  };
  return (
    <G>
      <Path d={left} fill={look.fur} stroke={look.dark} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d={right} fill={look.fur} stroke={look.dark} strokeWidth={1.5} strokeLinejoin="round" />
      <Circle cx={x} cy={y} r={r} fill={look.fur} stroke={look.dark} strokeWidth={1.5} />
      {look.pattern === 1 && (
        <G stroke={look.dark} strokeWidth={r * 0.09} strokeLinecap="round">
          <Line x1={x} y1={y - r * 0.9} x2={x} y2={y - r * 0.55} />
          <Line x1={x - r * 0.28} y1={y - r * 0.85} x2={x - r * 0.22} y2={y - r * 0.55} />
          <Line x1={x + r * 0.28} y1={y - r * 0.85} x2={x + r * 0.22} y2={y - r * 0.55} />
        </G>
      )}
      {look.pattern === 2 && <Circle cx={x + ex} cy={ey - r * 0.05} r={r * 0.36} fill={look.dark} opacity={0.55} />}
      {eye(x - ex)}
      {eye(x + ex)}
      <Path d={`M${x - r * 0.1},${y + r * 0.22} L${x + r * 0.1},${y + r * 0.22} L${x},${y + r * 0.34} Z`} fill={color.pinkBright} />
      <G stroke={look.dark} strokeWidth={1} strokeLinecap="round">
        <Line x1={x - r * 0.3} y1={y + r * 0.35} x2={x - r * 1.05} y2={y + r * 0.25} />
        <Line x1={x - r * 0.3} y1={y + r * 0.42} x2={x - r * 1.0} y2={y + r * 0.5} />
        <Line x1={x + r * 0.3} y1={y + r * 0.35} x2={x + r * 1.05} y2={y + r * 0.25} />
        <Line x1={x + r * 0.3} y1={y + r * 0.42} x2={x + r * 1.0} y2={y + r * 0.5} />
      </G>
    </G>
  );
}

function Paw({ x, y, fill }: { x: number; y: number; fill: string }) {
  return (
    <G fill={fill}>
      <Ellipse cx={x} cy={y} rx={3.2} ry={2.6} />
      <Circle cx={x - 3.2} cy={y - 3.4} r={1.3} />
      <Circle cx={x} cy={y - 4.4} r={1.3} />
      <Circle cx={x + 3.2} cy={y - 3.4} r={1.3} />
    </G>
  );
}

function Pose({ stage, look }: { stage: Stage; look: Look }) {
  const floor = <Line x1={6} y1={92} x2={114} y2={92} stroke={color.line} strokeWidth={2} strokeLinecap="round" />;
  switch (stage) {
    case "Away":
      // the house is empty: pawprints lead out of the door
      return (
        <G>
          {floor}
          <Path d="M14,92 L14,52 L40,32 L66,52 L66,92" fill={color.surface} stroke={color.slate} strokeWidth={2} strokeLinejoin="round" />
          <Rect x={32} y={66} width={16} height={26} rx={3} fill={color.paper} stroke={color.slate} strokeWidth={2} />
          <Paw x={60} y={88} fill={color.slate} />
          <Paw x={76} y={82} fill={color.slate} />
          <Paw x={92} y={88} fill={color.slate} />
          <Paw x={106} y={82} fill={color.slate} />
        </G>
      );
    case "Wary":
      // low under the bench, ears flat, watching
      return (
        <G>
          {floor}
          <Rect x={18} y={50} width={84} height={8} rx={3} fill="#B88A63" />
          <Rect x={24} y={58} width={6} height={34} fill="#9A6F4C" />
          <Rect x={90} y={58} width={6} height={34} fill="#9A6F4C" />
          <Ellipse cx={66} cy={84} rx={20} ry={8} fill={look.fur} stroke={look.dark} strokeWidth={1.5} />
          <Head x={46} y={78} r={11} look={look} eyes="narrow" flat />
        </G>
      );
    case "Shy":
      // peeking out of her box
      return (
        <G>
          {floor}
          <Head x={60} y={52} r={17} look={look} eyes="wide" />
          <Rect x={30} y={58} width={60} height={34} rx={2} fill="#D8B48A" stroke="#A9825A" strokeWidth={2} />
          <Path d="M30,58 L20,48 M90,58 L100,48" stroke="#A9825A" strokeWidth={3} strokeLinecap="round" />
          <Line x1={30} y1={66} x2={90} y2={66} stroke="#A9825A" strokeWidth={1.5} />
        </G>
      );
    case "Friendly":
      // sitting up, tail straight up: a cat's hello
      return (
        <G>
          {floor}
          <Path d="M74,86 C92,84 92,60 88,34" stroke={look.dark} strokeWidth={6} fill="none" strokeLinecap="round" />
          <Ellipse cx={60} cy={74} rx={20} ry={19} fill={look.fur} stroke={look.dark} strokeWidth={1.5} />
          <Ellipse cx={52} cy={91} rx={6} ry={3} fill={look.fur} stroke={look.dark} strokeWidth={1.2} />
          <Ellipse cx={68} cy={91} rx={6} ry={3} fill={look.fur} stroke={look.dark} strokeWidth={1.2} />
          <Head x={60} y={44} r={17} look={look} eyes="open" />
        </G>
      );
    case "AtHome":
      // loafing on the cushion, slow-blinking
      return (
        <G>
          {floor}
          <Ellipse cx={60} cy={86} rx={44} ry={9} fill={color.pinkSoft} stroke={color.pinkBright} strokeWidth={2} />
          <Rect x={30} y={60} width={58} height={26} rx={13} fill={look.fur} stroke={look.dark} strokeWidth={1.5} />
          <Path d="M86,78 C100,80 100,70 94,66" stroke={look.dark} strokeWidth={5} fill="none" strokeLinecap="round" />
          <Head x={42} y={56} r={15} look={look} eyes="closed" />
        </G>
      );
    case "Family":
      // rolled over, belly up: complete trust
      return (
        <G>
          {floor}
          <Ellipse cx={64} cy={78} rx={30} ry={14} fill={look.fur} stroke={look.dark} strokeWidth={1.5} />
          <Ellipse cx={66} cy={74} rx={18} ry={7} fill={color.surface} opacity={0.85} />
          <Circle cx={52} cy={60} r={5} fill={look.fur} stroke={look.dark} strokeWidth={1.2} />
          <Circle cx={64} cy={58} r={5} fill={look.fur} stroke={look.dark} strokeWidth={1.2} />
          <Circle cx={78} cy={60} r={5} fill={look.fur} stroke={look.dark} strokeWidth={1.2} />
          <Path d="M94,80 C106,84 108,72 102,68" stroke={look.dark} strokeWidth={5} fill="none" strokeLinecap="round" />
          <Head x={30} y={76} r={15} look={look} eyes="closed" />
          <Path d="M96,38 l3,-6 l3,6 l-3,6 z" fill={color.pinkBright} />
        </G>
      );
  }
}

/**
 * The cat for an account at a stage. `label` defaults to the stage's
 * sentence; pass `hidden` when the same sentence is already on screen.
 */
export function Cat({ owner, stage, size = 120, hidden, label }: { owner: Address; stage: Stage; size?: number; hidden?: boolean; label?: string }) {
  const { coat, pattern } = lookOf(owner);
  const look = { ...COATS[coat], pattern };
  return (
    <View
      accessible={!hidden}
      accessibilityRole={hidden ? undefined : "image"}
      accessibilityLabel={hidden ? undefined : (label ?? STAGE_LINE[stage])}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "yes"}
      style={{ width: size, height: (size * 100) / 120, backgroundColor: color.cream, borderRadius: size * 0.18, overflow: "hidden" }}
    >
      <Svg width="100%" height="100%" viewBox="0 0 120 100">
        <Pose stage={stage} look={look} />
      </Svg>
    </View>
  );
}
