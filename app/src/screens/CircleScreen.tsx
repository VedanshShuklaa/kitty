import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, Share, StyleSheet, useWindowDimensions, View } from "react-native";
import type { Hex } from "viem";

import { explorerAddress } from "../chain";
import { explain } from "../errors";
import { initials, money, when } from "../format";
import {
  cancelCircle,
  closeRound,
  contribute,
  loadSnapshot,
  payArrears,
  potOf,
  revealBid,
  withdraw,
  type Member,
  type Snapshot,
} from "../kitty";
import { inviteLink } from "../links";
import type { ScreenProps } from "../nav";
import { beadsFor, nameAt, nextInLine, plan, rulesInWords, type Action } from "../phase";
import { Ring } from "../Ring";
import { useSigner } from "../session";
import { getCircle, getInviteKeys, type CircleRef } from "../store";
import { color, font, radius, space } from "../theme";
import { Amount, Bead, Body, Button, Heading, List, Notice, Row, Screen, Section, Small, Tag, Title } from "../ui";

export function CircleScreen({ route, navigation }: ScreenProps<"Circle">) {
  const { address } = route.params;
  const signer = useSigner();
  const { width } = useWindowDimensions();
  const [ref, setRef] = useState<CircleRef | undefined>();
  const [keys, setKeys] = useState<(Hex | null)[] | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [offset, setOffset] = useState(0); // chain clock minus phone clock
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState<Action["kind"] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "good"; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getCircle(signer.address, address).then(setRef);
    getInviteKeys(address).then(setKeys);
  }, [signer.address, address]);

  const load = useCallback(async () => {
    try {
      const s = await loadSnapshot(address, signer.address);
      setSnap(s);
      setOffset(s.chainNow - Date.now() / 1000);
      setLoadError(null);
    } catch (e) {
      setLoadError(explain(e));
    }
  }, [address, signer.address]);

  useFocusEffect(
    useCallback(() => {
      load();
      const poll = setInterval(load, 5_000);
      const tick = setInterval(() => setTick((t) => t + 1), 1_000);
      return () => {
        clearInterval(poll);
        clearInterval(tick);
      };
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const now = Date.now() / 1000 + offset;
  const names = ref?.names ?? [];
  const title = ref?.title ?? "Savings circle";

  async function act(a: Action) {
    if (!snap) return;
    if (a.kind === "bid") {
      navigation.navigate("Bid", { address, round: snap.round });
      return;
    }
    setBusy(a.kind);
    setNotice(null);
    try {
      let done = "";
      switch (a.kind) {
        case "pay":
          await contribute(signer, address, snap.round, a.amount ?? 0n);
          done = "Paid. Everyone in the circle can see it.";
          break;
        case "reveal": {
          const bps = await revealBid(signer, address, snap.round, snap.rules.maxBidBps);
          done = `Your offer is open: you'd give up ${bps / 100}%.`;
          break;
        }
        case "close":
          await closeRound(signer, address, snap.round);
          done = "The pot has been handed out.";
          break;
        case "withdraw":
          await withdraw(signer, address);
          done = "Collected. It's in your test dollars now.";
          break;
        case "cancel":
          await cancelCircle(signer, address);
          done = "The circle is called off. Everyone can collect their deposit.";
          break;
        case "arrears":
          await payArrears(signer, address, a.amount ?? 0n);
          done = "You're caught up.";
          break;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setNotice({ tone: "good", text: done });
      await load();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setNotice({ tone: "error", text: explain(e) });
    } finally {
      setBusy(null);
    }
  }

  if (!snap) {
    return (
      <Screen onBack={() => navigation.goBack()}>
        <Title>{title}</Title>
        {loadError ? <Notice tone="error">{loadError}</Notice> : <Small>Loading the circle…</Small>}
      </Screen>
    );
  }

  const r = snap.rules;
  const n = r.memberCount;
  const p = plan(snap, now);
  const [primary, ...secondary] = p.actions;
  const beads = beadsFor(snap, names, now);
  const next = snap.state === "active" ? nextInLine(snap.members) : undefined;
  const mySeat = snap.me?.seat;
  const joined = snap.members.filter((m) => m.address).length;
  const ringSize = Math.min(width - space.md * 2 - space.lg * 2, 300);

  let heroLine = "";
  if (snap.state === "forming") heroLine = `First payment ${when(Number(r.firstDue))}`;
  else if (snap.state === "active" && next) {
    heroLine = next.seat === mySeat ? "You're next in line" : `${nameAt(names, next.seat)} is next in line`;
    heroLine += r.maxBidBps > 0 ? ", unless someone bids." : ".";
  } else if (snap.state === "completed") heroLine = `${n} rounds, ${n} pots. Done.`;
  else if (snap.state === "cancelled") heroLine = "Called off before it started.";

  return (
    <Screen
      onBack={() => navigation.goBack()}
      refreshing={refreshing}
      onRefresh={refresh}
      footer={
        primary ? (
          <Button label={primary.label} busy={busy === primary.kind} disabled={!!busy} onPress={() => act(primary)} />
        ) : undefined
      }
    >
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Heading style={{ color: color.onIndigo, flex: 1 }} numberOfLines={1}>
            {title}
          </Heading>
          {snap.state === "active" && (
            <Small style={{ color: color.onIndigoMuted }}>
              Round {snap.round} of {n}
            </Small>
          )}
        </View>
        <View style={{ alignItems: "center", marginVertical: space.sm }}>
          <Ring beads={beads} size={ringSize}>
            {snap.state === "forming" ? (
              <>
                <Amount style={{ color: color.onIndigo }}>
                  {joined} of {n}
                </Amount>
                <Small style={{ color: color.onIndigoMuted }}>have joined</Small>
              </>
            ) : snap.state === "active" ? (
              <>
                <Amount style={{ color: color.onIndigo }}>{money(snap.pot)}</Amount>
                <Small style={{ color: color.onIndigoMuted }}>of {money(potOf(r))} in the pot</Small>
              </>
            ) : (
              <Amount style={{ color: color.onIndigo, fontSize: 30 }}>{snap.state === "completed" ? "Done" : "Called off"}</Amount>
            )}
          </Ring>
        </View>
        <Body style={{ color: color.onIndigoMuted, textAlign: "center" }}>{heroLine}</Body>
      </View>

      <View style={{ gap: space.xs }}>
        <Title>{p.headline}</Title>
        <Body style={{ color: color.slate }}>{p.detail}</Body>
        {primary?.kind === "pay" && snap.me && (snap.me.creditUsed > 0n || snap.me.holdbackReleased > 0n) && (
          <Small>
            You pay {money(snap.me.pay)}: {money(r.contribution)}
            {snap.me.creditUsed > 0n ? `, less ${money(snap.me.creditUsed)} from others' offers` : ""}
            {snap.me.holdbackReleased > 0n ? `, less ${money(snap.me.holdbackReleased)} of your held-back pot` : ""}.
          </Small>
        )}
      </View>

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {secondary.map((a) => (
        <Button key={a.kind} label={a.label} tone="quiet" busy={busy === a.kind} disabled={!!busy} onPress={() => act(a)} />
      ))}

      <Section title="Members">
        <List>
          {snap.members.map((m, i) => (
            <MemberRow key={m.seat} m={m} snap={snap} name={nameAt(names, m.seat)} me={m.seat === mySeat} now={now} last={i === n - 1} />
          ))}
        </List>
      </Section>

      {snap.state === "forming" && ref?.organizer && keys && (
        <Section title="Invite links">
          <Small>Each link works for one person only. Send it to them on WhatsApp.</Small>
          <List>
            {snap.members
              .filter((m) => !m.address && keys[m.seat])
              .map((m, i, open) => {
                const link = inviteLink({ circle: address, seat: m.seat, key: keys[m.seat] as Hex, title, names });
                const who = nameAt(names, m.seat);
                return (
                  <Row key={m.seat} last={i === open.length - 1}>
                    <Bead label={initials(who)} tone="mist" />
                    <Body style={{ flex: 1 }}>{who}</Body>
                    <Button
                      label="Send"
                      tone="dark"
                      style={{ minHeight: 40, paddingHorizontal: space.md }}
                      onPress={() =>
                        Share.share({ message: `${who}, join "${title}", our savings circle on Kitty: ${link}` }).catch(() => {})
                      }
                    />
                  </Row>
                );
              })}
          </List>
        </Section>
      )}

      {snap.state !== "forming" && (
        <Section title="Rounds">
          <List>
            {Array.from({ length: n }, (_, i) => {
              const round = i + 1;
              const due = Number(r.firstDue) + i * r.period;
              const got = snap.recipients[i];
              const seat = got ? snap.members.find((m) => m.address?.toLowerCase() === got.toLowerCase())?.seat : undefined;
              const current = snap.state === "active" && round === snap.round;
              return (
                <Row key={round} last={round === n}>
                  <Body style={{ width: 76 }}>Round {round}</Body>
                  <Small style={{ flex: 1 }}>{when(due)}</Small>
                  {seat !== undefined ? (
                    <Tag label={seat === mySeat ? "You took it" : `${nameAt(names, seat)} took it`} tone="marigold" />
                  ) : current ? (
                    <Tag label="Now" tone="leaf" />
                  ) : null}
                </Row>
              );
            })}
          </List>
        </Section>
      )}

      <Section title="How this circle works">
        <View style={{ gap: space.sm }}>
          {rulesInWords(r).map((l) => (
            <Body key={l.lead}>
              <Body style={{ fontFamily: font.bodyBold }}>{l.lead}</Body> {l.text}
            </Body>
          ))}
        </View>
      </Section>

      <Pressable onPress={() => Linking.openURL(explorerAddress(address))} accessibilityRole="link" style={{ paddingVertical: space.sm }}>
        <Small style={{ textDecorationLine: "underline" }}>See this circle's public record</Small>
      </Pressable>
    </Screen>
  );
}

function MemberRow({ m, snap, name, me, now, last }: { m: Member; snap: Snapshot; name: string; me: boolean; now: number; last: boolean }) {
  let tag: { label: string; tone: "leaf" | "clay" | "slate" | "marigold" } | null = null;
  let bead: "indigo" | "leaf" | "clay" | "mist" = "mist";
  if (!m.address) tag = { label: "Not joined yet", tone: "slate" };
  else if (snap.state === "forming") {
    tag = { label: "Joined", tone: "leaf" };
    bead = "indigo";
  } else if (m.standing === "defaulted") {
    tag = { label: "Out", tone: "clay" };
    bead = "clay";
  } else if (snap.state === "active") {
    if (m.standing === "behind") tag = { label: `Behind ${money(m.arrears)}`, tone: "clay" };
    else if (m.paid) tag = { label: "Paid", tone: "leaf" };
    else if (now > snap.due) tag = { label: "Late", tone: "clay" };
    else tag = { label: "Not yet", tone: "slate" };
    bead = m.paid ? "leaf" : now > snap.due ? "clay" : "indigo";
  } else bead = "indigo";
  return (
    <Row last={last}>
      <Bead label={initials(name)} tone={bead} />
      <View style={{ flex: 1 }}>
        <Body>
          {name}
          {me ? " (you)" : ""}
        </Body>
        {m.received && <Small>Has had the pot</Small>}
      </View>
      {tag && <Tag label={tag.label} tone={tag.tone} />}
    </Row>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: color.indigo, borderRadius: radius.hero, padding: space.lg, marginTop: space.xs },
  heroTop: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
});
