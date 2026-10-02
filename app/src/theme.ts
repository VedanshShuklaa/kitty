// Kitty pink. See UI_GUIDE.md before changing frontend styles or copy.
// Legacy color names are aliases so existing financial flows share the theme.
export const color = {
  paper: "#F8F6F7",
  surface: "#FFFFFF",
  ink: "#32232D",
  pink: "#AD245F",
  pinkSoft: "#FCE5EF",
  pinkBright: "#EC7BAD",
  cream: "#FAFBE6",
  indigo: "#32232D",
  indigoSoft: "#614451",
  indigoMist: "#FCE5EF",
  marigold: "#EC7BAD",
  marigoldSoft: "#FCE5EF",
  leaf: "#246448",
  leafSoft: "#E4F2E9",
  clay: "#AC3434",
  claySoft: "#FCE9E6",
  slate: "#71636C",
  line: "#E8DEE3",
  onIndigo: "#FFFFFF",
  onIndigoMuted: "#E9CCD9",
} as const;

export const font = {
  display: "BricolageGrotesque_700Bold",
  displayHeavy: "BricolageGrotesque_800ExtraBold",
  displayMedium: "BricolageGrotesque_500Medium",
  body: "Figtree_400Regular",
  bodyMedium: "Figtree_500Medium",
  bodyBold: "Figtree_700Bold",
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

// Radii encode hierarchy: the hero block is the softest, controls are tighter.
export const radius = { control: 16, card: 22, hero: 28, pill: 999 } as const;
