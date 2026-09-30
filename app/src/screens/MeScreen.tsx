import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { Linking, View } from "react-native";

import { explorerAddress } from "../chain";
import { initials, shortAddress } from "../format";
import { loadSnapshot, type Snapshot } from "../kitty";
import type { ScreenProps } from "../nav";
import { useSession, useSigner } from "../session";
import { listCircles, type CircleRef } from "../store";
import { space } from "../theme";
import { Bead, Body, Button, List, Row, Screen, Section, Small, Tag, Title } from "../ui";

type Words = { label: string; tone: "leaf" | "clay" | "slate" | "marigold"; clean: boolean };

// FR-TRU-11: standing reads as plain words, never a number, and never
// "credit", "score", "rating" or "collateral".
function standingWords(s: Snapshot | null): Words {
  if (!s) return { label: "Loading", tone: "slate", clean: false };
  const mine = s.me ? s.members[s.me.seat] : undefined;
  if (!mine) return { label: "Not joined", tone: "slate", clean: false };
  if (mine.standing === "defaulted") return { label: "Missed, not repaid", tone: "clay", clean: false };
  if (s.state === "completed") return { label: "Finished", tone: "marigold", clean: true };
  if (s.state === "cancelled") return { label: "Called off", tone: "slate", clean: true };
  if (mine.standing === "behind") return { label: "Catching up", tone: "clay", clean: false };
  return { label: "Up to date", tone: "leaf", clean: true };
}

export function MeScreen({ navigation }: ScreenProps<"Me">) {
  const signer = useSigner();
  const { profile, lock, forget } = useSession();
  const [items, setItems] = useState<{ ref: CircleRef; snap: Snapshot | null }[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    listCircles(signer.address).then(async (refs) => {
      setItems(refs.map((ref) => ({ ref, snap: null })));
      const snaps = await Promise.all(refs.map((r) => loadSnapshot(r.address, signer.address).catch(() => null)));
      setItems(refs.map((ref, i) => ({ ref, snap: snaps[i] })));
    });
  }, [signer.address]);

  const clean = items.filter((i) => standingWords(i.snap).clean).length;

  return (
    <Screen onBack={() => navigation.goBack()}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.sm }}>
        <Bead label={initials(profile?.name ?? "?")} size={64} />
        <View style={{ flex: 1 }}>
          <Title>{profile?.name}</Title>
          <Small>
            {items.length === 0
              ? "No circles yet"
              : `${items.length} ${items.length === 1 ? "circle" : "circles"}, in good shape in ${clean}`}
          </Small>
        </View>
      </View>

      {items.length > 0 && (
        <Section title="Your record">
          <List>
            {items.map(({ ref, snap }, i) => {
              const w = standingWords(snap);
              return (
                <Row key={ref.address} last={i === items.length - 1} onPress={() => navigation.navigate("Circle", { address: ref.address })}>
                  <Body style={{ flex: 1 }} numberOfLines={1}>
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

      <Section title="Account details">
        <Small>For support, or to look your account up on the public record.</Small>
        <List>
          <Row>
            <Body style={{ flex: 1 }} selectable>
              {shortAddress(signer.address)}
            </Body>
            <Button
              label={copied ? "Copied" : "Copy"}
              tone="quiet"
              style={{ minHeight: 36, paddingHorizontal: space.md }}
              onPress={async () => {
                await Clipboard.setStringAsync(signer.address);
                setCopied(true);
              }}
            />
          </Row>
          <Row last onPress={() => Linking.openURL(explorerAddress(signer.address))}>
            <Body style={{ flex: 1 }}>See it on the public record</Body>
            <Body>›</Body>
          </Row>
        </List>
      </Section>

      <View style={{ gap: space.sm, marginTop: space.md }}>
        <Button label="Lock Kitty" tone="dark" onPress={lock} />
        <Button label="Sign out on this phone" tone="quiet" onPress={forget} />
        <Small>Signing out keeps your account. Sign back in with the same passkey to see your circles again.</Small>
      </View>
    </Screen>
  );
}
