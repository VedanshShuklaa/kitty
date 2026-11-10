import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { explain } from "../errors";
import { initials, money } from "../format";
import { claimLink, linkBalance, parseSendLink, SendFailed, type Settled } from "../money";
import type { ScreenProps } from "../nav";
import { useMe } from "../session";
import { color, font, space } from "../theme";
import { Amount, Bead, Body, Button, Notice, Panel, Screen, Small, Title } from "../ui";

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
        <Panel tone="hero" style={styles.hero}>
          <View style={styles.status}>
            <Ionicons name="checkmark-circle" size={24} color={color.leaf} accessibilityElementsHidden importantForAccessibility="no" />
            <Body style={{ flex: 1, fontFamily: font.bodyBold, color: color.leaf }}>Collected from {from}</Body>
          </View>
          <Amount style={{ color: color.pink }}>{money(done.amount)}</Amount>
          <Body>It's in your dollars. Settled in {(done.settled.ms / 1000).toFixed(1)} s.</Body>
        </Panel>
      </Screen>
    );
  }

  return (
    <Screen
      onBack={() => navigation.goBack()}
      footer={amount && amount > 0n ? <Button label={`Collect ${money(amount)}`} busy={busy} onPress={claim} /> : undefined}
    >
      <Panel tone="hero" style={styles.hero}>
        <View style={styles.status}>
          <Bead label={initials(from)} tone="paper" size={48} />
          <Body style={{ flex: 1, color: color.indigoSoft }}>{from} sent you</Body>
        </View>
        <Amount style={{ color: color.pink }}>{amount === null ? "…" : money(amount)}</Amount>
        <Body>Test dollars on Kitty. Collect them into your account.</Body>
      </Panel>
      {amount === 0n && <Notice tone="info">This money has already been collected, or the sender took it back.</Notice>}
      {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: space.sm, gap: space.md },
  status: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
