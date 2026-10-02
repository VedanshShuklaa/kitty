import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { explain } from "../errors";
import { money } from "../format";
import { depositOf, JOIN_STEPS, joinCircle, loadSnapshot, type Snapshot } from "../kitty";
import { parseInvite } from "../links";
import type { ScreenProps } from "../nav";
import { nameAt, rulesInWords } from "../phase";
import { KittyLogo } from "../Brand";
import { useSigner } from "../session";
import { getCircle, saveCircle } from "../store";
import { color, font, radius, space } from "../theme";
import { Body, Button, Heading, Notice, Screen, Section, Small, Steps, Title, type StepState } from "../ui";

export function JoinScreen({ route, navigation }: ScreenProps<"Join">) {
  const signer = useSigner();
  const invite = useMemo(() => parseInvite(route.params.link), [route.params.link]);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [run, setRun] = useState<{ active: string; failed: boolean; error?: string } | null>(null);

  const load = useCallback(async () => {
    if (!invite) return;
    setLoadError(null);
    try { setSnap(await loadSnapshot(invite.circle, signer.address)); }
    catch (e) { setLoadError(explain(e)); }
  }, [invite, signer.address]);

  useEffect(() => { void load(); }, [load]);

  // A member who reinstalled comes back through their invite link: the chain
  // says they're in, but this phone has forgotten the circle. Put it back on
  // Home, with the names from the link (FR-ROS-02 stand-in).
  useEffect(() => {
    if (!invite || !snap?.me) return;
    const me = snap.me;
    getCircle(signer.address, invite.circle).then((known) => {
      if (known) return;
      return saveCircle(signer.address, {
        address: invite.circle,
        title: invite.title,
        names: invite.names,
        seat: me.seat,
        organizer: snap.organizer.toLowerCase() === signer.address.toLowerCase(),
        addedAt: Date.now(),
      });
    });
  }, [invite, snap, signer.address]);

  if (!invite) {
    return (
      <Screen onBack={() => navigation.goBack()}>
        <Title>This isn't a Kitty invite</Title>
        <Body>Ask the organizer to send the link again, and open it straight from WhatsApp.</Body>
      </Screen>
    );
  }

  const names = invite.names;
  const who = nameAt(names, invite.seat);
  const organizer = nameAt(names, 0);

  async function join() {
    if (!invite) return;
    let current = JOIN_STEPS[0].id;
    try {
      await joinCircle(signer, invite, (id) => {
        current = id;
        setRun({ active: id, failed: false });
      });
      await saveCircle(signer.address, {
        address: invite.circle,
        title: invite.title,
        names,
        seat: invite.seat,
        organizer: false,
        addedAt: Date.now(),
      });
      navigation.replace("Circle", { address: invite.circle });
    } catch (e) {
      setRun({ active: current, failed: true, error: explain(e) });
    }
  }

  if (run) {
    const at = JOIN_STEPS.findIndex((s) => s.id === run.active);
    const steps = JOIN_STEPS.map((s, i) => ({
      label: s.label,
      state: (i < at ? "done" : i === at ? (run.failed ? "failed" : "active") : "todo") as StepState,
    }));
    return (
      <Screen footer={run.failed ? <Button label="Try again" onPress={join} /> : undefined}>
        <Title>Joining {invite.title}</Title>
        <Small>Your phone may ask for your fingerprint or screen lock.</Small>
        <View style={{ marginTop: space.md }}>
          <Steps steps={steps} />
        </View>
        {run.error && <Notice tone="error">{run.error}</Notice>}
      </Screen>
    );
  }

  const now = Date.now() / 1000;
  let blocker: string | null = null;
  let already = false;
  if (snap) {
    const seat = snap.members[invite.seat];
    if (snap.me) already = true;
    else if (seat?.address) blocker = `${who} already took this place. If that wasn't you, ask ${organizer} for a new link.`;
    else if (snap.state !== "forming" || now >= Number(snap.rules.joinDeadline)) blocker = "Joining has closed for this circle.";
  }


  return (
    <Screen
      onBack={() => navigation.goBack()}
      footer={
        already ? (
          <Button label="Open the circle" onPress={() => navigation.replace("Circle", { address: invite.circle })} />
        ) : snap && !blocker ? (
          <Button label={`Join and put down ${money(depositOf(snap.rules))}`} onPress={join} />
        ) : undefined
      }
    >
      <View style={styles.hero}>
        <KittyLogo size={64} />
        <Small>{organizer} invited you to</Small>
        <Title>{invite.title}</Title>
        <Body>A place for {who}, with people you know.</Body>
        {snap && <View style={{ marginTop: space.sm, gap: space.sm }}>
          <Heading>{money(snap.rules.contribution)} each round</Heading>
          <Small>{snap.rules.memberCount} people · {snap.rules.memberCount} rounds</Small>
          <Small>Deposit to join: {money(depositOf(snap.rules))}. Read the rules below before you confirm.</Small>
        </View>}
      </View>

      {loadError && <><Notice tone="error">{loadError}</Notice><Button label="Try again" tone="quiet" onPress={load} /></>}
      {!snap && !loadError && <Small>Loading the circle…</Small>}
      {already && <Notice tone="good">You're already in this circle.</Notice>}
      {blocker && <Notice tone="error">{blocker}</Notice>}

      {snap && (
        <Section title="Before you join">
          <View style={{ gap: space.sm }}>
            {rulesInWords(snap.rules).map((l) => (
              <Body key={l.lead}>
                <Body style={{ fontFamily: font.bodyBold }}>{l.lead}</Body> {l.text}
              </Body>
            ))}
          </View>
        </Section>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: color.pinkSoft, borderRadius: radius.hero, padding: space.lg, gap: space.xs, marginTop: space.xs },
});
