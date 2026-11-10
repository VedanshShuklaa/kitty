import { useEffect, useId, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Image, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import type { Address } from "viem";

import { MAX_PITCH, MAX_YAW, VIEWER, type Pose, type Spot } from "./catLife";
import { lookOf, stageLine, type Bowl, type Stage } from "./standing";
import { color } from "./theme";
import { useCatLife } from "./useCatLife";

// Geometry and Rose colors come from the authored website cat in brandCat.ts.
// Keep that character's round pupils, small muzzle and tall ears in every pose.
type Coat = {
  fur: string; light: string; shade: string; head: string; headLight: string; headShade: string;
  muzzle: string; muzzleShade: string; paw: string; pawShade: string;
  ear: string; earTip: string; earBase: string;
  eye: string; eyeMid: string; eyeShade: string; lid: string; pupil: string;
  nose: string; whisker: string; patch: string; blush: string;
  /** cheek tufts; defaults to headShade */
  cheek?: string;
};
const COATS: readonly Coat[] = [
  {
    fur: "#EC7CAB", light: "#F8B3D0", shade: "#D45E93", head: "#EE82B0", headLight: "#F9B7D2", headShade: "#DA6699",
    muzzle: "#FFE9F1", muzzleShade: "#F8C4D9", paw: "#FDE0EB", pawShade: "#F3B1CC", ear: "#F7AFCD", earTip: "#F49BC1", earBase: "#E06C9F",
    eye: "#C9467F", eyeMid: "#92204D", eyeShade: "#5E1232", pupil: "#3A0820", lid: "#6E1538",
    nose: "#B42E68", whisker: "#A1285B", patch: "#EBA1C2", blush: "#E9468A",
  },
  {
    fur: "#E5C69F", light: "#F3DFC3", shade: "#D0A776", head: "#E7CAA4", headLight: "#F6E4CB", headShade: "#D3AE85",
    muzzle: "#FFF4E4", muzzleShade: "#F1DABE", paw: "#F5E3CB", pawShade: "#E4C49D", ear: "#EAAAB5", earTip: "#EBCFAE", earBase: "#CFAC83",
    eye: "#A8784C", eyeMid: "#66422E", eyeShade: "#39251F", pupil: "#2F1A19", lid: "#5C3C30",
    nose: "#AA6174", whisker: "#88634E", patch: "#D1A981", blush: "#DE839E",
  },
  {
    fur: "#9B7564", light: "#C49A84", shade: "#7E594C", head: "#A47E6C", headLight: "#C9A28D", headShade: "#896353",
    muzzle: "#F1D9C8", muzzleShade: "#D8AF95", paw: "#C8A08B", pawShade: "#A77E69", ear: "#D997AA", earTip: "#B58B77", earBase: "#795245",
    eye: "#D3AA73", eyeMid: "#88633D", eyeShade: "#4B3429", pupil: "#281A1B", lid: "#422B2A",
    nose: "#A95773", whisker: "#624437", patch: "#B08C7A", blush: "#C76A8D",
  },
  {
    fur: "#9DA5B7", light: "#C6CCD9", shade: "#7E889F", head: "#A5ADBF", headLight: "#CDD3E0", headShade: "#8993AA",
    muzzle: "#F0EDF3", muzzleShade: "#D5D6E2", paw: "#D0D4DF", pawShade: "#AAB2C5", ear: "#DBACC3", earTip: "#B6BED0", earBase: "#808CA6",
    eye: "#9DAED1", eyeMid: "#596C97", eyeShade: "#34415F", pupil: "#22283E", lid: "#38425C",
    nose: "#AC6A8D", whisker: "#606E8A", patch: "#B5BDCD", blush: "#CC84AD",
  },
  {
    fur: "#E9A66F", light: "#F7CEA4", shade: "#CF8755", head: "#ECB17E", headLight: "#FBD6AF", headShade: "#D7925D",
    muzzle: "#FFF1DC", muzzleShade: "#F3D3AE", paw: "#FADDC0", pawShade: "#EDBD92", ear: "#EFAFB6", earTip: "#F0BC90", earBase: "#D08D5F",
    eye: "#BE9A53", eyeMid: "#806032", eyeShade: "#4B3625", pupil: "#30211C", lid: "#63432E",
    nose: "#B96B7E", whisker: "#9C673F", patch: "#D6945F", blush: "#E68DA0",
  },
  {
    fur: "#343B53", light: "#596780", shade: "#252C41", head: "#3D465F", headLight: "#64728C", headShade: "#2B3248",
    muzzle: "#D0D7E4", muzzleShade: "#9DAAC3", paw: "#7886A2", pawShade: "#4C5874", ear: "#BD93B0", earTip: "#66728C", earBase: "#313A53",
    eye: "#F3D68E", eyeMid: "#C0924E", eyeShade: "#6C5030", pupil: "#202638", lid: "#1D2638",
    nose: "#BB7897", whisker: "#99A8C3", patch: "#515D76", blush: "#BE7F9F",
  },
];
export type Look = Coat & { pattern: number };
export const BRAND_LOOK: Look = { ...COATS[0], cheek: "#E676A6", pattern: 0 };
export function lookFor(owner: Address): Look {
  const { coat, pattern } = lookOf(owner);
  return { ...COATS[coat], pattern };
}
type Eyes = "open" | "wide" | "closed" | "happy" | "narrow";
export type CatMood = "settled" | "waiting" | "fed" | "late" | "covered";

// ---- the website's 2.5D head turn (site/public/js/kitty.js pose()), in website head units ----
const KX = 80, KY = 62;
const SIDE = [-1, 1] as const;
const r2 = (n: number) => Math.round(n * 100) / 100;
const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** Parallax helpers for a pose; with no pose every helper is the identity. */
function rig(p?: Pose) {
  const yaw = p?.yaw ?? 0, pitch = (p?.pitch ?? 0) + (p?.dip ?? 0);
  const sy = Math.sin(rad(yaw)), spi = Math.sin(rad(pitch)), cy = Math.cos(rad(yaw));
  const far = (s: number) => s * yaw > 0;
  return {
    sy, spi, cy, far, sq: p?.squint ?? 0,
    dx: (d: number) => d * KX * sy,
    dy: (d: number) => -d * KY * spi,
    side: (s: number) => (far(s) ? Math.pow(cy, 1.8) : 1 + 0.1 * Math.abs(sy)),
  };
}

const HAPPY = "M-30,10 Q0,-30 30,10";
const CLOSED = "M-30,-6 Q0,16 30,-6";

/** Original website eye geometry: the iris leads inside its clip, the lid slides down to blink. */
export function CatEyes({ look: c, eyes = "open", p, id }: { look: Look; eyes?: Eyes; p?: Pose; id: string }) {
  const R = rig(p);
  const sq = R.sq;
  const fixed = eyes === "happy" || eyes === "closed";
  const irisX = p ? clamp(clamp(p.eyeYaw / MAX_YAW, -1, 1) * 4.5 + clamp((p.eyeYaw - p.yaw) / 10, -1, 1) * 4, -8, 8) : 0;
  const irisY = p ? clamp(-(clamp(p.eyePitch / MAX_PITCH, -1, 1) * 3.5 + clamp((p.eyePitch - p.pitch) / 8, -1, 1) * 3), -7, 7) : 0;
  const shape = eyes === "narrow" ? 0.62 : eyes === "wide" ? 1.04 : 1;
  const eye = (i: number) => {
    const s = SIDE[i];
    return <G key={s} transform={`translate(${r2(62 * s + R.dx(0.6))} ${r2(-108 + R.dy(0.6) - 4 * sq)}) scale(${r2(R.side(s))} 1)`}>
      {fixed ? <Path d={eyes === "happy" ? HAPPY : CLOSED} fill="none" stroke={c.lid} strokeWidth={6} strokeLinecap="round" /> : <>
        <G opacity={r2(1 - sq * sq)} transform={`scale(${eyes === "wide" ? shape : 1} ${r2(shape * (1 - 0.92 * sq))})`}>
          <G clipPath={`url(#${id}-eye-clip)`}>
            <Ellipse rx={34} ry={40} fill={c.eyeShade} />
            <G transform={`translate(${r2(irisX)} ${r2(irisY)})`}><Circle r={31} fill={`url(#${id}-iris)`} /><Circle r={15} fill={c.pupil} /></G>
            <Circle cx={12} cy={-16} r={11.5} fill="#FFFFFF" /><Circle cx={-13} cy={15} r={5} fill="#FFFFFF" opacity={0.9} />
            {p && p.lid > 0 && <G transform={`translate(0 ${r2(84 * p.lid)})`}>
              <Rect x={-40} y={-132} width={80} height={92} fill={c.head} />
              <Path d="M-38,-42 Q0,-30 38,-42" fill="none" stroke={c.lid} strokeWidth={5} strokeLinecap="round" />
            </G>}
          </G>
          {/* the rim fades as the lid closes, so a blink reads as a closing eye, not a ring */}
          <Ellipse rx={34} ry={40} fill="none" stroke={c.lid} strokeWidth={3} opacity={p ? r2(1 - 0.85 * p.lid) : undefined} />
        </G>
        {sq > 0 && <Path d={HAPPY} opacity={r2(sq)} transform={`scale(1 ${r2(0.6 + 0.4 * sq)})`} fill="none" stroke={c.lid} strokeWidth={6} strokeLinecap="round" />}
      </>}
    </G>;
  };
  return <G id={`${id}-eyes`}>
    <Defs>
      <RadialGradient id={`${id}-iris`} cx="50%" cy="78%" r="75%"><Stop offset="0" stopColor={c.eye} /><Stop offset="0.55" stopColor={c.eyeMid} /><Stop offset="1" stopColor={c.eyeShade} /></RadialGradient>
      <ClipPath id={`${id}-eye-clip`}><Ellipse rx={34} ry={40} /></ClipPath>
    </Defs>
    {eye(0)}{eye(1)}
  </G>;
}

/** Authored website skull, ears, cheeks, muzzle and whiskers at one-fifth scale, posed like the website cat. */
export function Head({ x, y, r, look: c, eyes, flat = false, tilt = false, smiling = false, p, lift = 0 }: {
  x: number; y: number; r: number; look: Look; eyes: Eyes; flat?: boolean; tilt?: boolean; smiling?: boolean; p?: Pose; lift?: number;
}) {
  const id = `face-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const R = rig(p);
  const sq = R.sq;
  const n = (p?.neck ?? 0) / MAX_YAW;
  const purr = p?.purr ?? 0;
  const o = (1 - sq) * Math.max(p?.o ?? 0, p?.chomp ?? 0);
  const smile = Math.max(sq, smiling ? 1 : 0);
  return <G transform={`translate(${x} ${y}) scale(${r / 33})`}>
    <Defs>
      <RadialGradient id={id} cx="40%" cy="30%" r="78%"><Stop offset="0" stopColor={c.headLight} /><Stop offset="0.55" stopColor={c.head} /><Stop offset="1" stopColor={c.headShade} /></RadialGradient>
      <RadialGradient id={`${id}-light`} cx="50%" cy="25%" r="80%"><Stop offset="0" stopColor={c.muzzle} /><Stop offset="1" stopColor={c.muzzleShade} /></RadialGradient>
      <RadialGradient id={`${id}-blush`} cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor={c.blush} stopOpacity={0.75} /><Stop offset="1" stopColor={c.blush} stopOpacity={0} /></RadialGradient>
      <LinearGradient id={`${id}-ear`} x1="0" y1="100%" x2="30%" y2="0"><Stop offset="0" stopColor={c.earBase} /><Stop offset="1" stopColor={c.earTip} /></LinearGradient>
      <LinearGradient id={`${id}-ear-inner`} x1="0" y1="100%" x2="0" y2="0"><Stop offset="0" stopColor={c.muzzleShade} /><Stop offset="1" stopColor={c.ear} /></LinearGradient>
    </Defs>
    <G transform="scale(.2) translate(0 108)">
      <G id={`${id}-head`} transform={p ? `translate(${r2(n * 9 + purr * 1.4)} ${r2(-lift - 6 * R.spi)}) rotate(${r2(p.roll)})` : undefined}>
        {SIDE.map((s, i) => {
          const f = R.far(s);
          const base = flat ? s * 34 : tilt && s === 1 ? 12 : 0;
          const rot = p ? -s * 9 * p.perk + s * p.flick[i] + p.earSec * 0.6 : 0;
          return <G key={s} transform={`translate(${r2(s * 92 + R.dx(-0.3) - (f ? s * 18 * Math.abs(R.sy) : 0))} ${r2(-172 + R.dy(-0.3) + 6 * R.spi)}) rotate(${r2(base + rot)}) scale(${r2(s * (f ? R.cy * R.cy : 1))} ${r2(1 - 0.24 * R.spi)})`}>
            <Path d="M-62,44 C-50,-26 -6,-118 32,-150 Q48,-162 55,-142 C66,-94 70,-40 58,44 Z" fill={`url(#${id}-ear)`} />
            <Path d="M-34,22 C-22,-28 6,-98 33,-124 Q43,-130 45,-116 C51,-78 52,-36 45,16 Z" fill={`url(#${id}-ear-inner)`} />
          </G>;
        })}
        <Path d="M0,-240 C96,-240 160,-186 163,-110 C171,-70 172,-30 140,-8 C105,15 45,18 0,18 C-45,18 -105,15 -140,-8 C-172,-30 -171,-70 -163,-110 C-160,-186 -96,-240 0,-240 Z" fill={`url(#${id})`} />
        {SIDE.map((s) => <Path key={s} transform={`translate(${r2(s * 150 + R.dx(0.35) - (R.far(s) ? s * 14 * Math.abs(R.sy) : 0))} ${r2(-46 + R.dy(0.35) - 10 * sq)}) scale(${r2(-s * R.side(s))} 1)`} d="M8,-34 L-30,-18 L-6,-8 L-34,8 L-4,14 L-22,28 L14,22 Z" fill={c.cheek ?? c.headShade} stroke={c.cheek ?? c.headShade} strokeWidth={10} strokeLinejoin="round" />)}
        <G transform={p ? `translate(${r2(R.dx(0.3))} ${r2(R.dy(0.3))})` : undefined}>
          {c.pattern === 1 && <Path d="M-46,-218 L-36,-188 M0,-229 V-192 M46,-218 L36,-188" stroke={c.headShade} strokeWidth={14} strokeLinecap="round" opacity={0.7} />}
          {c.pattern === 2 && <Path d="M38,-230 C103,-220 143,-179 148,-123 C150,-82 114,-65 82,-86 C54,-105 34,-160 38,-230Z" fill={c.patch} opacity={0.7} />}
        </G>
        <CatEyes id={id} look={c} eyes={eyes} p={p} />
        {SIDE.map((s) => {
          const bx = 112 * s;
          return <Ellipse key={s} cx={bx} cy={-58} rx={30} ry={17} fill={`url(#${id}-blush)`} opacity={r2(0.55 + 0.35 * sq)}
            transform={p ? `translate(${r2(bx + R.dx(0.5))} ${r2(-58 + R.dy(0.5) - 8 * sq)}) scale(${r2(R.side(s) * (1 + 0.15 * sq))} ${r2(1 + 0.1 * sq)}) translate(${-bx} 58)` : undefined} />;
        })}
        <G transform={p ? `translate(${r2(R.dx(0.9))} ${r2(R.dy(0.9) - 3 * sq)})` : undefined}>
          <Ellipse cx={-25} cy={-48} rx={37} ry={28} fill={`url(#${id}-light)`} /><Ellipse cx={25} cy={-48} rx={37} ry={28} fill={`url(#${id}-light)`} /><Ellipse cy={-26} rx={22} ry={12} fill={c.muzzleShade} />
        </G>
        <G transform={p ? `translate(${r2(R.dx(0.85))} ${r2(R.dy(0.85) - 2 * sq)})` : undefined}>
          {smile < 1 && o < 1 && <Path opacity={r2(1 - Math.max(smile, o))} d="M0,-62 V-52 M-20,-50 C-18,-38 -3,-38 0,-50 C3,-38 18,-38 20,-50" fill="none" stroke={c.lid} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />}
          {o > 0 && <G opacity={r2(o)}><Path d="M0,-62 V-56" stroke={c.lid} strokeWidth={5} strokeLinecap="round" /><Ellipse cy={-42} rx={9} ry={11} fill={c.lid} /><Ellipse cy={-37} rx={5.5} ry={4.5} fill="#F07AA8" /></G>}
          {smile > 0 && <G opacity={r2(smile)} transform={p ? `translate(0 -55) scale(${r2(0.7 + 0.3 * smile)}) translate(0 55)` : undefined}><Path d="M0,-62 V-56" stroke={c.lid} strokeWidth={5} strokeLinecap="round" /><Path d="M-24,-55 Q0,-50 24,-55 Q22,-26 0,-24 Q-22,-26 -24,-55 Z" fill={c.lid} /><Path d="M-13,-33 Q0,-44 13,-33 Q8,-25 0,-25 Q-8,-25 -13,-33Z" fill={c.ear} /></G>}
          {p && p.tongue > 0 && <G transform={`translate(${r2(4 * p.tongue)} -46)`}><Path d={`M-9,0 Q-10,${r2(14 * p.tongue)} 0,${r2(16 * p.tongue)} Q10,${r2(14 * p.tongue)} 9,0 Z`} fill="#F07AA8" stroke={c.lid} strokeWidth={2.5} /></G>}
        </G>
        <Path transform={p ? `translate(${r2(R.dx(1))} ${r2(R.dy(1) - 3 * sq)})` : undefined} d="M-15,-80 Q0,-87 15,-80 Q16,-73 0,-62 Q-16,-73 -15,-80 Z" fill={c.nose} />
        {SIDE.map((s) => <Path key={s} transform={`translate(${r2(s * 62 + R.dx(0.9))} ${r2(-56 + R.dy(0.9) - 3 * sq)}) rotate(${r2(p ? -s * 4 * sq + p.whiskSec * 0.5 + purr * 2.5 * s : 0)}) scale(${r2(-s * R.side(s))} 1)`} d="M0,-10 Q-46,-24 -96,-22 M0,0 L-100,-1 M0,10 Q-44,20 -90,28" fill="none" stroke={c.whisker} strokeWidth={3.8} strokeLinecap="round" />)}
      </G>
    </G>
  </G>;
}

export function faceFor(stage: Stage): { eyes: Eyes; flat: boolean } {
  return { eyes: stage === "Wary" || stage === "Away" ? "narrow" : stage === "Shy" ? "wide" : stage === "AtHome" ? "closed" : stage === "Family" ? "happy" : "open", flat: stage === "Wary" || stage === "Away" };
}

function Paws({ look: c, y = -5 }: { look: Look; y?: number }) {
  const id = `paw-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return <G transform={`translate(0 ${y})`}>
    <Defs><RadialGradient id={id} cx="45%" cy="30%" r="80%"><Stop offset="0" stopColor={c.paw} /><Stop offset="1" stopColor={c.pawShade} /></RadialGradient></Defs>
    <Ellipse cx={-11.2} rx={10} ry={6.4} fill={`url(#${id})`} /><Ellipse cx={11.2} rx={10} ry={6.4} fill={`url(#${id})`} />
    <Path d="M-14.4,1.2 V3.6 M-9.6,1.6 V4 M9.6,1.6 V4 M14.4,1.2 V3.6" fill="none" stroke={c.pawShade} strokeWidth={1} strokeLinecap="round" />
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

const HEART = "M0,5 C-17,-6 -9,-18 0,-10 C9,-18 17,-6 0,5Z";
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
/** Hearts that float up from her head, fading out (the website's heart, drawn in the scene). */
export function Hearts({ p, x, y, scale = 1, rise = 40 }: { p?: Pose; x: number; y: number; scale?: number; rise?: number }) {
  if (!p?.hearts.length) return null;
  return <>{p.hearts.map((h, i) => {
    const t = h.t;
    const s = scale * (0.55 + 0.45 * easeOut(Math.min(1, t * 4)));
    const o = t < 0.65 ? 1 : Math.max(0, (1 - t) / 0.35);
    return <Path key={i} d={HEART} fill={color.pinkBright} opacity={r2(o)}
      transform={`translate(${r2(x + h.side * 16 * scale + Math.sin(t * Math.PI * 2) * 3 * scale)} ${r2(y - t * rise * scale)}) rotate(${r2(Math.sin(t * Math.PI * 1.5) * 10)}) scale(${r2(s)})`} />;
  })}</>;
}

/** Where each pose's head sits, for hearts and petting. */
const HEAD_AT: Record<Stage, [number, number]> = { Away: [0, -40], Wary: [-19, -30], Shy: [0, -65], Friendly: [0, -64.4], AtHome: [-13, -43], Family: [-35, -32] };
/** Poses that can hop and lean as a whole; the others move their head only. */
const WHOLE: Partial<Record<Stage, true>> = { Friendly: true, AtHome: true, Family: true };

/** Stage pose, anchored at the floor at (0, 0). Shared with the circle house. */
export function CatArt({ stage, look: c, mood = "settled", petted = false, p: pose, fit = false }: { stage: Stage; look: Look; mood?: CatMood; petted?: boolean; p?: Pose; fit?: boolean }) {
  // Lying belly-up she turns her head less; this also keeps her ears inside tight frames.
  const p = pose && stage === "Family" ? { ...pose, yaw: pose.yaw * 0.6, eyeYaw: pose.eyeYaw * 0.6, roll: pose.roll * 0.5 } : pose;
  const id = `fur-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const f = faceFor(stage);
  const staticPet = petted && !p;
  // A fed cat is drawn content (happy eyes) when still; when alive her eyes stay open so she
  // can blink and look around, and contentment comes from the dinner squint.
  const eyes = staticPet ? "happy" : stage === "Wary" ? "narrow" : mood === "covered" ? "narrow" : mood === "waiting" ? "wide" : mood === "fed" ? (p ? f.eyes : "happy") : mood === "late" ? "closed" : f.eyes;
  const flat = f.flat || mood === "covered";
  const bite = p ? p.bite * 4 + p.lean * 3 : 0;
  const head = (x: number, y: number, r = 33) => <Head x={x + bite * 0.7} y={y + bite} r={r} look={c} eyes={eyes} flat={flat} tilt={mood === "late"} p={p} smiling={staticPet || (mood === "fed" && !p)} />;
  const sway = (deg: number, x: number, y: number) => (p ? `rotate(${r2(p.sway * deg)} ${x} ${y})` : undefined);
  const cushion = <G><Ellipse cy={1} rx={57} ry={11} fill="#CF548C" /><Ellipse cy={-3} rx={51} ry={8} fill="#EEA2C3" /><Path d="M-45,2 Q0,14 45,2" fill="none" stroke="#AD245F" opacity={0.35} strokeWidth={1.5} strokeDasharray="3 4" /></G>;
  // in a tight view box (fit) the parent View does the hop, so nothing leaves the frame
  const whole = p && WHOLE[stage] ? `translate(0 ${r2(fit ? 0 : p.hop * 9)}) rotate(${r2(p.lean * 6)}) scale(${r2(p.hopSX)} ${r2(p.hopSY * (1 + 0.014 * p.breath))})` : undefined;
  const [hx, hy] = HEAD_AT[stage];
  return <G>
    <Defs>
      <RadialGradient id={id} cx="38%" cy="28%" r="85%"><Stop offset="0" stopColor={c.light} /><Stop offset="0.5" stopColor={c.fur} /><Stop offset="1" stopColor={c.shade} /></RadialGradient>
      <RadialGradient id={`${id}-light`} cx="50%" cy="25%" r="80%"><Stop offset="0" stopColor={c.muzzle} /><Stop offset="1" stopColor={c.muzzleShade} /></RadialGradient>
      <RadialGradient id={`${id}-haunch`} cx="35%" cy="30%" r="80%"><Stop offset="0" stopColor={c.head} /><Stop offset="1" stopColor={c.shade} /></RadialGradient>
    </Defs>
    <Ellipse cy={5} rx={stage === "Family" ? 69 : 47} ry={6} fill={color.ink} opacity={0.06} />
    {(stage === "Family" || stage === "AtHome") && <G transform={p ? `translate(0 4) scale(${r2(1 + (1 - p.cushion) * 0.25)} ${r2(p.cushion)}) translate(0 -4)` : undefined}>{cushion}</G>}
    {stage === "Away" ? <G><Box /><Pawprint x={49} y={0} /><Pawprint x={64} y={8} /></G> :
      stage === "Shy" ? <G>
        <Path transform={sway(9, 34, -8)} d="M34,-8 C54,-10 57,-28 49,-37" fill="none" stroke={c.fur} strokeWidth={9} strokeLinecap="round" />
        {head(0, -65)}<Box />
        {[-18, 18].map(x => <G key={x} transform={`translate(${x} -39) rotate(${x < 0 ? 8 : -8})`}>
          <Path d="M-9,-4 Q-10,0 -8,6 Q-6,11 0,11 Q8,11 9,4 L8,-4Z" fill={c.pawShade} />
          <Ellipse cy={1} rx={9} ry={7.5} fill={`url(#${id}-light)`} />
          <Path d="M-3,3 V6 M2,3 V6" stroke={c.pawShade} strokeWidth={1} strokeLinecap="round" />
        </G>)}
      </G> : stage === "Friendly" ? <G transform={whole}>
        <G transform={sway(8, 24, -10)}>
          <Path d="M24,-9 C43,-12 49,-29 46,-47 C44,-59 45,-65 50,-66" fill="none" stroke={c.shade} strokeWidth={12} strokeLinecap="round" />
          <Path d="M24,-11 C42,-14 47,-30 44,-47 C42,-59 44,-65 50,-66" fill="none" stroke={c.fur} strokeWidth={9} strokeLinecap="round" />
          <Path d="M29,-12 C43,-19 45,-33 42,-47" fill="none" stroke={c.light} strokeWidth={2} strokeLinecap="round" opacity={0.7} />
        </G>
        <G transform="scale(.2)">
          <Ellipse cx={-124} cy={-46} rx={66} ry={52} fill={`url(#${id}-haunch)`} /><Ellipse cx={130} cy={-50} rx={82} ry={60} fill={`url(#${id}-haunch)`} />
          <Path d="M-150,0 C-176,-64 -150,-176 -92,-228 C-58,-258 58,-258 92,-228 C150,-176 176,-64 150,0 Q0,24 -150,0 Z" fill={`url(#${id})`} />
          <Path d="M150,-6 C162,-50 156,-120 120,-176" fill="none" stroke={c.shade} strokeOpacity={0.35} strokeWidth={6} strokeLinecap="round" />
          <Ellipse cy={-226} rx={104} ry={58} fill={`url(#${id})`} />
          <Path d="M-78,-248 C-92,-196 -74,-130 -34,-90 L-24,-74 L-12,-84 L0,-64 L12,-84 L24,-74 L34,-90 C74,-130 92,-196 78,-248 Q0,-222 -78,-248 Z" fill={`url(#${id}-light)`} stroke={c.muzzle} strokeWidth={6} strokeLinejoin="round" />
          <Path d="M-30,-160 l10,10 10,-10 M8,-134 l10,10 10,-10" fill="none" stroke={c.muzzleShade} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        </G>
        {c.pattern === 1 && <Path d="M-31,-18 L-25,-16 M33,-18 L27,-16" stroke={c.shade} strokeWidth={2.5} strokeLinecap="round" opacity={0.65} />}
        <Paws look={c} y={-4} />{head(0, -64.4)}
      </G> : stage === "Family" ? <G transform={whole}>
        <G transform={sway(6, 43, -8)}>
          <Path d="M43,-13 C53,-7 62,-9 70,-5 C78,-2 78,5 72,5 C62,2 52,4 43,-3Z" fill={`url(#${id})`} />
          <Path d="M50,-8 Q62,-4 70,-2" stroke={c.light} strokeWidth={2} strokeLinecap="round" opacity={0.65} />
        </G>
        {/* A long ribcage rests on its side; bent limbs overlap at shoulders and hips. */}
        <Path d="M-29,-15 C-30,-28 -17,-40 -3,-39 C13,-39 31,-43 43,-33 C55,-22 49,-5 34,-1 C14,3 -13,2 -29,-15Z" fill={`url(#${id})`} />
        <Path d="M-10,-27 C3,-32 24,-31 33,-22 C39,-12 25,-5 11,-5 C-2,-5 -12,-12 -10,-27Z" fill={`url(#${id}-light)`} />
        {c.pattern === 1 && <Path d="M22,-36 L20,-31 M31,-36 L29,-30" stroke={c.shade} strokeWidth={2.5} strokeLinecap="round" opacity={0.65} />}
        <Path d="M9,-22 l3,3 -3,3 M20,-20 l3,3 -3,3" fill="none" stroke={c.muzzleShade} strokeWidth={1} strokeLinecap="round" />
        {/* Far foreleg and thigh bend toward the belly, with small paw ends. */}
        <Path d="M-15,-30 C-8,-43 8,-46 13,-38 C18,-30 8,-23 0,-22Z" fill={`url(#${id})`} />
        <Path d="M-1,-32 C2,-37 10,-34 10,-29 C10,-23 2,-20 -3,-24 C-5,-27 -4,-30 -1,-32Z" fill={`url(#${id}-light)`} />
        <Path d="M-1,-27 l1,3 M3,-28 l1,3" stroke={c.pawShade} strokeWidth={1} strokeLinecap="round" />
        <Path d="M30,-33 C29,-44 43,-45 51,-34 C57,-27 57,-20 51,-17 C42,-15 31,-23 30,-33Z" fill={`url(#${id}-haunch)`} />
        <Path d="M45,-27 C50,-29 59,-23 59,-19 C59,-13 52,-15 47,-16 C39,-17 39,-24 45,-27Z" fill={`url(#${id}-light)`} />
        <Path d="M46,-23 Q43,-21 46,-18" fill="none" stroke={c.pawShade} strokeWidth={1} strokeLinecap="round" />
        {/* Near limbs rest against the cushion rather than forming a ring of paws. */}
        <Path d="M-19,-15 C-12,-5 -2,3 7,-3 C16,-8 13,-18 5,-21 C-4,-23 -12,-19 -19,-15Z" fill={`url(#${id})`} />
        <Path d="M1,-21 C8,-23 15,-18 13,-13 C11,-8 5,-8 0,-11 C-5,-14 -5,-19 1,-21Z" fill={`url(#${id}-light)`} />
        <Path d="M7,-17 Q10,-16 9,-12" fill="none" stroke={c.pawShade} strokeWidth={1} strokeLinecap="round" />
        <Path d="M29,-17 C38,-24 52,-17 53,-9 C55,0 40,5 31,0 C23,-4 22,-10 29,-17Z" fill={`url(#${id}-haunch)`} />
        <Path d="M40,-9 C47,-13 57,-7 55,-1 C52,5 39,6 36,1 C33,-3 35,-7 40,-9Z" fill={`url(#${id}-light)`} />
        <Path d="M41,-3 l1,4 M46,-4 l1,4" stroke={c.pawShade} strokeWidth={1} strokeLinecap="round" />
        <G transform="rotate(-30 -35 -32)">{head(-35, -32, 28)}</G>
      </G> : stage === "Wary" ? <G>
        <Rect x={-60} y={-80} width={120} height={8} rx={4} fill="#BD8B67" /><Rect x={-54} y={-72} width={6} height={76} rx={2} fill="#A57756" /><Rect x={48} y={-72} width={6} height={76} rx={2} fill="#A57756" />
        <G transform="translate(0 -2) scale(.88)">
          <Path transform={sway(6, 34, -5)} d="M34,-9 C43,-5 46,-3 52,-3 Q57,-2 55,1 C49,6 38,2 31,-2Z" fill={`url(#${id})`} />
          <Path d="M-24,-10 C-25,-28 -8,-40 10,-40 C30,-44 44,-28 41,-12 Q40,0 24,1 H-9 Q-21,0 -24,-10Z" fill={`url(#${id})`} />
          <Path d="M26,-28 C38,-29 43,-12 35,-5 Q28,2 17,-2 C14,-12 16,-24 26,-28Z" fill={`url(#${id}-haunch)`} />
          <Path d="M23,-5 Q31,-9 35,-3 Q36,3 27,3 Q18,4 18,0Z" fill={`url(#${id}-light)`} />
          <Path d="M24,-1 V2 M28,-2 V1" stroke={c.pawShade} strokeWidth={1} strokeLinecap="round" />
          {c.pattern === 1 && <Path d="M19,-36 L17,-31 M28,-33 L25,-28" stroke={c.shade} strokeWidth={2.5} strokeLinecap="round" opacity={0.65} />}
          <Path d="M-24,-25 C-30,-18 -32,-10 -38,-5 C-42,-1 -37,4 -30,2 L-14,-10 Q-7,-19 -11,-28Z" fill={`url(#${id}-haunch)`} />
          <Path d="M-38,-5 C-34,-7 -27,-4 -29,1 C-31,5 -41,4 -42,1 Q-44,-3 -38,-5Z" fill={`url(#${id}-light)`} />
          <Path d="M-38,0 V2 M-34,0 V2" stroke={c.pawShade} strokeWidth={1} strokeLinecap="round" />
          <Path d="M-22,-20 L-21,-10 L-16,-7 L-13,-11 L-9,-9 L-4,-23Z" fill={`url(#${id}-light)`} />
          <Path d="M1,-28 C16,-26 11,-10 -4,-2 L-17,4 C-23,6 -28,0 -21,-5 L-9,-14 Q-4,-20 -7,-27Z" fill={`url(#${id})`} />
          <Path d="M4,-19 Q2,-11 -10,-5" fill="none" stroke={c.shade} strokeOpacity={0.3} strokeWidth={1.2} strokeLinecap="round" />
          <Path d="M-21,-3 C-15,-5 -8,-1 -10,4 C-12,8 -24,7 -26,3 Q-29,-1 -21,-3Z" fill={`url(#${id}-light)`} />
          <Path d="M-22,2 V5 M-17,2 V5" stroke={c.pawShade} strokeWidth={1} strokeLinecap="round" />
          {head(-22, -32, 27)}
        </G>
      </G> : <G transform={whole}>
        <Path d="M-36,-9 C-40,-29 -23,-44 -4,-40 C15,-51 39,-43 46,-26 C53,-9 39,0 24,1 H-18 Q-33,2 -36,-9Z" fill={`url(#${id})`} />
        <Path d="M20,-34 C32,-36 40,-25 38,-15" fill="none" stroke={c.shade} strokeOpacity={0.3} strokeWidth={1.5} strokeLinecap="round" />
        {c.pattern === 1 && <Path d="M23,-39 L20,-32 M32,-34 L29,-28" stroke={c.shade} strokeWidth={2.5} strokeLinecap="round" opacity={0.65} />}
        <Path d="M-28,-30 C-30,-18 -24,-8 -14,-4 L-10,-7 L-6,-3 L-2,-7 L3,-6 Q12,-19 3,-31Z" fill={`url(#${id}-light)`} />
        <Path d="M-31,-10 Q-27,-5 -20,-6 M-1,-6 Q7,-5 11,-10" fill="none" stroke={c.shade} strokeOpacity={0.4} strokeWidth={1.2} strokeLinecap="round" />
        <G transform={sway(4, 43, -24)}>
          <Path d="M43,-24 C56,-14 51,-2 34,0 Q24,1 21,-2" fill="none" stroke={c.shade} strokeWidth={12} strokeLinecap="round" />
          <Path d="M43,-25 C53,-14 48,-4 34,-3 Q26,-2 22,-4" fill="none" stroke={c.fur} strokeWidth={9} strokeLinecap="round" />
          <Path d="M44,-20 Q51,-9 35,-6" fill="none" stroke={c.light} strokeWidth={2} strokeLinecap="round" opacity={0.65} />
        </G>
        {head(-13, -43, 30)}
      </G>}
    {staticPet && stage !== "Away" && <Path d={HEART} transform="translate(51 -92)" fill={color.pink} />}
    {stage !== "Away" && <Hearts p={p} x={hx + 22} y={hy - 14} rise={fit ? 18 : 40} />}
  </G>;
}

export function BowlArt({ bowl, p }: { bowl: Bowl; p?: Pose }) {
  if (bowl === "none") return null;
  return <G>
    <Ellipse cy={10} rx={24} ry={4} fill={color.ink} opacity={0.06} />
    <Path d="M-23,-1 H23 L17,12 Q0,16 -17,12Z" fill={color.pink} />
    <Ellipse rx={23} ry={5} fill="#791C45" /><Ellipse rx={19} ry={3} fill="#F7CBDE" />
    {bowl === "full" && <G><Ellipse cy={-2} rx={17} ry={5} fill="#C89162" /><Path d="M-10,-3 L-7,-1 M-1,-4 L2,-2 M9,-2 L12,0" stroke="#8F5938" strokeWidth={2.5} strokeLinecap="round" /></G>}
    <Path d="M-3,6 Q0,2 3,6 Q7,9 0,11 Q-7,9 -3,6Z" fill="#F9D3E3" />
    {p?.crumbs.map((c, i) => <Circle key={i} r={2.6} fill="#B57A4B" opacity={r2(1 - c.t)} cx={r2((c.k - 0.5) * 34 * c.t)} cy={r2(-4 - 22 * Math.sin(Math.PI * Math.min(1, c.t * 1.1)) + 6 * c.t)} />)}
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

// Where she looks while idle, as head angles. "You" (straight out) comes up most often.
const HOME_SPOTS: Spot[] = [{ ...VIEWER, weight: 3 }, { yaw: 22, pitch: -12 }, { yaw: -20, pitch: 5 }, { yaw: 8, pitch: 13 }, { yaw: -12, pitch: -10 }];
const ROOM_SPOTS: Spot[] = [{ ...VIEWER, weight: 3 }, { yaw: -22, pitch: 9 }, { yaw: 21, pitch: 12 }, { yaw: -18, pitch: -14 }, { yaw: 19, pitch: -11 }, { yaw: 6, pitch: 4 }];
const BOWL_SPOT: Spot = { yaw: 24, pitch: -14 };

/** Petting and the gallery's slow blink arrive as a changing expressionKey. */
function useExpression(act: ReturnType<typeof useCatLife>["act"], petted?: boolean, expressionKey?: number) {
  const last = useRef(expressionKey);
  useEffect(() => {
    if (expressionKey === undefined || expressionKey === last.current) return;
    last.current = expressionKey;
    act((cat, now) => (petted ? cat.pet(now) : cat.slowBlink(now)));
  }, [expressionKey, petted, act]);
}

type CatProps = { owner: Address; stage: Stage; hidden?: boolean; label?: string; name?: string; bowl?: Bowl; react?: boolean; mood?: CatMood; petted?: boolean; expressionKey?: number };
export function Cat({ owner, stage, size = 120, hidden, label, name, bowl = "none", react, mood, petted, expressionKey }: CatProps & { size?: number }) {
  // Small faces stay still; from about the Home card size up she's alive.
  const alive = stage !== "Away" && size >= 100;
  const { pose, act } = useCatLife(HOME_SPOTS, alive);
  const hop = useHop(react && !pose);
  const reacted = useRef(false);
  useEffect(() => {
    if (!react) { reacted.current = false; return; }
    if (reacted.current) return;
    reacted.current = true;
    // dinner after a payment; anything else gets a hello
    act((cat, now) => (bowl === "full" ? cat.feed(now, BOWL_SPOT) : cat.hello(now)));
  }, [react, bowl, act]);
  useExpression(act, petted, expressionKey);
  const p = alive ? pose ?? undefined : undefined;
  return <View accessible={!hidden} accessibilityRole={hidden ? undefined : "image"} accessibilityLabel={hidden ? undefined : label ?? stageLine(stage, name)} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? "no-hide-descendants" : "yes"} style={{ width: size, height: size * 0.8, maxWidth: "100%" }}>
    <Animated.View style={{ width: "100%", height: "100%", transform: [{ translateY: p ? p.hop * size * 0.065 : hop }] }}>
      <Svg width="100%" height="100%" viewBox="-84 -120 168 134"><CatArt stage={stage} look={lookFor(owner)} mood={mood} petted={petted} p={p} fit />{stage !== "Away" && <G transform="translate(59 0) scale(.65)"><BowlArt bowl={bowl} p={p} /></G>}</Svg>
    </Animated.View>
  </View>;
}

/** Where a press landed inside its target: native gives locationX/Y, a web mouse click gives offsetX/Y. */
export function tapPoint(e: { locationX?: number; locationY?: number; offsetX?: number; offsetY?: number }): [number, number] {
  return [e.locationX ?? e.offsetX ?? 0, e.locationY ?? e.offsetY ?? 0];
}

const SCENE_W = 360, SCENE_H = 218, CAT_X = 180, CAT_Y = 183, CAT_S = 1.32;
/** A quiet portrait nook, not the earned circle house. Tap her to pet her; tap the room and she looks there. */
export function CatScene({ owner, stage, name, label, hidden, mood, petted, expressionKey, bowl = "none", onPet }: CatProps & { onPet?: () => void }) {
  const alive = stage !== "Away";
  const { pose, act } = useCatLife(ROOM_SPOTS, alive);
  const [width, setWidth] = useState(0);
  useEffect(() => { if (alive) act((cat, now) => cat.arrive(now)); }, [alive, act]);
  useExpression(act, petted, expressionKey);
  const p = alive ? pose ?? undefined : undefined;
  const [hx, hy] = HEAD_AT[stage];
  const tap = (lx: number, ly: number) => {
    if (!alive || !width) return;
    const k = SCENE_W / width;
    const x = lx * k, y = ly * k;
    const headX = CAT_X + hx * CAT_S;
    const onCat = Math.abs(x - headX) < 60 && y > CAT_Y + (hy - 45) * CAT_S && y < CAT_Y + 4;
    if (onCat) {
      if (onPet) onPet();
      else act((cat, now) => cat.pet(now, x >= headX ? 1 : -1));
    } else {
      act((cat, now) => cat.lookAt(now, { yaw: ((x - CAT_X) / (SCENE_W / 2)) * 30, pitch: ((CAT_Y + hy * CAT_S - y) / SCENE_H) * 40 }));
    }
  };
  return <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessible={!hidden} accessibilityRole={hidden ? undefined : "image"} accessibilityLabel={hidden ? undefined : label ?? stageLine(stage, name)} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? "no-hide-descendants" : "yes"} style={{ width: "100%", aspectRatio: 1.65, backgroundColor: color.room, overflow: "hidden" }}>
    <Image source={require("../assets/kitty-room.webp")} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />
    <Svg width="100%" height="100%" viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} style={StyleSheet.absoluteFill}>
      <Ellipse cx={180} cy={193} rx={106} ry={14} fill="#E8C7C8" />
      <Ellipse cx={180} cy={193} rx={94} ry={10} fill="none" stroke="#D6B2B5" strokeWidth={1.3} strokeDasharray="4 5" />
      <G transform={`translate(${CAT_X} ${CAT_Y}) scale(${CAT_S})`}><CatArt stage={stage} look={lookFor(owner)} mood={mood} petted={petted} p={p} /></G>
      {stage !== "Away" && <G transform="translate(285 187)"><BowlArt bowl={bowl} p={p} /></G>}
      {stage === "Away" && <><Pawprint x={281} y={197} /><Pawprint x={312} y={204} /></>}
    </Svg>
    {alive && <Pressable accessible={false} importantForAccessibility="no" focusable={false} style={StyleSheet.absoluteFill} onPress={(e) => tap(...tapPoint(e.nativeEvent))} />}
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
