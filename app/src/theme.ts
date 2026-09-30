// Design tokens. Adire indigo carries the ink and the circle's hero block;
// marigold marks whose turn it is and the one primary action on a screen.
export const color = {
  paper: "#EEF0F6",
  surface: "#FFFFFF",
  indigo: "#25215E",
  indigoSoft: "#3A357A",
  indigoMist: "#DCDDF0",
  marigold: "#F2B233",
  marigoldSoft: "#FCEBC4",
  leaf: "#2F7D5B",
  leafSoft: "#D6EDE2",
  clay: "#C2413A",
  claySoft: "#F6DAD8",
  slate: "#6B6B8A",
  line: "#D5D7E6",
  onIndigo: "#F4F3FF",
  onIndigoMuted: "#A9A6D6",
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
export const radius = { control: 14, card: 20, hero: 32, pill: 999 } as const;
