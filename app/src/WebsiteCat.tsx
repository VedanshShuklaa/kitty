import { memo } from "react";
import { Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";

import { BRAND_LOOK, Head, Hearts } from "./Cat";
import { MAX_YAW, REST_POSE, TAIL_JOINTS, type Pose } from "./catLife";

// The website's cat (site/public/index.html #kitty, kitty.js pose()) drawn in its own
// 1600 x 1200 scene units, with her origin on the cushion at (800, 840). Static shapes are
// memoised; only transforms change from frame to frame.

const r2 = (n: number) => Math.round(n * 100) / 100;
const rad = (d: number) => (d * Math.PI) / 180;

const Gradients = memo(function Gradients() {
  return <Defs>
    <RadialGradient id="bc-fur" cx="38%" cy="28%" r="85%"><Stop offset="0" stopColor="#F8B3D0" /><Stop offset="0.5" stopColor="#EC7CAB" /><Stop offset="1" stopColor="#D45E93" /></RadialGradient>
    <RadialGradient id="bc-haunch" cx="35%" cy="30%" r="80%"><Stop offset="0" stopColor="#F29BC0" /><Stop offset="1" stopColor="#D45E93" /></RadialGradient>
    <RadialGradient id="bc-light" cx="50%" cy="25%" r="80%"><Stop offset="0" stopColor="#FFE9F1" /><Stop offset="1" stopColor="#F8C4D9" /></RadialGradient>
    <RadialGradient id="bc-paw" cx="45%" cy="30%" r="80%"><Stop offset="0" stopColor="#FDE0EB" /><Stop offset="1" stopColor="#F3B1CC" /></RadialGradient>
    <RadialGradient id="bc-shadow" cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor="#8E2A56" stopOpacity={0.35} /><Stop offset="1" stopColor="#8E2A56" stopOpacity={0} /></RadialGradient>
    <LinearGradient id="bc-cush" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#EE8DB7" /><Stop offset="1" stopColor="#C2477F" /></LinearGradient>
    <RadialGradient id="bc-cushtop" cx="45%" cy="35%" r="70%"><Stop offset="0" stopColor="#F9C0D7" /><Stop offset="1" stopColor="#EB8AB4" /></RadialGradient>
  </Defs>;
});

const Cushion = memo(function Cushion() {
  return <G>
    <Ellipse cy={26} rx={282} ry={86} fill="url(#bc-cush)" />
    <Ellipse cy={4} rx={262} ry={64} fill="url(#bc-cushtop)" />
    <Path d="M-236,20 Q0,92 236,20" fill="none" stroke="#B83A72" strokeOpacity={0.35} strokeWidth={4} strokeDasharray="10 12" strokeLinecap="round" />
    <Ellipse rx={200} ry={40} fill="#E77FAD" opacity={0.55} />
  </G>;
});

const Body = memo(function Body() {
  return <G>
    <Ellipse cx={-124} cy={-46} rx={66} ry={52} fill="url(#bc-haunch)" />
    <Ellipse cx={130} cy={-50} rx={82} ry={60} fill="url(#bc-haunch)" />
    <Path d="M-150,0 C-176,-64 -150,-176 -92,-228 C-58,-258 58,-258 92,-228 C150,-176 176,-64 150,0 Q0,24 -150,0 Z" fill="url(#bc-fur)" />
    <Path d="M150,-6 C162,-50 156,-120 120,-176" fill="none" stroke="#D45E93" strokeOpacity={0.35} strokeWidth={6} strokeLinecap="round" />
  </G>;
});

const Neck = memo(function Neck() {
  return <G>
    <Ellipse cy={-226} rx={104} ry={58} fill="url(#bc-fur)" />
    <Path d="M-78,-248 C-92,-196 -74,-130 -34,-90 L-24,-74 L-12,-84 L0,-64 L12,-84 L24,-74 L34,-90 C74,-130 92,-196 78,-248 Q0,-222 -78,-248 Z" fill="url(#bc-light)" stroke="#FBD9E7" strokeWidth={6} strokeLinejoin="round" />
    <Path d="M-30,-160 l10,10 10,-10 M8,-134 l10,10 10,-10" fill="none" stroke="#F4BCD3" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
  </G>;
});

const Paws = memo(function Paws() {
  return <G>
    <Ellipse cx={-56} cy={-20} rx={50} ry={32} fill="url(#bc-paw)" />
    <Ellipse cx={56} cy={-20} rx={50} ry={32} fill="url(#bc-paw)" />
    <Path d="M-72,-14 V-2 M-48,-12 V0 M48,-12 V0 M72,-14 V-2" stroke="#E79BBE" strokeWidth={5} strokeLinecap="round" />
  </G>;
});

// The tail: three strokes (shadow, fur, highlight) over the same 12 joints, 28 units apart.
const CHAINS = [
  { color: "#C9518A", y: 6, w: [68, 66, 64, 62, 60, 58, 56, 54, 52, 50, 48, 46] },
  { color: "#EC7CAB", y: 0, w: [62, 60, 58, 56, 54, 52, 50, 48, 46, 44, 42, 40] },
  { color: "#F6A6C8", y: -12, w: [14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 8] },
];
function Chain({ chain, angles, j = 0 }: { chain: (typeof CHAINS)[number]; angles: number[]; j?: number }) {
  if (j >= angles.length) return null;
  return <G transform={j === 0 ? `rotate(${r2(angles[0])})` : `translate(28 0) rotate(${r2(angles[j])})`}>
    <Line x1={0} y1={chain.y} x2={28} y2={chain.y} stroke={chain.color} strokeWidth={chain.w[j]} strokeLinecap="round" />
    <Chain chain={chain} angles={angles} j={j + 1} />
  </G>;
}

/** The website cat at pose `p` (her resting pose when still). */
export function WebsiteCat({ p }: { p?: Pose }) {
  const q = p ?? REST_POSE;
  const spi = Math.sin(rad(q.pitch + q.dip));
  const n = q.neck / MAX_YAW;
  const lift = 250 * 0.015 * q.breath;
  const dipY = (1 - q.cushion) * 112;
  const angles = TAIL_JOINTS.map((a, j) => a + q.tail[j]);
  return <G>
    <Gradients />
    <G transform="translate(800 840)">
      <G transform={`translate(0 112) scale(${r2(1 + (1 - q.cushion) * 0.25)} ${r2(q.cushion)}) translate(0 -112)`}><Cushion /></G>
      <Ellipse cy={2} rx={190} ry={34} fill="url(#bc-shadow)" transform={`translate(0 ${r2(dipY)})`} />
      <G id="kitty-hop" transform={`translate(0 ${r2(q.hop * 44.8 + dipY)}) scale(${r2(q.hopSX)} ${r2(q.hopSY)})`}>
        <G transform="translate(120 -40)">{CHAINS.map((c) => <Chain key={c.color} chain={c} angles={angles} />)}</G>
        <G transform={`scale(1 ${r2(1 + 0.015 * q.breath)})`}><Body /></G>
        <G transform={`translate(${r2(n * 4)} ${r2(-lift)}) translate(0 -150) rotate(${r2(n * 3)}) skewX(${r2(-n * 5)}) scale(1 ${r2(1 + 0.03 * spi)}) translate(0 150)`}><Neck /></G>
        <Paws />
        <Head x={0} y={-322} r={165} look={BRAND_LOOK} eyes="open" p={p} lift={lift} />
      </G>
      {/* beside her ear, low enough to stay inside the app's shorter room crop */}
      <Hearts p={p} x={230 + 80 * 0.6 * Math.sin(rad(q.yaw))} y={-250} scale={5} />
    </G>
  </G>;
}
