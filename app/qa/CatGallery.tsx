// Visual reference only: never imported by the production app.
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { SvgXml } from "react-native-svg";
import type { Address } from "viem";
import { Cat, CatFace, CatScene } from "../src/Cat";
import { brandCatSvg } from "../src/brandCat";
import { STAGES, STAGE_NAME } from "../src/standing";
import { color, font, space } from "../src/theme";
import { Button, Heading, Screen, Small, Title } from "../src/ui";

// Fixed addresses exercising every deterministic coat/marking combination.
const samples = [
  { name: "Rose", ids: [15, 4, 5] },
  { name: "Cream", ids: [10, 3, 12] },
  { name: "Cocoa", ids: [9, 7, 1] },
  { name: "Smoke", ids: [37, 11, 2] },
  { name: "Ginger", ids: [50, 71, 30] },
  { name: "Midnight", ids: [23, 80, 8] },
];
const address = (id: number) => `0x${id.toString(16).padStart(40, "0")}` as Address;
const captions = ["With the neighbours", "A little distance", "A curious newcomer", "A happy hello", "Safe and settled", "Completely at ease"];
const reference = brandCatSvg.replace('viewBox="0 0 1600 1200"', 'viewBox="400 220 800 750"');
export function CatGallery() {
  const [coat, setCoat] = useState(0);
  const [pattern, setPattern] = useState(0);
  const [petted, setPetted] = useState(false);
  const [expressionKey, setExpressionKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const owner = address(samples[coat].ids[pattern]);
  return <Screen>
    <Title>Meet the Kitty cats</Title>
    <Small>Six coats, three markings and six stages of trust. Sample artwork.</Small>
    <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-end" }}>
      <View style={{ flex: 1, alignItems: "center", gap: space.xs }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: "100%", height: 154 }}><SvgXml xml={reference} width="100%" height="100%" /></View>
        <Small>Original website cat</Small>
      </View>
      <View style={{ flex: 1, alignItems: "center", gap: space.xs, paddingBottom: 14 }}>
        <Cat owner={address(samples[0].ids[0])} stage="Friendly" size={164} hidden />
        <Small>Updated companion</Small>
      </View>
    </View>
    <CatScene owner={owner} stage="Friendly" petted={petted} expressionKey={expressionKey} label="Expression preview cat" />
    <View style={{ flexDirection: "row", gap: space.sm }}>
      <Button label="Slow blink" tone="quiet" onPress={() => { if (timer.current) clearTimeout(timer.current); setPetted(false); setExpressionKey(n => n + 1); }} style={{ flex: 1 }} />
      <Button label="Happy hello" onPress={() => { if (timer.current) clearTimeout(timer.current); setPetted(true); setExpressionKey(n => n + 1); timer.current = setTimeout(() => setPetted(false), 1800); }} style={{ flex: 1 }} />
    </View>
    <Small>Expression previews only. They never change standing.</Small>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {samples.map((sample, i) => <Pressable key={sample.name} accessibilityRole="button" accessibilityLabel={`View ${sample.name}`} accessibilityState={{ selected: coat === i }} onPress={() => setCoat(i)} style={{ flexBasis: "30%", flexGrow: 1, alignItems: "center", padding: space.sm, gap: space.xs, borderWidth: 2, borderColor: coat === i ? color.pink : color.line, backgroundColor: color.surface, borderRadius: 16 }}>
        <Cat owner={address(sample.ids[pattern])} stage="Friendly" size={124} hidden />
        <Small style={{ fontFamily: font.bodyBold }}>{sample.name}</Small>
      </Pressable>)}
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {["Plain", "Tabby", "Patched"].map((name, i) => <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Show ${name.toLowerCase()} markings`} accessibilityState={{ selected: pattern === i }} onPress={() => setPattern(i)} style={{ flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 16, borderWidth: 1, borderColor: color.line, backgroundColor: pattern === i ? color.pinkSoft : color.surface }}><Small style={{ color: color.ink }}>{name}</Small></Pressable>)}
    </View>
    <Heading>{samples[coat].name}, in every stage</Heading>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
      {STAGES.map((stage, i) => <View key={stage} style={{ flexBasis: "44%", flexGrow: 1, alignItems: "center", padding: space.md, gap: space.sm, backgroundColor: color.cream, borderRadius: 22 }}>
        <Cat owner={owner} stage={stage} size={164} />
        <Heading>{STAGE_NAME[stage]}</Heading>
        <Small style={{ textAlign: "center" }}>{captions[i]}</Small>
        <CatFace owner={owner} stage={stage} size={32} />
      </View>)}
    </View>
    <Small>One account. One cat. Kept promises bring her closer.</Small>
  </Screen>;
}
