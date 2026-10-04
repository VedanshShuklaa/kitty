import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, Share, StyleSheet, View } from "react-native";
import type { Address, Hex } from "viem";

import { explorerAddress } from "../chain";
import { explain } from "../errors";
import { feedLine } from "../feed";
import { initials, money, shortAddress, when } from "../format";
import { earnRate, feedOf, type Activity } from "../indexer";
import {
  cancelCircle,
  closeRound,
  contribute,
  inviteKeyFor,
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
import { nameAt, nextInLine, plan, rulesInWords, type Action } from "../phase";
import { remindersFor, syncReminders } from "../reminders";
import { rosterKeyHex, syncCircle } from "../restore";
import { useMe } from "../session";
import { getCircle, getInviteKeys, type CircleRef } from "../store";
import { tidyCircle, tidyStep } from "../tidy";
import { color, font, radius, space } from "../theme";
import { Amount, Bead, Body, Button, Heading, List, Notice, Row, Screen, Section, Small, Tag, Title } from "../ui";

export function CircleScreen({ route, navigation }: ScreenProps<"Circle">) {
  const { address } = route.params;
  const { address: me, signer, need } = useMe();
  const [ref, setRef] = useState<CircleRef | undefined>();
  const [legacyKeys, setLegacyKeys] = useState<(Hex | null)[] | null>(null);
  const [feed, setFeed] = useState<Activity[] | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [offset, setOffset] = useState(0); // chain clock minus phone clock
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState<Action["kind"] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "good"; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getCircle(me, address).then(setRef);
    getInviteKeys(address).then(setLegacyKeys);
    earnRate()
      .then((r) => setRate(r?.aprBps ?? null))
      .catch(() => {});
  }, [me, address]);

  // FR-KEY-03: the organizer's roster goes to Kitty's storage once, sealed
  useEffect(() => {
    if (ref && signer && ref.organizer && !ref.synced) {
      syncCircle(signer, ref)
        .then(() => getCircle(me, address).then(setRef))
        .catch(() => {});
    }
  }, [ref, signer, me, address]);

  const titleRef = useRef("Savings circle");
  titleRef.current = ref?.title ?? "Savings circle";
  const load = useCallback(async () => {
    try {
      const s = await loadSnapshot(address, me);
      const off = s.chainNow - Date.now() / 1000;
      setSnap(s);
      setOffset(off);
      setLoadError(null);
      syncReminders(address, remindersFor(s, titleRef.current, s.chainNow), off).catch(() => {});
      feedOf(address).then(setFeed).catch(() => {});
    } catch (e) {
      setLoadError(explain(e));
    }
  }, [address, me]);

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

  async function act(a: Action, auto = false) {
    if (!snap) return;
    if (a.kind === "bid") {
      navigation.navigate("Bid", { address, round: snap.round });
      return;
    }
    // the auto-close never prompts: it only runs while the session is live
    if (auto && !signer) return;
    setBusy(a.kind);
    setNotice(null);
    try {
      // SRS 15.4: these sign without a prompt while the session is live, and
      // after one unlock prompt if it has ended
      const s = await need();
      let done = "";
      switch (a.kind) {
        case "pay":
          await contribute(s, address, snap.round, a.amount ?? 0n);
          done = "Paid. Everyone in the circle can see it.";
          break;
        case "reveal": {
          const bps = await revealBid(s, address, snap.round, snap.rules.maxBidBps);
          done = `Your offer is open: you'd give up ${bps / 100}%.`;
          break;
        }
        case "close":
          await closeRound(s, address, snap.round);
          done = "The pot has been handed out.";
          break;
        case "withdraw":
          await withdraw(s, address);
          done = "Collected. It's in your test dollars now.";
          break;
        case "cancel":
          await cancelCircle(s, address);
          done = "The circle is called off. Everyone can collect their deposit.";
          break;
        case "arrears":
          await payArrears(s, address, a.amount ?? 0n);
          done = "You're caught up.";
          break;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setNotice({ tone: "good", text: auto ? "The round was due, so your phone handed out the pot." : done });
      await load();
    } catch (e) {
      if (auto) {
        // another member's phone likely got there first; just catch up
        await load();
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setNotice({ tone: "error", text: explain(e) });
    } finally {
      setBusy(null);
    }
  }

  // FR-KEEP-01: an open circle whose round is due gets closed by whichever
  // member's phone has it open, without a prompt. Once per round per visit;
  // the button stays as the manual path.
  const closable = !!snap && snap.state === "active" && now >= snap.due + snap.rules.grace;
  const autoClosed = useRef<number | null>(null);
  useEffect(() => {
    if (!snap || !closable || busy || loadError || !signer || autoClosed.current === snap.round) return;
    autoClosed.current = snap.round;
    act({ kind: "close", label: "Hand out the pot" }, true);
    // act is recreated every render, so it stays out of the deps; the round
    // guard keeps this to one call
  }, [snap, closable, busy, loadError, signer]);

  // a circle that can't start any more is called off and the deposit collected, without a prompt
  const tidying = useRef(false);
  useEffect(() => {
    const step = snap ? tidyStep(snap) : null;
    if (!snap || !signer || busy || tidying.current || (step !== "cancel" && step !== "withdraw")) return;
    tidying.current = true;
    setBusy(step);
    tidyCircle(signer, snap)
      .then((done) => {
        if (done) {
          setNotice({
            tone: "good",
            text: `Not everyone joined in time, so the circle is called off.${done.returned > 0n ? ` Your ${money(done.returned)} deposit is back in your dollars.` : ""}`,
          });
        }
      })
      .catch((e) => setNotice({ tone: "error", text: explain(e) }))
      .finally(() => {
        setBusy(null);
        void load();
      });
  }, [snap, signer, busy, load]);

  if (!snap) {
    return (
      <Screen onBack={() => navigation.goBack()}>
        <Title>{title}</Title>
        {loadError ? <><Notice tone="error">{loadError}</Notice><Button label="Try again" busy={refreshing} onPress={refresh} /></> : <Small>Loading the circle…</Small>}
      </Screen>
    );
  }

  const r = snap.rules;
  const n = r.memberCount;
  const p = plan(snap, now);
  const [primary, ...secondary] = p.actions;
  const next = snap.state === "active" ? nextInLine(snap.members) : undefined;
  const mySeat = snap.me?.seat;
  const joined = snap.members.filter((m) => m.address).length;
  const paid = snap.members.filter((m) => m.paid).length;

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
          <Button label={primary.label} busy={busy === primary.kind} disabled={!!busy || !!loadError} onPress={() => act(primary)} />
        ) : undefined
      }
    >
      <Title>{title}</Title>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Body>{snap.state === "forming" ? "Getting your circle ready" : "This round’s pot"}</Body>
          {snap.state === "active" && <Tag label={`Round ${snap.round} of ${n}`} tone="marigold" />}
        </View>
        {snap.state === "forming" ? <>
          <Amount>{joined} of {n}</Amount>
          <Small>people have joined</Small>
        </> : snap.state === "active" ? <>
          <Amount selectable>{money(snap.pot)}</Amount>
          <Small>of {money(potOf(r))} expected · {paid} of {n} paid</Small>
        </> : <Heading>{snap.state === "completed" ? "Circle complete" : "Circle called off"}</Heading>}
        {(snap.state === "forming" || snap.state === "active") && <View style={styles.track}>
          <View style={[styles.fill, { width: `${(snap.state === "forming" ? joined : paid) / n * 100}%` }]} />
        </View>}
        <Body>{heroLine}</Body>
        {snap.yield && snap.yield.earned > 0n && (
          <Small>
            Deposits have earned {money(snap.yield.earned)} so far (simulated testnet yield, following earnAUSD on Monad mainnet
            {rate !== null && rate > 0 ? `, now ${(rate / 100).toFixed(1)}% a year` : ""}).
          </Small>
        )}
      </View>
      {loadError && <><Notice tone="error">Couldn't refresh. These are the last loaded amounts. Refresh before making a payment.</Notice><Button label="Try again" tone="quiet" busy={refreshing} onPress={refresh} /></>}

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

      {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      {secondary.map((a) => (
        <Button key={a.kind} label={a.label} tone="quiet" busy={busy === a.kind} disabled={!!busy || !!loadError} onPress={() => act(a)} />
      ))}

      <Section title="Members">
        <List>
          {snap.members.map((m, i) => (
            <MemberRow key={m.seat} m={m} snap={snap} name={nameAt(names, m.seat)} me={m.seat === mySeat} now={now} last={i === n - 1} />
          ))}
        </List>
      </Section>

      {snap.state === "forming" && ref?.organizer && (
        <Section title="Invite links">
          <Small>Each link works for one person only. Send it to them on WhatsApp.</Small>
          {!signer && !legacyKeys ? (
            <Button label="Unlock to show invite links" tone="quiet" onPress={() => need().catch(() => {})} />
          ) : (
            <List>
              {snap.members
                .filter((m) => !m.address && m.seat > 0)
                .map((m, i, open) => {
                  // FR-KEY-02: derived from the passkey, so any phone it signs in on can re-share them
                  const key = legacyKeys?.[m.seat] ?? (signer ? inviteKeyFor(signer, address, m.seat) : null);
                  if (!key) return null;
                  const roster = signer && !legacyKeys ? rosterKeyHex(signer, address) : null;
                  const link = inviteLink({ circle: address, seat: m.seat, key, title, names, roster });
                  const who = nameAt(names, m.seat);
                  return (
                    <Row key={m.seat} last={i === open.length - 1}>
                      <Bead label={initials(who)} tone="mist" />
                      <Body style={{ flex: 1 }}>{who}</Body>
                      <Button
                        label="Send"
                        tone="dark"
                        style={{ minHeight: 48, paddingHorizontal: space.md }}
                        onPress={() =>
                          Share.share({ message: `${who}, join "${title}", our savings circle on Kitty: ${link}` }).catch(() => {})
                        }
                      />
                    </Row>
                  );
                })}
            </List>
          )}
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

      {feed && feed.length > 0 && (
        <Section title="What's happened">
          <List>
            {feed
              .map((a) => ({ a, line: feedLine(a, (who: Address | null) => personName(who, snap, names, me)) }))
              .filter((x): x is { a: Activity; line: string } => !!x.line)
              .slice(0, 12)
              .map(({ a, line }, i, rows) => (
                <Row key={a.id} last={i === rows.length - 1}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Body>{line}</Body>
                    <Small>{when(a.at)}</Small>
                  </View>
                </Row>
              ))}
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

/** "You", the member's name from the roster, or a short address for someone outside the circle. */
function personName(who: Address | null, snap: Snapshot, names: string[], me: Address): string {
  if (!who) return "Someone";
  if (who.toLowerCase() === me.toLowerCase()) return "You";
  const m = snap.members.find((x) => x.address?.toLowerCase() === who.toLowerCase());
  return m ? nameAt(names, m.seat) : shortAddress(who);
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
  hero: { backgroundColor: color.pinkSoft, borderRadius: radius.hero, padding: 20, gap: 10 },
  track: { height: 7, backgroundColor: color.surface, borderRadius: 4, overflow: "hidden" },
  fill: { height: 7, backgroundColor: color.pink, borderRadius: 4 },
  heroTop: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: space.sm },
});
