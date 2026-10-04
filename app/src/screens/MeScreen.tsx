import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useState } from "react";
import { Linking, View } from "react-native";

import { BottomNav } from "../Brand";
import { explorerAddress } from "../chain";
import { initials, money, shortAddress } from "../format";
import { recordOf, type Passbook } from "../indexer";
import { loadSnapshot, type Snapshot } from "../kitty";
import type { ScreenProps } from "../nav";
import { useMe, useSession } from "../session";
import { nextWords, standingOf, TIER_LINE, type Standing } from "../standing";
import { listCircles, type CircleRef } from "../store";
import { color, space } from "../theme";
import { Bead, Body, Button, List, Notice, Row, Screen, Section, Small, Tag, Title } from "../ui";

type Words = { label: string; tone: "leaf" | "clay" | "slate" | "marigold"; clean: boolean };

// FR-TRU-11: standing reads as plain words, never a number, and never
// "credit", "score", "rating" or "collateral".
function standingWords(s: Snapshot | null): Words {
  if (!s) return { label: "Could not update", tone: "slate", clean: false };
  const mine = s.me ? s.members[s.me.seat] : undefined;
  if (!mine) return { label: "Not joined", tone: "slate", clean: false };
  if (mine.standing === "defaulted") return { label: "Missed, not repaid", tone: "clay", clean: false };
  if (s.state === "completed") return { label: "Finished", tone: "marigold", clean: true };
  if (s.state === "cancelled") return { label: "Called off", tone: "slate", clean: true };
  if (mine.standing === "behind") return { label: "Catching up", tone: "clay", clean: false };
  return { label: "Up to date", tone: "leaf", clean: true };
}

// SRS 15.5: what the one passkey secret turns into, in words
const KEYS: [string, string][] = [
  ["Your account", "Signs payments and joins"],
  ["Sealed bids", "Keeps your bid secret until the reveal"],
  ["Circle names", "Locks each circle's member names"],
  ["Invite links", "One key per seat, so links can be made again"],
  ["Your profile", "Your name and country, locked"],
  ["Send links", "Money sent by link, which you can take back"],
];

function passbookLines(b: Passbook): string[] {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const lines = [
    `${n(b.circlesJoined, "circle", "circles")} joined, ${b.circlesCompleted} finished`,
    `Paid on time ${n(b.paidOnTime, "time", "times")}${b.paidLate ? `, late ${n(b.paidLate, "time", "times")}` : ""}`,
    `${money(b.totalContributed)} paid into circles`,
  ];
  if (b.potsReceived) lines.push(`Received the pot ${n(b.potsReceived, "time", "times")}`);
  if (b.counterparties) lines.push(`Saved with ${n(b.counterparties, "person", "people")}`);
  if (b.sends || b.receives) lines.push(`Sent money ${n(b.sends, "time", "times")}, received ${n(b.receives, "time", "times")}`);
  return lines;
}

export function MeScreen({ navigation }: ScreenProps<"Me">) {
  const { address, signer } = useMe();
  const { profile, lock, forget } = useSession();
  const [book, setBook] = useState<Passbook | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [items, setItems] = useState<{ ref: CircleRef; snap: Snapshot | null }[]>([]);
  const [copied, setCopied] = useState(false);

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      recordOf(address).then(setBook).catch(() => {});
      standingOf(address).then(setStanding).catch(() => {});
      const refs = await listCircles(address);
      const snaps = await Promise.all(refs.map((r) => loadSnapshot(r.address, address).catch(() => null)));
      setItems(refs.map((ref, i) => ({ ref, snap: snaps[i] })));
      setLoaded(true);
      setLoadError(snaps.some((s) => !s));
    } catch { setLoadError(true); }
    finally { setRefreshing(false); }
  }, [address]);
  useEffect(() => { void load(); }, [load]);

  const clean = items.filter((i) => standingWords(i.snap).clean).length;

  return (
    <Screen onBack={() => navigation.goBack()} footer={<BottomNav active="Account" onHome={() => navigation.navigate("Home")} onJoin={() => navigation.navigate("Paste")} onAccount={() => {}} />}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.sm }}>
        <Bead label={initials(profile?.name ?? "?")} size={64} />
        <View style={{ flex: 1 }}>
          <Title>{profile?.name}</Title>
          <Small>
            {!loaded ? "Checking your circles…" : items.length === 0
              ? "No circles yet"
              : `${items.length} ${items.length === 1 ? "circle" : "circles"}, in good shape in ${clean}`}
          </Small>
        </View>
      </View>

      {loadError && <><Notice tone="error">Couldn’t update your record. Check your connection and try again.</Notice><Button label="Try again" busy={refreshing} onPress={load} /></>}
      {standing && (
        <Section title="Your standing" right={<Tag label={standing.tier} tone={standing.tier === "Newcomer" ? "slate" : "leaf"} />}>
          <Body>{TIER_LINE[standing.tier]}</Body>
          <Small>{nextWords(standing.next)}</Small>
          <Small>Standing only ever helps. A missed round never puts you below where a newcomer starts.</Small>
        </Section>
      )}

      {items.length > 0 && (
        <Section title="Your record">
          <List>
            {items.map(({ ref, snap }, i) => {
              const w = standingWords(snap);
              return (
                <Row key={ref.address} last={i === items.length - 1} onPress={() => navigation.navigate("Circle", { address: ref.address })}>
                  <Body style={{ flex: 1 }} >
                    {ref.title}
                  </Body>
                  <Tag label={w.label} tone={w.tone} />
                </Row>
              );
            })}
          </List>
          <Small>Paying on time keeps your record clean. Catching up clears a missed round.</Small>
        </Section>
      )}

      {book && (
        <Section title="Across every circle">
          <List>
            {passbookLines(book).map((line, i, all) => (
              <Row key={line} last={i === all.length - 1}>
                <Body style={{ flex: 1 }}>{line}</Body>
              </Row>
            ))}
          </List>
          <Small>Read from the public record, so it follows your account to any phone.</Small>
        </Section>
      )}

      <Section title="One passkey, many keys">
        <Small>
          Your fingerprint unlocks one secret on this phone. Kitty works out every other key from it when you need it and never stores
          them, so a new phone and the same passkey bring everything back.
        </Small>
        <List>
          {KEYS.map(([what, why], i) => (
            <Row key={what} last={i === KEYS.length - 1}>
              <View style={{ flex: 1 }}>
                <Body>{what}</Body>
                <Small>{why}</Small>
              </View>
            </Row>
          ))}
        </List>
        <Small>{signer ? "Unlocked now." : "Locked. Kitty asks for your fingerprint when it next needs a key."}</Small>
      </Section>

      <Section title="Account details">
        <Small>For support, or to look your account up on the public record.</Small>
        <List>
          <Row>
            <Body style={{ flex: 1 }} selectable>
              {shortAddress(address)}
            </Body>
            <Button
              label={copied ? "Copied" : "Copy"}
              tone="quiet"
              size="row"
              onPress={async () => {
                await Clipboard.setStringAsync(address);
                setCopied(true);
              }}
            />
          </Row>
          <Row last onPress={() => Linking.openURL(explorerAddress(address))}>
            <Body style={{ flex: 1 }}>See it on the public record</Body>
            <Body style={{ color: color.slate }}>›</Body>
          </Row>
        </List>
      </Section>

      <View style={{ gap: space.sm, marginTop: space.md }}>
        <Button label="Lock Kitty" tone="dark" onPress={lock} />
        <Button label="Sign out on this phone" tone="quiet" onPress={forget} />
        <Small>Signing out keeps your account. Sign back in with the same passkey. If a circle is missing, open its invite link again.</Small>
      </View>
    </Screen>
  );
}
