import { memo, useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, View } from "react-native";
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";

import { CatArt, lookFor } from "./Cat";
import { PIECES, type Resident } from "./house";
import { color } from "./theme";

// "Feed the Kitty": the circle's house, drawn from its pieces, with every
// member's cat in it. A still picture; the sentence beside it (houseWords)
// carries the meaning, so the drawing is hidden from screen readers. Each
// piece arrives in PIECES order and none is ever taken away.

const W = 360;
const H = 230;

function Pieces({ n }: { n: number }) {
  const has = (piece: (typeof PIECES)[number]) => n > PIECES.indexOf(piece);
  return (
    <G>
      {has("window") && (
        <G>
          <Rect x={24} y={22} width={80} height={60} rx={4} fill="#D7ECF5" stroke="#FFFFFF" strokeWidth={5} />
          <Ellipse cx={46} cy={38} rx={10} ry={4} fill="#FFFFFF" opacity={0.9} />
          <Path d="M64,22 V82 M24,52 H104" stroke="#FFFFFF" strokeWidth={4} />
          <Rect x={18} y={82} width={92} height={6} rx={2} fill="#C08A5F" />
        </G>
      )}
      {has("picture") && (
        <G>
          <Rect x={132} y={28} width={46} height={36} rx={3} fill="#FFFFFF" stroke="#C08A5F" strokeWidth={4} />
          <Path d="M138,58 L150,44 L158,52 L164,46 L172,58 Z" fill="#7FBF9A" />
          <Circle cx={166} cy={38} r={4} fill="#E0B23F" />
        </G>
      )}
      {has("shelf") && (
        <G>
          <Rect x={206} y={62} width={96} height={6} rx={2} fill="#C08A5F" />
          <Rect x={214} y={44} width={8} height={18} fill="#AD245F" />
          <Rect x={224} y={48} width={8} height={14} fill="#1F6CB5" />
          <Rect x={234} y={42} width={7} height={20} fill="#E0B23F" />
          <Ellipse cx={284} cy={58} rx={10} ry={4} fill="#EC7BAD" />
        </G>
      )}
      {has("lamp") && (
        <G>
          <Line x1={334} y1={70} x2={334} y2={200} stroke="#8A5E4F" strokeWidth={3} />
          <Ellipse cx={334} cy={200} rx={12} ry={3} fill="#8A5E4F" />
          <Path d="M318,72 L350,72 L344,52 L324,52 Z" fill="#F4E3A1" stroke="#E0B23F" strokeWidth={1.5} />
        </G>
      )}
      {has("cat tree") && (
        <G>
          <Rect x={152} y={96} width={10} height={68} fill="#D9BC8C" />
          <Rect x={134} y={92} width={46} height={8} rx={3} fill="#B46A8C" />
          <Rect x={140} y={126} width={36} height={7} rx={3} fill="#B46A8C" />
          <Rect x={138} y={160} width={40} height={6} rx={3} fill="#B46A8C" />
        </G>
      )}
      {/* the floor pieces, back to front */}
      {has("rug") && (
        <G>
          <Ellipse cx={190} cy={208} rx={120} ry={15} fill="#F4B3CE" />
          <Ellipse cx={190} cy={208} rx={108} ry={11} fill="none" stroke="#E58DB3" strokeWidth={2} strokeDasharray="5 5" />
        </G>
      )}
      {has("scratching post") && (
        <G>
          <Rect x={16} y={196} width={46} height={8} rx={3} fill="#B46A8C" />
          <Rect x={32} y={120} width={14} height={78} fill="#D9BC8C" />
          <Path d="M32,130 H46 M32,145 H46 M32,160 H46 M32,175 H46 M32,190 H46" stroke="#BF9F6E" strokeWidth={1.5} />
          <Rect x={18} y={112} width={42} height={10} rx={4} fill="#B46A8C" />
        </G>
      )}
      {has("plant") && (
        <G>
          <Path d="M262,150 C252,132 256,120 266,112 M268,150 C270,130 280,122 290,120 M265,150 C262,138 270,128 278,108" stroke="#4E9A5E" strokeWidth={3} fill="none" strokeLinecap="round" />
          <Path d="M254,148 L282,148 L278,166 L258,166 Z" fill="#C9775A" />
        </G>
      )}
      {has("pot of cat grass") && (
        <G>
          <Path d="M300,184 L296,160 M305,184 L304,154 M311,184 L312,150 M317,184 L320,156 M322,184 L327,164" stroke="#4E9A5E" strokeWidth={2.6} strokeLinecap="round" />
          <Path d="M294,184 L328,184 L323,205 L299,205 Z" fill="#C9775A" />
        </G>
      )}
      {has("cushion") && (
        <G>
          <Ellipse cx={185} cy={203} rx={52} ry={11} fill="#C2346F" />
          <Ellipse cx={185} cy={199} rx={44} ry={7} fill="#D85A8E" />
        </G>
      )}
      {has("blanket") && <Path d="M78,196 L126,192 L130,212 L82,216 Z" fill="#9AC7E8" stroke="#6FA3CB" strokeWidth={1.5} />}
      {has("toy mouse") && (
        <G>
          <Ellipse cx={262} cy={216} rx={8} ry={5} fill="#A9B7C3" />
          <Circle cx={256} cy={212} r={2.5} fill="#A9B7C3" />
          <Path d="M270,216 C278,216 278,224 284,222" stroke="#A9B7C3" strokeWidth={1.5} fill="none" />
        </G>
      )}
    </G>
  );
}

/** The cardboard box every house starts as. It stays, under everything else. */
function Box() {
  return (
    <G>
      <Path d="M64,150 L52,135 L92,135 L101,150 Z M101,150 L112,135 L150,135 L138,150 Z" fill="#E2B07E" />
      <Rect x={64} y={150} width={74} height={52} fill="#D49A62" />
      <Path d="M64,150 H138" stroke="#B47A45" strokeWidth={1.5} />
    </G>
  );
}

/** Full cats, with room for every member: wrap larger circles into two rows. */
function Resident({ r, index, count }: { r: Resident; index: number; count: number }) {
  const columns = Math.min(count, 6);
  const row = Math.floor(index / columns);
  const inRow = Math.min(columns, count - row * columns);
  const x = W / 2 + (index % columns - (inRow - 1) / 2) * (300 / Math.max(columns, 1));
  const y = count > 6 && row === 0 ? 149 : 207;
  const scale = Math.min(0.85, 2.8 / Math.max(columns, 1));
  return <G transform={`translate(${x} ${y}) scale(${scale})`}>
    <CatArt stage={r.stage} look={lookFor(r.owner)} />
    {r.mine && <Path d="M-5,17 L0,12 L5,17" fill="none" stroke={color.pink} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
  </G>;
}

/**
 * The circle's house: `pieces` from the indexer, `residents` in payout
 * order. `react` makes this member's cat hop once (after they pay), never
 * with Reduce motion on.
 */
export const House = memo(function House({ pieces, residents, react }: { pieces: number; residents: Resident[]; react?: boolean }) {
  const hop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!react) return;
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (!live || reduce) return;
        Animated.sequence([
          Animated.timing(hop, { toValue: -10, duration: 180, useNativeDriver: true }),
          Animated.timing(hop, { toValue: 0, duration: 270, useNativeDriver: true }),
        ]).start();
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [react, hop]);

  const shown = residents.slice(0, 12);
  const mine = shown.findIndex((r) => r.mine);
  const p = Math.min(Math.max(pieces, 0), PIECES.length);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: "100%", aspectRatio: W / H, borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: color.line, backgroundColor: color.cream }}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        <Rect width={W} height={164} fill="#FAFBE6" />
        <Rect y={164} width={W} height={66} fill="#EED8C4" />
        <Path d="M0,188 H360 M0,212 H360 M60,164 V188 M150,188 V212 M240,164 V188 M300,212 V230 M110,212 V230" stroke="#E3C6AE" strokeWidth={1.5} />
        <Rect y={159} width={W} height={6} fill="#E3C6AE" />
        <Pieces n={p} />
        <Box />
        {shown.map((r, i) => (i === mine ? null : <Resident key={r.owner} r={r} index={i} count={shown.length} />))}
      </Svg>
      {mine >= 0 && (
        // this member's cat sits in her own layer so she can hop on her own
        <Animated.View
          pointerEvents="none"
          style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", transform: [{ translateY: hop }] }}
        >
          <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
            <Resident r={shown[mine]} index={mine} count={shown.length} />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
});
