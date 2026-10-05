import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import { CatScene } from "../Cat";
import { explain } from "../errors";
import { readStanding } from "../kitty";
import type { ScreenProps } from "../nav";
import { useMe, useSession } from "../session";
import type { Stage } from "../standing";
import { color, radius, space } from "../theme";
import { Body, Button, Field, Notice, Small, Screen, Title } from "../ui";

// "Meet your cat" (Feed the Kitty), once, right after the passkey. She's
// drawn from the new address, so she looks the same on every phone; the
// member names her, and her name is sealed with their profile. Adopting her
// onchain happens in the background from Home, never in the way.

export function MeetCatScreen({ navigation }: ScreenProps<"MeetCat">) {
  const { address } = useMe();
  const { nameCat } = useSession();
  const [name, setName] = useState("");
  const [stage, setStage] = useState<Stage | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Returning accounts keep their actual stage; an unavailable read is not Shy.
  const load = useCallback(async () => {
    setLoadError(false);
    await readStanding(address).then((p) => setStage(p.stage)).catch(() => setLoadError(true));
  }, [address]);
  useEffect(() => { void load(); }, [load]);

  async function done(catName: string) {
    setBusy(true);
    setSaveError(null);
    try {
      await nameCat(catName);
      navigation.replace("Home");
    } catch (error) { setSaveError(explain(error)); }
    finally { setBusy(false); }
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
      <View style={{ overflow: "hidden", borderRadius: radius.hero, marginVertical: space.sm }}>
        {stage && <CatScene owner={address} stage={stage} />}
      </View>
      {loadError && <><Notice tone="error">Couldn't load your cat. Try again to see her current stage.</Notice><Button label="Try again" tone="quiet" onPress={load} /></>}
      {!stage && !loadError && <Small>Getting to know your cat…</Small>}
      {saveError && <Notice tone="error">{saveError}</Notice>}
      <Body>
        A little companion for every promise you keep. This one is yours, with the same coat and markings on every phone you sign in on.
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
