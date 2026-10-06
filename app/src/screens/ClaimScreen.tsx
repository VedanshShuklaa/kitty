import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { KittyLogo } from "../Brand";
import { explain } from "../errors";
import { money } from "../format";
import { claimLink, linkBalance, parseSendLink, SendFailed, type Settled } from "../money";
import type { ScreenProps } from "../nav";
import { useMe } from "../session";
import { color, radius, space } from "../theme";
import { Amount, Body, Button, Notice, Screen, Small, Title } from "../ui";

// FR-SND-08: collect money someone sent by link. The link's one-time key signs
// a permit for this account, which then pulls the money. No prompt: it only
// moves money towards the member (SRS 15.4).

export function ClaimScreen({ route, navigation }: ScreenProps<"Claim">) {
  const { need } = useMe();
  const link = useMemo(() => parseSendLink(route.params.link), [route.params.link]);
  const [amount, setAmount] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ amount: bigint; settled: Settled } | null>(null);

  useEffect(() => {
    if (link) linkBalance(link.address).then(setAmount).catch(() => setError("Couldn't check this link. Go back and open it again."));
  }, [link]);

  if (!link) {
    return (
      <Screen onBack={() => navigation.goBack()}>
        <Title>This link doesn't work</Title>
        <Body>Ask the person who sent it to share it again, and open it straight from the message.</Body>
      </Screen>
    );
  }

  async function claim() {
    if (!link) return;
    setBusy(true);
    setError(null);
    try {
      const s = await need();
      setDone(await claimLink(s, link.key, Date.now()));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setError(e instanceof SendFailed ? e.message : explain(e));
    } finally {
      setBusy(false);
    }
  }

  const from = link.from ?? "Someone";

  if (done) {
    return (
      <Screen footer={<Button label="Done" onPress={() => navigation.popTo("Home")} />}>
        <View style={styles.hero}>
          <KittyLogo size={56} />
          <Small>From {from}</Small>
          <Amount>{money(done.amount)}</Amount>
          <Body>It's in your dollars. Settled in {(done.settled.ms / 1000).toFixed(1)} s.</Body>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      onBack={() => navigation.goBack()}
      footer={amount && amount > 0n ? <Button label={`Collect ${money(amount)}`} busy={busy} onPress={claim} /> : undefined}
    >
      <View style={styles.hero}>
        <KittyLogo size={56} />
        <Small>{from} sent you</Small>
        <Amount>{amount === null ? "…" : money(amount)}</Amount>
        <Body>Test dollars on Kitty. Collect them into your account.</Body>
      </View>
      {amount === 0n && <Notice tone="info">This money has already been collected, or the sender took it back.</Notice>}
      {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: color.pinkSoft, borderRadius: radius.hero, padding: space.lg, gap: space.sm, alignItems: "flex-start", marginTop: space.sm },
});
