import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import type { Address } from "viem";

import { lookOf, stageLine, type Bowl, type Stage } from "./standing";
import { color } from "./theme";

// Logo-inspired, local vector artwork. Coat/pattern stay deterministic per account.
// All poses share the same face, paws and proportions, including house residents.
// Separate fur, muzzle, markings and facial ink: dark coats must not use
// one pale colour for every feature. Eye patches stay quieter than the eyes.
type Coat = {
  fur: string; light: string; muzzle: string; shade: string; dark: string;
  ear: string; eye: string; lid: string; pupil: string | null;
  nose: string; whisker: string; patch: string; blush: string;
};
const COATS: readonly Coat[] = [
  { fur: "#EC7CAB", light: "#F6ADCB", muzzle: "#FBD2E2", shade: "#D76094", dark: "#A72058", ear: "#FAC5DD", eye: "#92204D", lid: "#92204D", pupil: null, nose: "#A72058", whisker: "#9E2859", patch: "#F1A0C3", blush: "#DC5B94" },
  { fur: "#DEBD90", light: "#EAD3B3", muzzle: "#FAEDDA", shade: "#CBA575", dark: "#896345", ear: "#EAB7B8", eye: "#67442F", lid: "#67442F", pupil: null, nose: "#AA6370", whisker: "#8D6950", patch: "#EACEA8", blush: "#DA9B9C" },
  { fur: "#906957", light: "#B68B74", muzzle: "#E5C1AA", shade: "#755142", dark: "#59382F", ear: "#DEA3AD", eye: "#34292A", lid: "#34292A", pupil: null, nose: "#9B5361", whisker: "#513A35", patch: "#AD8471", blush: "#C17F83" },
  { fur: "#969CAF", light: "#BAC0D0", muzzle: "#E5E6ED", shade: "#7A829A", dark: "#5A627B", ear: "#D9AABD", eye: "#38435D", lid: "#38435D", pupil: null, nose: "#A56383", whisker: "#535C77", patch: "#AFB5C7", blush: "#C18DAB" },
  { fur: "#E7A066", light: "#F1BE8E", muzzle: "#FCE0BB", shade: "#CF8248", dark: "#A06135", ear: "#F0BAAC", eye: "#704327", lid: "#704327", pupil: null, nose: "#B5696D", whisker: "#915C39", patch: "#F0BB89", blush: "#DF9580" },
  { fur: "#343B53", light: "#65738F", muzzle: "#B4BFD3", shade: "#272E44", dark: "#303A53", ear: "#BD93B0", eye: "#EBC47B", lid: "#CDD7E9", pupil: "#232C42", nose: "#A85F83", whisker: "#9BAAC6", patch: "#52617E", blush: "#B884A9" },
];
export type Look = Coat & { pattern: number };
export function lookFor(owner: Address): Look {
  const { coat, pattern } = lookOf(owner);
  return { ...COATS[coat], pattern };
}
type Eyes = "open" | "wide" | "closed" | "happy" | "narrow";
export type CatMood = "settled" | "waiting" | "fed" | "late" | "covered";

/** Face proportions echo the logo: broad cheeks, rounded ears, muzzle and smile. */
export function Head({ x, y, r, look: c, eyes, flat = false, tilt = false }: {
  x: number; y: number; r: number; look: Look; eyes: Eyes; flat?: boolean; tilt?: boolean;
}) {
  const eye = (cx: number) => {
    if (eyes === "happy") return <Path d={`M${cx - 5.7},-1 Q${cx},-10 ${cx + 5.7},-1`} fill="none" stroke={c.lid} strokeWidth={3} strokeLinecap="round" />;
    if (eyes === "closed") return <Path d={`M${cx - 5.7},-2 Q${cx},3 ${cx + 5.7},-2`} fill="none" stroke={c.lid} strokeWidth={2.6} strokeLinecap="round" />;
    const narrow = eyes === "narrow";
    return <G>
      <Ellipse cx={cx} cy={-2} rx={eyes === "wide" ? 4.6 : 4} ry={narrow ? 3 : 5.4} fill={c.eye} />
      {c.pupil && <Ellipse cx={cx} cy={-2} rx={1.8} ry={narrow ? 2.4 : 4.3} fill={c.pupil} />}
      <Circle cx={cx + 1.3} cy={narrow ? -3 : -4} r={narrow ? 0.8 : 1.15} fill={color.surface} />
      {narrow && <Path d={cx < 0 ? "M-18,-10 Q-14,-10 -9,-13" : "M18,-10 Q14,-10 9,-13"} fill="none" stroke={c.lid} strokeWidth={1.7} strokeLinecap="round" />}
    </G>;
  };
  return <G transform={`translate(${x} ${y}) scale(${r / 33})`}>
    <G transform={`rotate(${flat ? -48 : -5} -20 -15)`}>
      <Path d="M-29,-7 Q-34,-25 -28,-43 Q-26,-48 -8,-27 Z" fill={c.fur} />
      <Path d="M-26,-20 Q-28,-29 -26,-36 Q-20,-34 -14,-27 Z" fill={c.ear} />
    </G>
    <G transform={`rotate(${flat ? 48 : tilt ? 24 : 5} 20 -15)`}>
      <Path d="M29,-7 Q34,-25 28,-43 Q26,-48 8,-27 Z" fill={c.fur} />
      <Path d="M26,-20 Q28,-29 26,-36 Q20,-34 14,-27 Z" fill={c.ear} />
    </G>
    <Path d="M-34,-4 C-34,-24 -18,-31 0,-29 C18,-31 34,-24 34,-4 C38,17 20,27 0,27 C-20,27 -38,17 -34,-4Z" fill={c.fur} />
    {c.pattern === 1 && <Path d="M-9,-24 L-7,-17 M0,-27 V-17 M9,-24 L7,-17" stroke={c.shade} strokeWidth={3.4} strokeLinecap="round" />}
    {c.pattern === 2 && <Path d="M7,-28 C20,-28 30,-20 31,-8 C32,3 24,9 15,6 C6,3 4,-11 7,-28Z" fill={c.patch} />}
    <Ellipse cy={12} rx={17} ry={10} fill={c.muzzle} />
    <Ellipse cx={-25} cy={9} rx={4.5} ry={2.7} fill={c.blush} opacity={0.45} />
    <Ellipse cx={25} cy={9} rx={4.5} ry={2.7} fill={c.blush} opacity={0.45} />
    {eye(-12.5)}{eye(12.5)}
    {eyes === "happy" && <Path d="M-17,-14 Q-13,-17 -9,-14 M9,-14 Q13,-17 17,-14" fill="none" stroke={c.lid} opacity={0.55} strokeWidth={1.6} strokeLinecap="round" />}
    <Path d="M-3.6,6 Q0,4 3.6,6 Q4,7.5 0,10 Q-4,7.5 -3.6,6Z" fill={c.nose} />
    <Path d="M0,10 V12 M-6.5,12 C-6.5,18 0,18 0,12 C0,18 6.5,18 6.5,12" stroke={c.dark} strokeWidth={1.9} fill="none" strokeLinecap="round" />
    <Path d="M-24,8 Q-32,5 -39,6 M-25,12 L-39,14 M-23,16 L-35,22 M24,8 Q32,5 39,6 M25,12 L39,14 M23,16 L35,22" stroke={c.whisker} strokeWidth={1.7} fill="none" strokeLinecap="round" />
  </G>;
}

export function faceFor(stage: Stage): { eyes: Eyes; flat: boolean } {
  return { eyes: stage === "Wary" || stage === "Away" ? "narrow" : stage === "Shy" ? "wide" : stage === "AtHome" ? "closed" : "happy", flat: stage === "Wary" || stage === "Away" };
}

function Paws({ look: c, y = -5 }: { look: Look; y?: number }) {
  return <G transform={`translate(0 ${y})`}>
    <Ellipse cx={-11} cy={1} rx={10.5} ry={7} fill={c.shade} /><Ellipse cx={11} cy={1} rx={10.5} ry={7} fill={c.shade} />
    <Ellipse cx={-11} cy={-1} rx={10.5} ry={6.5} fill={c.fur} /><Ellipse cx={11} cy={-1} rx={10.5} ry={6.5} fill={c.fur} />
    <Path d="M-15,-2 Q-13,0 -14,3 M-9,-2 Q-7,0 -8,3 M9,-2 Q7,0 8,3 M15,-2 Q13,0 14,3" fill="none" stroke={c.shade} strokeWidth={1.4} strokeLinecap="round" />
  </G>;
}
function RaisedPaw({ x, y, angle, look: c }: { x: number; y: number; angle: number; look: Look }) {
  return <G transform={`translate(${x} ${y}) rotate(${angle})`}>
    <Ellipse rx={6.7} ry={8} fill={c.fur} />
    <Ellipse cy={1} rx={3} ry={3.3} fill={c.ear} />
    <Circle cx={-3} cy={-3.3} r={1.3} fill={c.ear} /><Circle cy={-4.7} r={1.3} fill={c.ear} /><Circle cx={3} cy={-3.3} r={1.3} fill={c.ear} />
  </G>;
}
export function Pawprint({ x, y }: { x: number; y: number }) {
  return <G transform={`translate(${x} ${y}) rotate(55)`} fill="#BC987D">
    <Path d="M-4,2 Q-7,-2 -3,-4 Q0,-7 3,-4 Q7,-2 4,2 Q0,0 -4,2Z" />
    <Ellipse cx={-5} cy={-7} rx={1.8} ry={2.5} /><Ellipse cy={-10} rx={1.8} ry={2.5} /><Ellipse cx={5} cy={-7} rx={1.8} ry={2.5} />
  </G>;
}
function Box() {
  return <G>
    <Path d="M-39,-40 L-51,-55 L-9,-55 L0,-40 L9,-55 L51,-55 L39,-40Z" fill="#E8BE94" />
    <Path d="M-39,-40 H39 V2 Q0,7 -39,2Z" fill="#D5A373" />
    <Path d="M0,-40 V4 M-39,-40 H39" stroke="#B9875D" strokeWidth={1.5} />
    <Rect x={-5} y={-40} width={10} height={12} fill="#F4D4AD" />
    <Path d="M-24,-21 L-18,-26 L-12,-21 M-18,-26 V-12" fill="none" stroke="#95613D" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </G>;
}

/** Stage pose, anchored at the floor at (0, 0). Shared with the circle house. */
export function CatArt({ stage, look: c, mood = "settled", petted = false }: { stage: Stage; look: Look; mood?: CatMood; petted?: boolean }) {
  const f = faceFor(stage);
  const eyes = petted ? "happy" : stage === "Wary" ? "narrow" : mood === "covered" ? "narrow" : mood === "waiting" ? "wide" : mood === "fed" ? "happy" : mood === "late" ? "closed" : f.eyes;
  const flat = f.flat || mood === "covered";
  const head = (x: number, y: number, r = 33) => <Head x={x} y={y} r={r} look={c} eyes={eyes} flat={flat} tilt={mood === "late"} />;
  const cushion = <G><Ellipse cy={1} rx={57} ry={11} fill="#CF548C" /><Ellipse cy={-3} rx={51} ry={8} fill="#EEA2C3" /><Path d="M-45,2 Q0,14 45,2" fill="none" stroke="#AD245F" opacity={0.35} strokeWidth={1.5} strokeDasharray="3 4" /></G>;
  return <G>
    <Ellipse cy={5} rx={stage === "Family" ? 69 : 47} ry={6} fill={color.ink} opacity={0.06} />
    {stage === "Away" ? <G><Box /><Pawprint x={49} y={0} /><Pawprint x={64} y={8} /></G> :
      stage === "Shy" ? <G>
        <Path d="M34,-8 C52,-10 60,-29 48,-39" fill="none" stroke={c.shade} strokeWidth={8} strokeLinecap="round" />
        {head(0, -63)}<Box /><G transform="translate(0 -40) scale(.78)"><Paws look={c} y={0} /></G>
      </G> : stage === "Friendly" ? <G>
        <Path d="M24,-12 C45,-16 43,-37 42,-62 Q40,-79 50,-73" fill="none" stroke={c.shade} strokeWidth={9} strokeLinecap="round" />
        <Path d="M-22,-40 Q0,-54 22,-40 C30,-28 35,-10 25,-3 Q0,5 -25,-3 C-35,-10 -30,-28 -22,-40Z" fill={c.fur} />
        <Ellipse cx={-23} cy={-10} rx={9} ry={10} fill={c.fur} /><Ellipse cx={23} cy={-10} rx={9} ry={10} fill={c.fur} />
        <Path d="M-13,-32 Q0,-37 13,-32 C12,-24 11,-16 6,-13 Q0,-10 -6,-13 C-11,-16 -12,-24 -13,-32Z" fill={c.light} />
        <Path d="M-15,-22 L-14,-7 M15,-22 L14,-7" stroke={c.shade} opacity={0.7} strokeWidth={1.3} strokeLinecap="round" />
        {c.pattern === 1 && <Path d="M-29,-17 L-23,-15 M29,-17 L23,-15" stroke={c.shade} strokeWidth={2.5} strokeLinecap="round" />}
        <Paws look={c} y={-4} />{head(0, -60)}
      </G> : stage === "Family" ? <G>
        {cushion}
        <Path d="M45,-10 C67,-6 70,-24 61,-29" stroke={c.shade} fill="none" strokeWidth={8} strokeLinecap="round" />
        {/* Far legs sit behind the body; near legs curl over the belly. */}
        <Path d="M-3,-26 Q-1,-44 6,-60 M30,-25 Q40,-37 39,-49" stroke={c.fur} fill="none" strokeWidth={11} strokeLinecap="round" />
        <RaisedPaw x={6} y={-60} angle={-15} look={c} /><RaisedPaw x={39} y={-49} angle={12} look={c} />
        <Ellipse cx={12} cy={-21} rx={40} ry={23} fill={c.fur} /><Ellipse cx={15} cy={-24} rx={27} ry={15} fill={c.light} />
        <Path d="M5,-18 Q10,-27 8,-39 M34,-13 Q49,-18 51,-34" stroke={c.fur} fill="none" strokeWidth={12} strokeLinecap="round" />
        <RaisedPaw x={8} y={-39} angle={-22} look={c} /><RaisedPaw x={51} y={-34} angle={28} look={c} />
        <G transform="rotate(-24 -36 -29)">{head(-36, -29, 28)}</G>
      </G> : <G>
        {stage === "AtHome" && cushion}
        {stage === "Wary" && <G><Rect x={-60} y={-80} width={120} height={8} rx={4} fill="#BD8B67" /><Rect x={-54} y={-72} width={6} height={76} rx={2} fill="#A57756" /><Rect x={48} y={-72} width={6} height={76} rx={2} fill="#A57756" /></G>}
        <G transform={stage === "Wary" ? "translate(0 1) scale(.88)" : "translate(0 -4)"}>
          <Path d="M-39,-7 C-44,-18 -26,-34 -3,-33 C21,-36 43,-27 44,-12 Q43,2 17,2 H-23 Q-37,2 -39,-7Z" fill={c.fur} />
          <Path d="M34,-10 C52,5 11,8 -4,1" fill="none" stroke={c.shade} strokeWidth={8} strokeLinecap="round" />
          {c.pattern === 1 && <Path d="M26,-24 L24,-17 M34,-19 L32,-13" stroke={c.shade} strokeWidth={2.8} strokeLinecap="round" />}
          <G transform="translate(-11 0) scale(.75)"><Paws look={c} y={-2} /></G>
          {stage === "Wary" ? head(-15, -30, 27) : head(-13, -37, 30)}
        </G>
      </G>}
    {petted && stage !== "Away" && <Path d="M0,5 C-17,-6 -9,-18 0,-10 C9,-18 17,-6 0,5Z" transform="translate(51 -92)" fill={color.pink} />}
  </G>;
}

export function BowlArt({ bowl }: { bowl: Bowl }) {
  if (bowl === "none") return null;
  return <G>
    <Ellipse cy={10} rx={24} ry={4} fill={color.ink} opacity={0.06} />
    <Path d="M-23,-1 H23 L17,12 Q0,16 -17,12Z" fill={color.pink} />
    <Ellipse rx={23} ry={5} fill="#791C45" /><Ellipse rx={19} ry={3} fill="#F7CBDE" />
    {bowl === "full" && <G><Ellipse cy={-2} rx={17} ry={5} fill="#C89162" /><Path d="M-10,-3 L-7,-1 M-1,-4 L2,-2 M9,-2 L12,0" stroke="#8F5938" strokeWidth={2.5} strokeLinecap="round" /></G>}
    <Path d="M-3,6 Q0,2 3,6 Q7,9 0,11 Q-7,9 -3,6Z" fill="#F9D3E3" />
  </G>;
}

function useHop(react?: boolean) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!react) return;
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!live || reduce) return;
      Animated.sequence([
        Animated.timing(y, { toValue: -8, duration: 180, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 270, useNativeDriver: true }),
      ]).start();
    }).catch(() => {});
    return () => { live = false; y.stopAnimation(); y.setValue(0); };
  }, [react, y]);
  return y;
}

type CatProps = { owner: Address; stage: Stage; hidden?: boolean; label?: string; name?: string; bowl?: Bowl; react?: boolean; mood?: CatMood; petted?: boolean };
export function Cat({ owner, stage, size = 120, hidden, label, name, bowl = "none", react, mood, petted }: CatProps & { size?: number }) {
  const hop = useHop(react);
  return <View accessible={!hidden} accessibilityRole={hidden ? undefined : "image"} accessibilityLabel={hidden ? undefined : label ?? stageLine(stage, name)} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? "no-hide-descendants" : "yes"} style={{ width: size, height: size * 0.8, maxWidth: "100%" }}>
    <Animated.View style={{ width: "100%", height: "100%", transform: [{ translateY: hop }] }}>
      <Svg width="100%" height="100%" viewBox="-84 -120 168 134"><CatArt stage={stage} look={lookFor(owner)} mood={mood} petted={petted} />{stage !== "Away" && <G transform="translate(59 0) scale(.65)"><BowlArt bowl={bowl} /></G>}</Svg>
    </Animated.View>
  </View>;
}

/** A quiet portrait nook, not the earned circle house: no unlockable furniture. */
export function CatScene({ owner, stage, name, label, hidden, mood, petted, bowl = "none" }: CatProps) {
  return <View accessible={!hidden} accessibilityRole={hidden ? undefined : "image"} accessibilityLabel={hidden ? undefined : label ?? stageLine(stage, name)} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? "no-hide-descendants" : "yes"} style={{ width: "100%", aspectRatio: 1.65, backgroundColor: color.cream, overflow: "hidden" }}>
    <Svg width="100%" height="100%" viewBox="0 0 360 218">
      <Path d="M87,167 V88 A93,93 0 0 1 186,-4 A93,93 0 0 1 273,88 V167Z" fill="#F7EDD9" />
      <Rect y={164} width={360} height={54} fill="#EEE0CD" />
      <Path d="M0,164 H360 M0,198 H360 M56,164 V198 M282,164 V198 M168,198 V218" stroke="#E3D0B9" strokeWidth={1.3} />
      <Ellipse cx={180} cy={193} rx={106} ry={14} fill="#E8C7C8" />
      <Ellipse cx={180} cy={193} rx={94} ry={10} fill="none" stroke="#D6B2B5" strokeWidth={1.3} strokeDasharray="4 5" />
      <G transform="translate(180 183) scale(1.32)"><CatArt stage={stage} look={lookFor(owner)} mood={mood} petted={petted} /></G>
      {stage !== "Away" && <G transform="translate(285 187)"><BowlArt bowl={bowl} /></G>}
      {stage === "Away" && <><Pawprint x={281} y={197} /><Pawprint x={312} y={204} /></>}
    </Svg>
  </View>;
}

export function CatFace({ owner, stage, size = 32 }: { owner: Address; stage: Stage; size?: number }) {
  const f = faceFor(stage);
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
    <Svg width="100%" height="100%" viewBox="-49 -49 98 88">
      {stage === "Away" ? <G transform="translate(0 4) scale(2.3)"><Pawprint x={0} y={0} /></G> : <Head x={0} y={0} r={33} look={lookFor(owner)} eyes={f.eyes} flat={f.flat} />}
    </Svg>
  </View>;
}
