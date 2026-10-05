import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { Address } from "viem";

import { Cat, CatScene } from "./Cat";
import { nextStep, STAGES, STAGE_NAME, termsInWords, type Progress, type Stage } from "./standing";
import { color, font, radius, space } from "./theme";
import { Body, Button, Heading, Small, Tag, Title } from "./ui";

const CHARACTER: Record<Stage, { title: string; detail: string }> = {
  Away: { title: "A little space, for now", detail: "She's staying with the neighbours until the money owed is paid back." },
  Wary: { title: "Trust takes a little time", detail: "She's keeping her distance under the bench. Kept promises help her feel safe again." },
  Shy: { title: "Every friendship starts here", detail: "A curious face in a cardboard box. Finish circles together and she'll come closer." },
  Friendly: { title: "A familiar face. A happy hello.", detail: "Tail up, paws forward. She's learning she can count on you." },
  AtHome: { title: "Right where she belongs", detail: "Paws tucked. A slow blink. She feels at home with you." },
  Family: { title: "Her favourite place is with you", detail: "Belly up, completely at ease. That's a cat's way of saying she trusts you." },
};

/** Presentation only. Petting is ephemeral; it cannot change the onchain standing. */
export function CatCompanion({ owner, name, progress, showCat }: { owner: Address; name?: string; progress: Progress; showCat: boolean }) {
  const [petted, setPetted] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const { stage } = progress;
  const character = CHARACTER[stage];
  return <View style={s.companion}>
    <View style={s.heading}>
      <View style={{ flex: 1, gap: space.xs }}><Small>{showCat ? "Your little companion" : "Your standing"}</Small><Title>{showCat ? name?.trim() || "Your cat" : STAGE_NAME[stage]}</Title></View>
      <Tag label={STAGE_NAME[stage]} tone={stage === "Away" || stage === "Wary" ? "clay" : "marigold"} />
    </View>
    {showCat && <CatScene owner={owner} stage={stage} petted={petted} name={name} label={`${name?.trim() || "Your cat"}: ${STAGE_NAME[stage]}. ${character.detail}`} />}
    <View style={s.copy}>
      {showCat && <><Heading>{character.title}</Heading><Body style={{ color: color.slate }}>{character.detail}</Body></>}
      {showCat && stage !== "Away" && <>
        <Button label={`Pet ${name?.trim() || "your cat"}`} tone="quiet" size="row" onPress={() => {
          if (timer.current) clearTimeout(timer.current);
          setPetted(true);
          timer.current = setTimeout(() => setPetted(false), 2200);
        }} />
        <View accessibilityLiveRegion="polite"><Small style={{ textAlign: "center" }}>{petted ? "A little purr, just for you. Her standing stays the same." : "Just for fun. Petting doesn't change her trust."}</Small></View>
      </>}
      <View style={s.next}><Small style={{ color: color.pink, fontFamily: font.bodyBold }}>{stage === "Family" ? "Keep her close" : stage === "Away" || stage === "Wary" ? "The way back" : "Your next step"}</Small><Body>{nextStep(progress)}</Body></View>
    </View>
  </View>;
}

/** An explicitly labelled guide, separate from the member's current standing. */
export function CatStageGuide({ owner, current, showCat }: { owner: Address; current: Stage; showCat: boolean }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(current);
  return <View style={{ gap: space.md }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={s.guideToggle}>
      <View style={{ flex: 1, gap: space.xs }}><Heading>How her trust changes</Heading><Small>Meet the six stages and what they mean.</Small></View>
      <Body style={{ color: color.pink, fontSize: 24 }}>{open ? '−' : '+'}</Body>
    </Pressable>
    {open && <>
      <Small>Explore a stage below. Your current stage is {STAGE_NAME[current]}.</Small>
      <View style={s.stages}>
        {STAGES.map(stage => <Pressable key={stage} accessibilityRole="button" accessibilityLabel={`Explore ${STAGE_NAME[stage]}${stage === current ? ', your current stage' : ''}`} accessibilityState={{ selected: stage === selected }} onPress={() => setSelected(stage)} style={[s.stage, stage === selected && s.selected]}>
          {showCat && <Cat owner={owner} stage={stage} size={88} hidden />}
          <Body style={{ fontFamily: font.bodyBold, textAlign: "center" }}>{STAGE_NAME[stage]}</Body>
          {stage === current && <Small style={{ color: color.pink, textAlign: "center" }}>Your stage</Small>}
        </Pressable>)}
      </View>
      <View style={s.guideDetail} accessibilityLiveRegion="polite">
        <Heading>{STAGE_NAME[selected]} explained</Heading>
        <Body>{CHARACTER[selected].detail}</Body>
        {termsInWords(selected).map(term => <View key={term.label} style={{ gap: 2 }}><Small>{term.label}</Small><Body style={{ fontFamily: font.bodyMedium }}>{term.value}</Body></View>)}
      </View>
      <Small>Her mood follows this round. Her trust follows your whole record. Paying a round feeds her; finishing circles with new people earns her trust. Missed rounds move her back.</Small>
    </>}
  </View>;
}

const s = StyleSheet.create({
  companion: { backgroundColor: color.surface, borderRadius: radius.hero, overflow: "hidden", borderWidth: 1, borderColor: color.line },
  heading: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center", padding: space.lg },
  copy: { padding: space.lg, gap: space.sm },
  next: { marginTop: space.sm, padding: space.md, borderRadius: radius.control, backgroundColor: color.pinkSoft, gap: space.sm },
  guideToggle: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 64, paddingVertical: space.sm },
  stages: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  stage: { flexBasis: "30%", flexGrow: 1, minWidth: 82, alignItems: "center", paddingVertical: space.sm, paddingHorizontal: 4, borderWidth: 2, borderColor: color.line, borderRadius: radius.control, backgroundColor: color.surface },
  selected: { backgroundColor: color.pinkSoft, borderColor: color.pink },
  guideDetail: { padding: space.md, backgroundColor: color.surface, borderRadius: radius.card, gap: space.md },
});
