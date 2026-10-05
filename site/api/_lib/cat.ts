import { keccak256, type Address } from "viem";

// The cat as an SVG string, for KittyCats.tokenURI and share links. The same
// shapes as app/src/Cat.tsx (react-native-svg), so the cat in an explorer is
// the one on the phone. Her pose is her stage; her coat comes from the address.

export const STAGES = ["Away", "Wary", "Shy", "Friendly", "AtHome", "Family"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LINE: { [S in Stage]: string } = {
  Away: "Staying with the neighbours",
  Wary: "Keeps her distance",
  Shy: "Watching from her box",
  Friendly: "Walks up to greet you",
  AtHome: "At home with you",
  Family: "Family",
};

const COATS = [
  { fur: "#E89A52", dark: "#B8642A", name: "Ginger" },
  { fur: "#3E3439", dark: "#1F191C", eye: "#F2D46B", name: "Black" },
  { fur: "#F3EEE8", dark: "#CFC4BA", name: "White" },
  { fur: "#9C9296", dark: "#6C6267", name: "Grey" },
  { fur: "#B88A63", dark: "#7E5A3C", name: "Brown tabby" },
  { fur: "#EAD7B5", dark: "#C6A97A", name: "Cream" },
];
const PATTERNS = ["Plain", "Striped", "Patched"];

const INK = "#32232D";
const PINK_BRIGHT = "#EC7BAD";
const PINK_SOFT = "#FCE5EF";
const SLATE = "#71636C";
const LINE = "#E8DEE3";
const CREAM = "#FAFBE6";

/** KittyCats.lookOf: keccak256(abi.encodePacked(owner)). */
export function lookOf(owner: Address): { coat: number; pattern: number } {
  const h = keccak256(owner.toLowerCase() as Address);
  return { coat: parseInt(h.slice(2, 4), 16) % 6, pattern: parseInt(h.slice(4, 6), 16) % 3 };
}

type Look = { fur: string; dark: string; eye?: string; pattern: number };
type Eyes = "open" | "wide" | "closed" | "narrow";
const n = (v: number) => Math.round(v * 100) / 100;

function head(x: number, y: number, r: number, look: Look, eyes: Eyes, flat = false): string {
  const ear = r * 0.75;
  const left = flat
    ? `M${n(x - r * 0.55)},${n(y - r * 0.55)} L${n(x - r * 1.35)},${n(y - r * 0.35)} L${n(x - r * 0.85)},${n(y + r * 0.05)} Z`
    : `M${n(x - r * 0.85)},${n(y - r * 0.2)} L${n(x - r * 0.7)},${n(y - r - ear * 0.55)} L${n(x - r * 0.15)},${n(y - r * 0.8)} Z`;
  const right = flat
    ? `M${n(x + r * 0.55)},${n(y - r * 0.55)} L${n(x + r * 1.35)},${n(y - r * 0.35)} L${n(x + r * 0.85)},${n(y + r * 0.05)} Z`
    : `M${n(x + r * 0.85)},${n(y - r * 0.2)} L${n(x + r * 0.7)},${n(y - r - ear * 0.55)} L${n(x + r * 0.15)},${n(y - r * 0.8)} Z`;
  const ex = r * 0.38;
  const ey = y - r * 0.05;
  const ink = look.eye ?? INK;
  const eye = (cx: number) => {
    if (eyes === "closed") return `<path d="M${n(cx - r * 0.16)},${n(ey)} Q${n(cx)},${n(ey + r * 0.14)} ${n(cx + r * 0.16)},${n(ey)}" stroke="${ink}" stroke-width="${n(r * 0.08)}" fill="none" stroke-linecap="round"/>`;
    if (eyes === "narrow") return `<line x1="${n(cx - r * 0.15)}" y1="${n(ey)}" x2="${n(cx + r * 0.15)}" y2="${n(ey)}" stroke="${ink}" stroke-width="${n(r * 0.1)}" stroke-linecap="round"/>`;
    return `<circle cx="${n(cx)}" cy="${n(ey)}" r="${n(eyes === "wide" ? r * 0.14 : r * 0.1)}" fill="${ink}"/>`;
  };
  const stripes =
    look.pattern === 1
      ? `<g stroke="${look.dark}" stroke-width="${n(r * 0.09)}" stroke-linecap="round"><line x1="${n(x)}" y1="${n(y - r * 0.9)}" x2="${n(x)}" y2="${n(y - r * 0.55)}"/><line x1="${n(x - r * 0.28)}" y1="${n(y - r * 0.85)}" x2="${n(x - r * 0.22)}" y2="${n(y - r * 0.55)}"/><line x1="${n(x + r * 0.28)}" y1="${n(y - r * 0.85)}" x2="${n(x + r * 0.22)}" y2="${n(y - r * 0.55)}"/></g>`
      : "";
  const patch = look.pattern === 2 ? `<circle cx="${n(x + ex)}" cy="${n(ey - r * 0.05)}" r="${n(r * 0.36)}" fill="${look.dark}" opacity="0.55"/>` : "";
  const w = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"/>`;
  return [
    `<path d="${left}" fill="${look.fur}" stroke="${look.dark}" stroke-width="1.5" stroke-linejoin="round"/>`,
    `<path d="${right}" fill="${look.fur}" stroke="${look.dark}" stroke-width="1.5" stroke-linejoin="round"/>`,
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${look.fur}" stroke="${look.dark}" stroke-width="1.5"/>`,
    stripes,
    patch,
    eye(x - ex),
    eye(x + ex),
    `<path d="M${n(x - r * 0.1)},${n(y + r * 0.22)} L${n(x + r * 0.1)},${n(y + r * 0.22)} L${n(x)},${n(y + r * 0.34)} Z" fill="${PINK_BRIGHT}"/>`,
    `<g stroke="${look.dark}" stroke-width="1" stroke-linecap="round">${w(x - r * 0.3, y + r * 0.35, x - r * 1.05, y + r * 0.25)}${w(x - r * 0.3, y + r * 0.42, x - r * 1.0, y + r * 0.5)}${w(x + r * 0.3, y + r * 0.35, x + r * 1.05, y + r * 0.25)}${w(x + r * 0.3, y + r * 0.42, x + r * 1.0, y + r * 0.5)}</g>`,
  ].join("");
}

const paw = (x: number, y: number) =>
  `<g fill="${SLATE}"><ellipse cx="${x}" cy="${y}" rx="3.2" ry="2.6"/><circle cx="${n(x - 3.2)}" cy="${n(y - 3.4)}" r="1.3"/><circle cx="${x}" cy="${n(y - 4.4)}" r="1.3"/><circle cx="${n(x + 3.2)}" cy="${n(y - 3.4)}" r="1.3"/></g>`;

function pose(stage: Stage, look: Look): string {
  const f = `<line x1="6" y1="92" x2="114" y2="92" stroke="${LINE}" stroke-width="2" stroke-linecap="round"/>`;
  const body = `fill="${look.fur}" stroke="${look.dark}"`;
  switch (stage) {
    case "Away":
      return `${f}<path d="M14,92 L14,52 L40,32 L66,52 L66,92" fill="#FFFFFF" stroke="${SLATE}" stroke-width="2" stroke-linejoin="round"/><rect x="32" y="66" width="16" height="26" rx="3" fill="#F8F6F7" stroke="${SLATE}" stroke-width="2"/>${paw(60, 88)}${paw(76, 82)}${paw(92, 88)}${paw(106, 82)}`;
    case "Wary":
      return `${f}<rect x="18" y="50" width="84" height="8" rx="3" fill="#B88A63"/><rect x="24" y="58" width="6" height="34" fill="#9A6F4C"/><rect x="90" y="58" width="6" height="34" fill="#9A6F4C"/><ellipse cx="66" cy="84" rx="20" ry="8" ${body} stroke-width="1.5"/>${head(46, 78, 11, look, "narrow", true)}`;
    case "Shy":
      return `${f}${head(60, 52, 17, look, "wide")}<rect x="30" y="58" width="60" height="34" rx="2" fill="#D8B48A" stroke="#A9825A" stroke-width="2"/><path d="M30,58 L20,48 M90,58 L100,48" stroke="#A9825A" stroke-width="3" stroke-linecap="round"/><line x1="30" y1="66" x2="90" y2="66" stroke="#A9825A" stroke-width="1.5"/>`;
    case "Friendly":
      return `${f}<path d="M74,86 C92,84 92,60 88,34" stroke="${look.dark}" stroke-width="6" fill="none" stroke-linecap="round"/><ellipse cx="60" cy="74" rx="20" ry="19" ${body} stroke-width="1.5"/><ellipse cx="52" cy="91" rx="6" ry="3" ${body} stroke-width="1.2"/><ellipse cx="68" cy="91" rx="6" ry="3" ${body} stroke-width="1.2"/>${head(60, 44, 17, look, "open")}`;
    case "AtHome":
      return `${f}<ellipse cx="60" cy="86" rx="44" ry="9" fill="${PINK_SOFT}" stroke="${PINK_BRIGHT}" stroke-width="2"/><rect x="30" y="60" width="58" height="26" rx="13" ${body} stroke-width="1.5"/><path d="M86,78 C100,80 100,70 94,66" stroke="${look.dark}" stroke-width="5" fill="none" stroke-linecap="round"/>${head(42, 56, 15, look, "closed")}`;
    case "Family":
      return `${f}<ellipse cx="64" cy="78" rx="30" ry="14" ${body} stroke-width="1.5"/><ellipse cx="66" cy="74" rx="18" ry="7" fill="#FFFFFF" opacity="0.85"/><circle cx="52" cy="60" r="5" ${body} stroke-width="1.2"/><circle cx="64" cy="58" r="5" ${body} stroke-width="1.2"/><circle cx="78" cy="60" r="5" ${body} stroke-width="1.2"/><path d="M94,80 C106,84 108,72 102,68" stroke="${look.dark}" stroke-width="5" fill="none" stroke-linecap="round"/>${head(30, 76, 15, look, "closed")}<path d="M96,38 l3,-6 l3,6 l-3,6 z" fill="${PINK_BRIGHT}"/>`;
  }
}

export function catSvg(owner: Address, stage: Stage): string {
  const { coat, pattern } = lookOf(owner);
  const look = { ...COATS[coat], pattern };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100" width="480" height="400" role="img" aria-label="${STAGE_LINE[stage]}"><rect width="120" height="100" fill="${CREAM}"/>${pose(stage, look)}</svg>`;
}

export function traitsOf(owner: Address): { coat: string; markings: string } {
  const { coat, pattern } = lookOf(owner);
  return { coat: COATS[coat].name, markings: PATTERNS[pattern] };
}
