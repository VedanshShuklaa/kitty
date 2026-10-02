import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";

import { BottomNav, KittyLogo } from "../Brand";
import { explain } from "../errors";
import { countdown, initials, money } from "../format";
import { balanceOf, getTestDollars, loadSnapshot, type Snapshot } from "../kitty";
import type { ScreenProps } from "../nav";
import { plan } from "../phase";
import { useSession, useSigner } from "../session";
import { listCircles, type CircleRef } from "../store";
import { color, font, radius, space } from "../theme";
import { Amount, Bead, Body, Button, Heading, Notice, Screen, Small, Tag, Title } from "../ui";

type Item = { ref: CircleRef; snap: Snapshot | null };

function summary(snap: Snapshot): string {
  const p = plan(snap, snap.chainNow);
  const first = p.actions[0];
  if (first?.kind === "pay") return `Pay ${money(first.amount ?? 0n)} · due ${countdown(snap.due, snap.chainNow)}`;
  return first?.label ?? p.headline;
}

export function HomeScreen({ navigation }: ScreenProps<"Home">) {
  const signer = useSigner();
  const { profile } = useSession();
  const [items, setItems] = useState<Item[]>([]);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [funding, setFunding] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "good"; text: string } | null>(null);
  const loading = useRef(false);

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const refs = await listCircles(signer.address);
      const [bal, snaps] = await Promise.all([
        balanceOf(signer.address).catch(() => null),
        Promise.all(refs.map((r) => loadSnapshot(r.address, signer.address).catch(() => null))),
      ]);
      // Unknown amounts never become zero; a failed refresh is explicitly labelled.
      setBalance(bal);
      setItems(refs.map((ref, i) => ({ ref, snap: snaps[i] })));
      setLoaded(true);
      setLoadError(bal === null || snaps.some((s) => s === null));
    } catch {
      setLoadError(true);
    } finally {
      loading.current = false;
    }
  }, [signer.address]);

  useFocusEffect(useCallback(() => {
    void load();
    const id = setInterval(() => { if (AppState.currentState === "active") void load(); }, 12_000);
    const listener = AppState.addEventListener("change", (state) => { if (state === "active") void load(); });
    return () => { clearInterval(id); listener.remove(); };
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    await load().finally(() => setRefreshing(false));
  }

  async function fund() {
    setFunding(true);
    setNotice(null);
    try {
      await getTestDollars(signer);
      await load();
      setNotice({ tone: "good", text: "Test dollars added." });
    } catch (e) {
      setNotice({ tone: "error", text: explain(e, "faucet") });
    } finally {
      setFunding(false);
    }
  }

  const needingAction = items.filter(({ snap }) => snap && plan(snap, snap.chainNow).actions.length > 0).length;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}
      footer={<BottomNav active="Home" onHome={() => {}} onJoin={() => navigation.navigate("Paste")} onAccount={() => navigation.navigate("Me")} />}>
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

      <View style={styles.balance}>
        <View style={styles.between}><Body>Available to use</Body><Tag label="Test dollars" tone="marigold" /></View>
        <Amount selectable>{balance === null ? "—" : money(balance)}</Amount>
        <Small>This is practice money, not real savings.</Small>
        <Button label="Add test dollars" tone="quiet" busy={funding} onPress={fund} style={{ alignSelf: "flex-start", marginTop: 4, borderColor: color.pinkBright }} />
      </View>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {loadError && <View style={{ gap: 8 }}>
        <Notice tone="error">We couldn't update your balance or circles. Check your connection and try again.</Notice>
        <Button label="Try again" tone="quiet" busy={refreshing} onPress={refresh} />
      </View>}

      <View style={styles.actions}>
        <Button label="Start a circle" onPress={() => navigation.navigate("Create")} style={{ flex: 1 }} />
        <Button label="Join a circle" tone="quiet" onPress={() => navigation.navigate("Paste")} style={{ flex: 1 }} />
      </View>

      <View style={[styles.between, { marginTop: 8 }]}>
        <Heading>Your circles{loaded ? ` (${items.length})` : ""}</Heading>
        {needingAction > 0 && <Small style={{ color: color.pink }}>{needingAction} {needingAction === 1 ? "needs" : "need"} attention</Small>}
      </View>
      {!loaded ? (
        <Small>{loadError ? "Your circles will appear when you reconnect." : "Checking your circles…"}</Small>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <KittyLogo size={72} />
          <Heading>Your first circle starts here</Heading>
          <Body style={{ textAlign: "center", color: color.slate }}>Save with people you know. Start a circle, or join one using their invite link.</Body>
        </View>
      ) : items.map(({ ref, snap }) => {
        const paid = snap?.members.filter((m) => m.paid).length ?? 0;
        const joined = snap?.members.filter((m) => m.address).length ?? 0;
        const total = snap?.rules.memberCount ?? ref.names.length;
        const forming = snap?.state === "forming";
        const count = forming ? joined : paid;
        const active = snap?.state === "active";
        return <Pressable key={ref.address} accessibilityRole="button" accessibilityLabel={`Open ${ref.title}. ${snap ? summary(snap) : "Could not update"}`}
          onPress={() => navigation.navigate("Circle", { address: ref.address })}
          style={({ pressed }) => [styles.circle, pressed && { backgroundColor: color.pinkSoft }]}>
          <View style={styles.header}>
            <Bead label={initials(ref.title)} tone="mist" size={44} />
            <View style={{ flex: 1, gap: 2 }}>
              <Heading>{ref.title}</Heading>
              <Small>{snap ? (active ? `Round ${snap.round} of ${total}` : forming ? "Getting everyone together" : snap.state === "completed" ? "Circle complete" : "Circle called off") : "Could not update"}</Small>
            </View>
            <Body style={{ color: color.slate }}>›</Body>
          </View>
          <Body style={{ fontFamily: font.bodyMedium, color: color.pink }}>{snap ? summary(snap) : "Open circle to try again"}</Body>
          {(active || forming) && <>
            <View style={styles.track} accessible accessibilityLabel={`${count} of ${total} ${forming ? "joined" : "paid"}`}>
              <View style={[styles.fill, { width: `${total ? count / total * 100 : 0}%` }]} />
            </View>
            <View style={styles.between}>
              <Small>{count} of {total} {forming ? "joined" : "paid"}</Small>
              {snap && <Small>{money(snap.rules.contribution)} each round</Small>}
            </View>
          </>}
        </Pressable>;
      })}
      <View style={styles.help}>
        <Heading>Save together. Take turns.</Heading>
        <Small>Everyone pays into the circle. Each round, one person receives the pot. Check the rules before you join.</Small>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  account: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  between: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center" },
  balance: { backgroundColor: color.pinkSoft, borderRadius: radius.hero, padding: 22, gap: 10, marginTop: 6 },
  actions: { flexDirection: "row", gap: 10 },
  circle: { backgroundColor: color.surface, borderRadius: radius.card, padding: 18, gap: 14, borderWidth: 1, borderColor: color.line },
  track: { height: 6, borderRadius: 3, backgroundColor: color.line, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: color.pink },
  empty: { padding: space.lg, gap: 12, alignItems: "center", backgroundColor: color.surface, borderRadius: radius.card },
  help: { gap: 6, padding: 18, backgroundColor: color.cream, borderRadius: radius.card },
});
