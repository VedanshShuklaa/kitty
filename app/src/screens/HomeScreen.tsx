import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import type { Address } from "viem";

import { BottomNav, KittyLogo } from "../Brand";
import { explain } from "../errors";
import { moneyLine } from "../feed";
import { countdown, initials, money, shortAddress } from "../format";
import { loadRates, localEstimate, type Rates } from "../fx";
import { transfersOf, type Transfer } from "../indexer";
import { getTestDollars, loadSnapshot, type Snapshot } from "../kitty";
import { balances, type Balances } from "../money";
import type { ScreenProps } from "../nav";
import { nameAt, plan } from "../phase";
import { useMe, useSession } from "../session";
import { listCircles, type CircleRef } from "../store";
import { tidyCircle, tidyStep } from "../tidy";
import { color, font, radius, space } from "../theme";
import { Amount, Bead, Body, Button, Heading, List, Notice, Progress, Row, Screen, Section, Small, Tag, Title } from "../ui";

type Item = { ref: CircleRef; snap: Snapshot | null };

function summary(snap: Snapshot): string {
  const p = plan(snap, snap.chainNow);
  const first = p.actions[0];
  if (first?.kind === "pay") return `Pay ${money(first.amount ?? 0n)} · due ${countdown(snap.due, snap.chainNow)}`;
  return first?.label ?? p.headline;
}

export function HomeScreen({ navigation }: ScreenProps<"Home">) {
  const { address, signer, need } = useMe();
  const { profile, onboarding, restored, restore } = useSession();
  const [items, setItems] = useState<Item[]>([]);
  const [bal, setBal] = useState<Balances | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [recent, setRecent] = useState<Transfer[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [funding, setFunding] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "good"; text: string } | null>(null);
  const loading = useRef(false);
  const tidied = useRef(new Set<string>());

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const refs = (await listCircles(address)).filter((r) => !r.archived);
      const [b, snaps] = await Promise.all([
        balances(address).catch(() => null),
        Promise.all(refs.map((r) => loadSnapshot(r.address, address).catch(() => null))),
      ]);
      // Unknown amounts never become zero; a failed refresh is explicitly labelled.
      setBal(b);
      setItems(refs.map((ref, i) => ({ ref, snap: snaps[i] })));
      setLoaded(true);
      setLoadError(b === null || snaps.some((s) => s === null));
      transfersOf(address, 6).then(setRecent).catch(() => setRecent(null));
    } catch {
      setLoadError(true);
    } finally {
      loading.current = false;
    }
  }, [address]);

  useFocusEffect(
    useCallback(() => {
      void load();
      loadRates().then(setRates);
      const id = setInterval(() => {
        if (AppState.currentState === "active") void load();
      }, 12_000);
      const listener = AppState.addEventListener("change", (state) => {
        if (state === "active") void load();
      });
      return () => {
        clearInterval(id);
        listener.remove();
      };
    }, [load]),
  );

  // a circle that can never start is called off and its deposit collected, once per visit
  useEffect(() => {
    if (!signer) return;
    const due = items.filter(({ ref, snap }) => snap && tidyStep(snap) && !tidied.current.has(ref.address));
    if (due.length === 0) return;
    for (const { ref } of due) tidied.current.add(ref.address);
    void (async () => {
      const lines: string[] = [];
      for (const { ref, snap } of due) {
        const done = await tidyCircle(signer, snap!).catch(() => null);
        if (done?.calledOff || (done && done.returned > 0n)) {
          lines.push(`${ref.title} didn't fill up in time, so it was called off${done.returned > 0n ? ` and your ${money(done.returned)} deposit is back` : ""}.`);
        }
      }
      if (lines.length) setNotice({ tone: "good", text: lines.join(" ") });
      await load();
    })();
  }, [items, signer, load]);

  // circles restored from the indexer land in the cache; show them as they arrive
  useEffect(() => {
    if (restored) void load();
  }, [restored, load]);

  async function refresh() {
    setRefreshing(true);
    await restore().catch(() => {});
    await load().finally(() => setRefreshing(false));
  }

  async function fund() {
    setFunding(true);
    setNotice(null);
    try {
      await getTestDollars(await need());
      await load();
      setNotice({ tone: "good", text: "Test dollars added." });
    } catch (e) {
      setNotice({ tone: "error", text: explain(e, "faucet") });
    } finally {
      setFunding(false);
    }
  }

  // names for the money list, from everyone in this phone's circles
  const names = new Map<string, string>();
  for (const { ref, snap } of items) {
    for (const m of snap?.members ?? []) if (m.address) names.set(m.address.toLowerCase(), nameAt(ref.names, m.seat));
  }
  const who = (a: Address | null) => (a ? (names.get(a.toLowerCase()) ?? shortAddress(a)) : "Someone");

  const needingAction = items.filter(({ snap }) => snap && plan(snap, snap.chainNow).actions.length > 0).length;
  const local = bal ? localEstimate(bal.dollars + bal.cashOut, profile?.country, rates) : null;

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={refresh}
      footer={<BottomNav active="Home" onHome={() => {}} onJoin={() => navigation.navigate("Paste")} onAccount={() => navigation.navigate("Me")} />}
    >
      <View style={styles.header}>
        <KittyLogo />
        <View style={{ flex: 1, gap: 2 }}>
          <Small>Good to see you</Small>
          <Title>Hello, {profile?.name || "friend"}</Title>
        </View>
        <Pressable onPress={() => navigation.navigate("Me")} accessibilityRole="button" accessibilityLabel="Your account" style={styles.account}>
          <Bead label={initials(profile?.name ?? "?")} tone="mist" size={44} />
        </Pressable>
      </View>

      {onboarding && "seconds" in onboarding && (
        <Notice tone="good">Your account is ready. It was set up on the network {onboarding.seconds.toFixed(1)} s after your fingerprint.</Notice>
      )}
      {onboarding && "error" in onboarding && <Notice tone="error">{onboarding.error}</Notice>}

      <View style={styles.balance}>
        <View style={styles.between}>
          <Body>Your money</Body>
          <Tag label="Test dollars" tone="marigold" />
        </View>
        <Amount selectable>{bal === null ? "—" : money(bal.dollars)}</Amount>
        {bal && bal.cashOut > 0n && <Small>plus {money(bal.cashOut)} ready to cash out</Small>}
        {local && <Small>{local} in all (approximate)</Small>}
        <Small>This is practice money, not real savings.</Small>
        <View style={styles.actions}>
          <Button label="Send" onPress={() => navigation.navigate("Send")} style={{ flex: 1 }} />
          <Button label="Receive" tone="quiet" onPress={() => navigation.navigate("Receive")} style={{ flex: 1 }} />
        </View>
        <Button label="Add test dollars" tone="quiet" size="row" busy={funding} onPress={fund} style={{ alignSelf: "flex-start" }} />
      </View>
      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      {loadError && (
        <View style={{ gap: space.sm }}>
          <Notice tone="error">We couldn't update your balance or circles. Check your connection and try again.</Notice>
          <Button label="Try again" tone="quiet" busy={refreshing} onPress={refresh} />
        </View>
      )}

      {recent && recent.length > 0 && (
        <Section title="Recent money">
          <List>
            {recent.map((t, i) => {
              const line = moneyLine(t, address, who);
              return (
                <Row key={t.id} last={i === recent.length - 1}>
                  <Body style={{ flex: 1 }}>{line.text}</Body>
                  {line.sign !== "none" && <Tag label={line.sign === "in" ? "In" : "Out"} tone={line.sign === "in" ? "leaf" : "slate"} />}
                </Row>
              );
            })}
          </List>
        </Section>
      )}

      <View style={styles.actions}>
        <Button label="Start a circle" onPress={() => navigation.navigate("Create")} style={{ flex: 1 }} />
        <Button label="Join a circle" tone="quiet" onPress={() => navigation.navigate("Paste")} style={{ flex: 1 }} />
      </View>

      <View style={[styles.between, { marginTop: space.sm }]}>
        <Heading>Your circles{loaded ? ` (${items.length})` : ""}</Heading>
        {needingAction > 0 && (
          <Small style={{ color: color.pink }}>
            {needingAction} {needingAction === 1 ? "needs" : "need"} attention
          </Small>
        )}
      </View>
      {restored?.indexerDown && <Small>Showing the circles saved on this phone. Kitty's records are out of reach right now.</Small>}
      {!loaded ? (
        <Small>{loadError ? "Your circles will appear when you reconnect." : "Checking your circles…"}</Small>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <KittyLogo size={72} />
          <Heading>{restored ? "Your first circle starts here" : "Looking for your circles…"}</Heading>
          <Body style={{ textAlign: "center", color: color.slate }}>Save with people you know. Start a circle, or join one using their invite link.</Body>
        </View>
      ) : (
        items.map(({ ref, snap }) => {
          const paid = snap?.members.filter((m) => m.paid).length ?? 0;
          const joined = snap?.members.filter((m) => m.address).length ?? 0;
          const total = snap?.rules.memberCount ?? ref.names.length;
          const forming = snap?.state === "forming";
          const count = forming ? joined : paid;
          const active = snap?.state === "active";
          return (
            <Pressable
              key={ref.address}
              accessibilityRole="button"
              accessibilityLabel={`Open ${ref.title}. ${snap ? summary(snap) : "Could not update"}`}
              onPress={() => navigation.navigate("Circle", { address: ref.address })}
              style={({ pressed }) => [styles.circle, pressed && { backgroundColor: color.pinkSoft }]}
            >
              <View style={styles.header}>
                <Bead label={initials(ref.title)} tone="mist" size={44} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Heading>{ref.title}</Heading>
                  <Small>
                    {snap
                      ? active
                        ? `Round ${snap.round} of ${total}`
                        : forming
                          ? "Getting everyone together"
                          : snap.state === "completed"
                            ? "Circle complete"
                            : "Circle called off"
                      : "Could not update"}
                  </Small>
                </View>
                <Body style={{ color: color.slate }}>›</Body>
              </View>
              <Body style={{ fontFamily: font.bodyMedium, color: color.pink }}>{snap ? summary(snap) : "Open circle to try again"}</Body>
              {(active || forming) && (
                <>
                  <Progress value={count} total={total} label={`${count} of ${total} ${forming ? "joined" : "paid"}`} />
                  <View style={styles.between}>
                    <Small>
                      {count} of {total} {forming ? "joined" : "paid"}
                    </Small>
                    {snap && <Small>{money(snap.rules.contribution)} each round</Small>}
                  </View>
                </>
              )}
            </Pressable>
          );
        })
      )}
      <View style={styles.help}>
        <Heading>Save together. Take turns.</Heading>
        <Small>Everyone pays into the circle. Each round, one person receives the pot. Check the rules before you join.</Small>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: space.md },
  account: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  between: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, justifyContent: "space-between", alignItems: "center" },
  balance: { backgroundColor: color.pinkSoft, borderRadius: radius.hero, padding: space.lg, gap: space.sm },
  actions: { flexDirection: "row", gap: space.sm },
  circle: { backgroundColor: color.surface, borderRadius: radius.card, padding: space.md, gap: space.md, borderWidth: 1, borderColor: color.line },
  empty: { padding: space.lg, gap: space.sm, alignItems: "center", backgroundColor: color.surface, borderRadius: radius.card },
  help: { gap: space.xs, padding: space.md, backgroundColor: color.cream, borderRadius: radius.card },
});
