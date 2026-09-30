import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import { explain } from "../errors";
import { countdown, initials, money } from "../format";
import { balanceOf, getTestDollars, loadSnapshot, type Snapshot } from "../kitty";
import type { ScreenProps } from "../nav";
import { beadsFor, plan } from "../phase";
import { MiniRing } from "../Ring";
import { useSession, useSigner } from "../session";
import { listCircles, type CircleRef } from "../store";
import { color, space } from "../theme";
import { Bead, Body, Button, Heading, List, Notice, Row, Screen, Small, Title } from "../ui";

type Item = { ref: CircleRef; snap: Snapshot | null };

/** One line per circle: what, if anything, this member needs to do. */
function summary(snap: Snapshot, now: number): string {
  const p = plan(snap, now);
  const first = p.actions[0];
  if (first?.kind === "pay") return `Your turn to pay ${money(first.amount ?? 0n)}, due ${countdown(snap.due, now)}.`;
  if (first) return first.label;
  return p.headline;
}

export function HomeScreen({ navigation }: ScreenProps<"Home">) {
  const signer = useSigner();
  const { profile } = useSession();
  const [items, setItems] = useState<Item[]>([]);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [funding, setFunding] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "good"; text: string } | null>(null);

  const load = useCallback(async () => {
    const refs = await listCircles(signer.address);
    setItems((prev) => refs.map((ref) => ({ ref, snap: prev.find((p) => p.ref.address === ref.address)?.snap ?? null })));
    const [bal, snaps] = await Promise.all([
      balanceOf(signer.address).catch(() => null),
      Promise.all(refs.map((r) => loadSnapshot(r.address, signer.address).catch(() => null))),
    ]);
    setBalance(bal);
    setItems(refs.map((ref, i) => ({ ref, snap: snaps[i] })));
  }, [signer.address]);

  useFocusEffect(
    useCallback(() => {
      load();
      const id = setInterval(load, 12_000);
      return () => clearInterval(id);
    }, [load]),
  );

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

  const now = Date.now() / 1000;

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={refresh}
      right={
        <Pressable onPress={() => navigation.navigate("Me")} accessibilityRole="button" accessibilityLabel="Your account" hitSlop={8}>
          <Bead label={initials(profile?.name ?? "?")} size={36} />
        </Pressable>
      }
      footer={
        <>
          <Button label="Start a circle" onPress={() => navigation.navigate("Create")} />
          <Button label="Open an invite link" tone="quiet" onPress={() => navigation.navigate("Paste")} />
        </>
      }
    >
      <Title>Hi, {profile?.name}</Title>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
        <Body style={{ flex: 1 }}>
          {balance === null ? "Checking your test dollars…" : `You have ${money(balance)} in test dollars.`}
        </Body>
        <Button label="Get more" tone="quiet" busy={funding} onPress={fund} style={{ minHeight: 40, paddingHorizontal: space.md }} />
      </View>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <Heading style={{ marginTop: space.sm }}>Your circles</Heading>
      {items.length === 0 ? (
        <View style={{ paddingVertical: space.lg, gap: space.sm }}>
          <Body>No circles yet.</Body>
          <Small>Start one with the people you already save with, or open the invite link someone sent you.</Small>
        </View>
      ) : (
        <List>
          {items.map(({ ref, snap }, i) => {
            const beads = snap ? beadsFor(snap, ref.names, now) : [];
            const turn = beads.findIndex((b) => b.turn);
            return (
              <Row
                key={ref.address}
                last={i === items.length - 1}
                onPress={() => navigation.navigate("Circle", { address: ref.address })}
              >
                <MiniRing tones={beads.map((b) => b.tone)} turn={turn >= 0 ? turn : undefined} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Heading numberOfLines={1}>{ref.title}</Heading>
                  <Small numberOfLines={2}>{snap ? summary(snap, now) : "Loading…"}</Small>
                </View>
                <Body style={{ color: color.slate }}>›</Body>
              </Row>
            );
          })}
        </List>
      )}
    </Screen>
  );
}
