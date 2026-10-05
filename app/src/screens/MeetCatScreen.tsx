import { useEffect, useState } from "react";
import { View } from "react-native";

import { Cat } from "../Cat";
import { readStanding } from "../kitty";
import type { ScreenProps } from "../nav";
import { useMe, useSession } from "../session";
import type { Stage } from "../standing";
import { color, space } from "../theme";
import { Body, Button, Field, Small, Screen, Title } from "../ui";

// "Meet your cat" (Feed the Kitty), once, right after the passkey. She's
// drawn from the new address, so she looks the same on every phone; the
// member names her, and her name is sealed with their profile. Adopting her
// onchain happens in the background from Home, never in the way.

export function MeetCatScreen({ navigation }: ScreenProps<"MeetCat">) {
  const { address } = useMe();
  const { nameCat } = useSession();
  const [name, setName] = useState("");
  const [stage, setStage] = useState<Stage>("Shy");
  const [busy, setBusy] = useState(false);

  // a returning account may already have earned her trust
  useEffect(() => {
    readStanding(address)
      .then((p) => setStage(p.stage))
      .catch(() => {});
  }, [address]);

  async function done(catName: string) {
    setBusy(true);
    await nameCat(catName).catch(() => {});
    navigation.replace("Home");
  }

  const trimmed = name.trim();
  return (
    <Screen
      footer={
        <View style={{ gap: space.sm }}>
          <Button label={trimmed ? `Call her ${trimmed}` : "Name her"} busy={busy} disabled={!trimmed || busy} onPress={() => done(trimmed)} />
          <Button label="Not now" tone="quiet" disabled={busy} onPress={() => done("")} />
        </View>
      }
    >
      <Title>Meet your cat</Title>
      <View style={{ alignItems: "center", marginVertical: space.md }}>
        <Cat owner={address} stage={stage} size={200} label="Your new cat, peeking out of her box" />
      </View>
      <Body>
        Every Kitty account comes with a cat. Her coat comes from your account, so she looks the same on any phone you sign in on.
      </Body>
      <Body style={{ color: color.slate }}>
        Each round you pay on time is a meal. Kept promises slowly earn her trust, and her trust decides your place in the queue in
        your circles. She never touches your money.
      </Body>
      <Field label="What will you call her?" placeholder="Mimi" value={name} onChangeText={setName} autoCapitalize="words" maxLength={16} />
      <Small>You can turn her drawing off later on Account. Your terms stay the same either way.</Small>
    </Screen>
  );
}
