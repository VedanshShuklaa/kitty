import Slider from "@react-native-community/slider";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import { explain } from "../errors";
import { money, span, when } from "../format";
import { commitBid, loadSnapshot, potOf, type Snapshot } from "../kitty";
import type { ScreenProps } from "../nav";
import { useMe } from "../session";
import { color, radius, space } from "../theme";
import { Amount, Body, Button, Notice, Screen, Small, Title } from "../ui";

export function BidScreen({ route, navigation }: ScreenProps<"Bid">) {
  const { address, round } = route.params;
  const { address: me, need } = useMe();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [bps, setBps] = useState(1_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const s = await loadSnapshot(address, me);
      setSnap(s);
      setBps(Math.min(1_000, s.rules.maxBidBps));
    } catch (e) { setError(explain(e)); }
  }, [address, me]);

  useEffect(() => { void load(); }, [load]);

  if (!snap) {
    return (
      <Screen onBack={() => navigation.goBack()}>
        <Title>Want the pot sooner?</Title>
        {error ? <><Notice tone="error">{error}</Notice><Button label="Try again" onPress={load} /></> : <Small>Loading…</Small>}
      </Screen>
    );
  }

  const r = snap.rules;
  const n = r.memberCount;
  // If everyone pays, this is the round's pot. The winner's discount is
  // shared out; part of the rest is held back and released as they keep
  // paying (SRS 7.7).
  const gross = potOf(r);
  const discount = (gross * BigInt(bps)) / 10_000n;
  let holdback = round < n ? (r.contribution * BigInt(n - round) * BigInt(r.holdbackBps)) / 10_000n : 0n;
  if (holdback > gross - discount) holdback = gross - discount;
  const takeNow = gross - discount - holdback;

  async function seal() {
    setBusy(true);
    setError(null);
    try {
      await commitBid(await need(), address, round, bps);
      navigation.goBack();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      onBack={() => navigation.goBack()}
      footer={<Button label={`Seal my offer: give up ${money(discount)}`} busy={busy} onPress={seal} />}
    >
      <Title>Want the pot sooner?</Title>
      <Body style={{ color: color.slate }}>
        Offer to give up part of this round's {money(gross)} pot. The biggest offer takes it, and what they give up is shared with
        everyone else.
      </Body>

      <View style={{ backgroundColor: color.surface, borderRadius: radius.card, padding: space.lg, gap: space.sm }}>
        <Small>You'd get now</Small>
        <Amount>{money(takeNow)}</Amount>
        {holdback > 0n && <Small>plus {money(holdback)} back over the next rounds, as you keep paying.</Small>}
        <Slider
          style={{ marginTop: space.md, height: 48 }}
          disabled={busy}
          minimumValue={50}
          maximumValue={r.maxBidBps}
          step={50}
          value={bps}
          onValueChange={(v) => setBps(Math.round(v))}
          minimumTrackTintColor={color.marigold}
          maximumTrackTintColor={color.line}
          thumbTintColor={color.indigo}
          accessibilityLabel="How much of the pot to give up"
        />
        <Body>
          Give up {money(discount)} ({(bps / 100).toFixed(bps % 100 ? 1 : 0)}%)
        </Body>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button label="Give up less" tone="quiet" disabled={bps <= 50 || busy} onPress={() => setBps(Math.max(50, bps - 50))} style={{ flex: 1 }} />
          <Button label="Give up more" tone="quiet" disabled={bps >= r.maxBidBps || busy} onPress={() => setBps(Math.min(r.maxBidBps, bps + 50))} style={{ flex: 1 }} />
        </View>
        <Small>Adjust by 0.5% with the buttons, or use the slider. This estimate assumes everyone pays.</Small>
      </View>

      <Notice tone="info">
        Your offer stays sealed until {when(snap.due)}. After that you have {span(r.revealWindow)} to open it here, or it won't count.
        You also need to have paid this round.
      </Notice>
      {error && <Notice tone="error">{error}</Notice>}
    </Screen>
  );
}
