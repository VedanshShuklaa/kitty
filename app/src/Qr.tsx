import encodeQR from "@paulmillr/qr";
import { useMemo } from "react";
import { View } from "react-native";

import { color } from "./theme";

/**
 * A QR code drawn with plain Views, one per run of dark modules in a row, so
 * it needs no native SVG module. Medium error correction, with the standard
 * quiet zone.
 */
export function QrCode({ value, size = 220, label }: { value: string; size?: number; label: string }) {
  const rows = useMemo(() => encodeQR(value, "raw", { ecc: "medium", border: 2 }), [value]);
  const cell = size / rows.length;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size, backgroundColor: color.surface }}>
      {rows.map((row, y) => {
        const runs: { x: number; w: number }[] = [];
        for (let x = 0; x < row.length; x++) {
          if (!row[x]) continue;
          const start = x;
          while (x + 1 < row.length && row[x + 1]) x++;
          runs.push({ x: start, w: x - start + 1 });
        }
        return runs.map((r) => (
          <View
            key={`${y}-${r.x}`}
            style={{ position: "absolute", left: r.x * cell, top: y * cell, width: r.w * cell + 0.5, height: cell + 0.5, backgroundColor: color.ink }}
          />
        ));
      })}
    </View>
  );
}
