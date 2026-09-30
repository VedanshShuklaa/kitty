import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Address } from "viem";

import { explain } from "../errors";
import { money, parseMoney, span } from "../format";
import { CADENCES, CREATE_STEPS, createCircle, joinAsOrganizer, type Cadence, type CircleDraft } from "../kitty";
import type { ScreenProps } from "../nav";
import { useSession, useSigner } from "../session";
import { saveCircle, saveInviteKeys, type CircleRef } from "../store";
import { color, font, radius, space } from "../theme";
import { Body, Button, Choice, Field, Heading, Notice, Screen, Section, Small, Steps, Title, type StepState } from "../ui";

const QUICK = ["5", "10", "20", "50"];
const BIDDING = [
  { label: "Off", value: 0 },
  { label: "Up to 10%", value: 1_000 },
  { label: "Up to 20%", value: 2_000 },
  { label: "Up to 30%", value: 3_000 },
];

type Run = { active: string; failed: boolean; error?: string; circle?: Address };

export function CreateScreen({ navigation }: ScreenProps<"Create">) {
  const signer = useSigner();
  const { profile } = useSession();
  const [title, setTitle] = useState("");
  const [others, setOthers] = useState<string[]>(["", ""]);
  const [amount, setAmount] = useState("10");
  const [cadence, setCadence] = useState<Cadence>("demo");
  const [startIn, setStartIn] = useState(CADENCES.demo.starts[0].seconds);
  const [maxBid, setMaxBid] = useState(3_000);
  const [run, setRun] = useState<Run | null>(null);

  const me = profile?.name ?? "You";
  const names = [me, ...others.map((s) => s.trim())];
  const contribution = parseMoney(amount);
  const n = names.length;
  const problem = !title.trim()
    ? "Give the circle a name."
    : others.some((o) => !o.trim())
      ? "Fill in every name, or remove the empty ones."
      : !contribution || contribution < 1_000000n
        ? "Each round needs to be at least $1."
        : null;

  const draft: CircleDraft = { title: title.trim(), names, contribution: contribution ?? 0n, cadence, startIn, maxBidBps: maxBid };

  async function submit() {
    let current = CREATE_STEPS[0].id;
    let circle: Address | undefined = run?.circle;
    const remember = (c: Address) => {
      const ref: CircleRef = { address: c, title: draft.title, names, seat: 0, organizer: true, addedAt: Date.now() };
      return saveCircle(signer.address, ref);
    };
    const step = (id: string) => {
      current = id;
      // past "create", the circle exists: list it, and never create it twice
      if ((id === "approve" || id === "deposit") && circle) remember(circle);
      setRun({ active: id, failed: false, circle: id === "approve" || id === "deposit" ? circle : undefined });
    };
    try {
      if (circle) {
        await joinAsOrganizer(signer, circle, step);
      } else {
        circle = await createCircle(signer, draft, step, async (predicted, keys) => {
          circle = predicted;
          await saveInviteKeys(predicted, keys);
        });
      }
      await remember(circle);
      navigation.replace("Circle", { address: circle });
    } catch (e) {
      const created = current === "approve" || current === "deposit";
      setRun({ active: current, failed: true, error: explain(e), circle: created ? circle : undefined });
    }
  }

  if (run) {
    const at = CREATE_STEPS.findIndex((s) => s.id === run.active);
    const steps = CREATE_STEPS.map((s, i) => ({
      label: s.label,
      state: (i < at ? "done" : i === at ? (run.failed ? "failed" : "active") : "todo") as StepState,
    }));
    return (
      <Screen
        footer={
          run.failed ? (
            <>
              <Button label={run.circle ? "Finish setting up" : "Try again"} onPress={submit} />
              {!run.circle && <Button label="Back to the form" tone="quiet" onPress={() => setRun(null)} />}
            </>
          ) : undefined
        }
      >
        <Title>Setting up {draft.title}</Title>
        <Small>Your phone may ask for your fingerprint or screen lock.</Small>
        <View style={{ marginTop: space.md }}>
          <Steps steps={steps} />
        </View>
        {run.error && <Notice tone="error">{run.error}</Notice>}
      </Screen>
    );
  }

  const c = CADENCES[cadence];
  return (
    <Screen
      onBack={() => navigation.goBack()}
      footer={
        <>
          {problem && <Small style={{ textAlign: "center" }}>{problem}</Small>}
          <Button label="Create circle" disabled={!!problem} onPress={submit} />
        </>
      }
    >
      <Title>Start a circle</Title>

      <Field label="Name your circle" placeholder="Market Friday susu" value={title} onChangeText={setTitle} maxLength={40} />

      <Section title="Who's in?" right={<Small>{n} people, {n} rounds</Small>}>
        <View style={{ gap: space.sm }}>
          <View style={nameRow}>
            <Body style={{ flex: 1, fontFamily: font.bodyMedium }}>{me}</Body>
            <Small>You go first</Small>
          </View>
          {others.map((o, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Field
                  label={`Person ${i + 2}`}
                  placeholder="Their name"
                  value={o}
                  autoCapitalize="words"
                  maxLength={24}
                  onChangeText={(v) => setOthers(others.map((x, j) => (j === i ? v : x)))}
                />
              </View>
              {others.length > 1 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove person ${i + 2}`}
                  hitSlop={8}
                  onPress={() => setOthers(others.filter((_, j) => j !== i))}
                  style={{ marginTop: 26, padding: space.sm }}
                >
                  <Text style={{ fontFamily: font.bodyBold, fontSize: 20, color: color.slate }}>×</Text>
                </Pressable>
              )}
            </View>
          ))}
          {n < 12 && <Button label="Add a person" tone="quiet" onPress={() => setOthers([...others, ""])} />}
          <Small>Names stay on your phones. They are never published.</Small>
        </View>
      </Section>

      <Section title="How much each round?">
        <Field label="Everyone puts in" prefix="$" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        <Choice options={QUICK.map((q) => ({ label: `$${q}`, value: q }))} value={amount} onChange={setAmount} />
      </Section>

      <Section title="How often?">
        <Choice
          options={(Object.keys(CADENCES) as Cadence[]).map((k) => ({ label: CADENCES[k].label, value: k }))}
          value={cadence}
          onChange={(k) => {
            setCadence(k);
            setStartIn(CADENCES[k].starts[0].seconds);
          }}
        />
        {cadence === "demo" && <Small>Ten-minute rounds are for trying Kitty out on the test network.</Small>}
      </Section>

      <Section title="First payment">
        <Choice options={c.starts.map((s) => ({ label: s.label, value: s.seconds }))} value={startIn} onChange={setStartIn} />
        <Small>Everyone has {span(startIn - c.commit)} from now to join.</Small>
      </Section>

      <Section title="Bidding">
        <Small>Someone who needs the pot early can offer to give up part of it. The rest of you share what they give up.</Small>
        <Choice options={BIDDING} value={maxBid} onChange={setMaxBid} />
      </Section>

      {contribution && contribution > 0n ? (
        <View style={{ backgroundColor: color.indigoMist, borderRadius: radius.card, padding: space.md, gap: space.xs, marginTop: space.sm }}>
          <Heading>In short</Heading>
          <Body>
            Each round, all {n} of you put in {money(contribution)}, {c.every}. One person takes the{" "}
            {money(contribution * BigInt(n))} pot. Everyone also puts down a {money(contribution)} deposit when they join, and gets it
            back at the end.
          </Body>
        </View>
      ) : null}
    </Screen>
  );
}

const nameRow = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  backgroundColor: color.surface,
  borderRadius: radius.control,
  paddingHorizontal: space.md,
  minHeight: 52,
};
