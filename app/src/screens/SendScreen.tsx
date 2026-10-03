import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Linking, Pressable, Share, StyleSheet, View } from "react-native";
import type { Address } from "viem";

import { explorerTx } from "../chain";
import { explain } from "../errors";
import { initials, money, parseMoney, shortAddress } from "../format";
import { loadRates, localEstimate, type Rates } from "../fx";
import { membersOf } from "../indexer";
import { loadSnapshot } from "../kitty";
import { balances, createSendLink, parsePayee, sendMoney, SendFailed, type Arrival, type Balances, type Settled } from "../money";
import type { ScreenProps } from "../nav";
import { nameAt } from "../phase";
import { useMe, useSession } from "../session";
import { listCircles } from "../store";
import { color, radius, space } from "../theme";
import { Amount, Bead, Body, Button, Choice, Field, Heading, List, Notice, Row, Screen, Section, Small, Title } from "../ui";

// FR-SND-01..04: pick a person, type an amount, choose how it arrives, confirm
// with a fingerprint. One transaction, timed from the tap to a receipt at the
// safe block.

type Person = { address: Address; name: string; circle: string };

const ARRIVALS: { label: string; value: Arrival }[] = [
  { label: "As dollars", value: "dollars" },
  { label: "Ready to cash out", value: "cashOut" },
];

async function people(me: Address): Promise<Person[]> {
  const refs = await listCircles(me);
  const byCircle = new Map(refs.map((r) => [r.address.toLowerCase(), r]));
  let seats: { circle: Address; seat: number; address: Address }[];
  try {
    seats = await membersOf(refs.map((r) => r.address));
  } catch {
    // the indexer is down: read who sits where from the chain instead
    const snaps = await Promise.all(refs.map((r) => loadSnapshot(r.address, null).catch(() => null)));
    seats = snaps.flatMap((s) =>
      s ? s.members.filter((m) => m.address).map((m) => ({ circle: s.address, seat: m.seat, address: m.address as Address })) : [],
    );
  }
  const out = new Map<string, Person>();
  for (const s of seats) {
    if (s.address.toLowerCase() === me.toLowerCase() || out.has(s.address.toLowerCase())) continue;
    const ref = byCircle.get(s.circle.toLowerCase());
    out.set(s.address.toLowerCase(), { address: s.address, name: nameAt(ref?.names ?? [], s.seat), circle: ref?.title ?? "" });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function SendScreen({ route, navigation }: ScreenProps<"Send">) {
  const { address, confirm } = useMe();
  const { profile } = useSession();
  const [list, setList] = useState<Person[] | null>(null);
  const [to, setTo] = useState<{ address: Address; name: string } | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [amount, setAmount] = useState("");
  const [arrival, setArrival] = useState<Arrival>("dollars");
  const [bal, setBal] = useState<Balances | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ settled: Settled; link?: string } | null>(null);

  useEffect(() => {
    people(address).then(setList).catch(() => setList([]));
    balances(address).then(setBal).catch(() => {});
    loadRates().then(setRates);
  }, [address]);

  // a scanned code or an opened pay link arrives as route params
  const paramTo = route.params?.to;
  const paramName = route.params?.name;
  useEffect(() => {
    if (paramTo) setTo({ address: paramTo, name: paramName ?? shortAddress(paramTo) });
  }, [paramTo, paramName]);

  const usd = parseMoney(amount);
  const local = usd ? localEstimate(usd, profile?.country, rates) : null;
  const problem = !usd || usd === 0n ? "Type an amount." : bal && usd > bal.dollars ? `You have ${money(bal.dollars)} in dollars.` : null;
  const payee = parsePayee(pasted);

  async function go(byLink: boolean) {
    if (!usd || problem || (!byLink && !to)) return;
    const tappedAt = Date.now();
    setBusy(true);
    setError(null);
    try {
      const s = await confirm(); // FR-SES-01: a send always takes a fresh fingerprint
      if (byLink) {
        const { url, settled } = await createSendLink(s, usd, profile?.name ?? "A friend", tappedAt);
        setDone({ settled, link: url });
      } else if (to) {
        setDone({ settled: await sendMoney(s, to.address, usd, arrival, tappedAt) });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(e instanceof SendFailed ? e.message : `${explain(e, "passkey")} No money left your account.`);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const { settled, link } = done;
    return (
      <Screen footer={<Button label="Done" onPress={() => navigation.navigate("Home")} />}>
        <View style={styles.hero}>
          <Small>{link ? "Your link is ready" : `Sent to ${to?.name}`}</Small>
          <Amount>{money(usd ?? 0n)}</Amount>
          <Body>
            Settled in {(settled.ms / 1000).toFixed(1)} s, {(settled.afterSigning / 1000).toFixed(1)} s after your fingerprint.
          </Body>
          {!link && (
            <Small>{arrival === "cashOut" ? "It arrived ready to cash out, through Agora's Instant Settlement." : "It arrived as dollars."}</Small>
          )}
        </View>
        {link && (
          <>
            <Notice tone="info">
              Anyone with this link can collect the money, so send it only to the person it's for. Until they do, you can take it back
              from Receive.
            </Notice>
            <Button
              label="Share the link"
              onPress={() => Share.share({ message: `${profile?.name ?? "I"} sent you ${money(usd ?? 0n)} on Kitty: ${link}` }).catch(() => {})}
            />
          </>
        )}
        <Pressable onPress={() => Linking.openURL(explorerTx(settled.hash))} accessibilityRole="link" style={{ paddingVertical: space.sm }}>
          <Small style={{ textDecorationLine: "underline" }}>See it on the public record</Small>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen
      onBack={() => navigation.goBack()}
      footer={
        <>
          {to && problem && amount !== "" && <Small style={{ textAlign: "center" }}>{problem}</Small>}
          <Button
            label={to && usd && !problem ? `Send ${money(usd)} to ${to.name}` : "Send"}
            busy={busy}
            disabled={!to || !!problem || busy}
            onPress={() => go(false)}
          />
        </>
      }
    >
      <Title>Send money</Title>
      <Small>Your phone asks for your fingerprint or screen lock before anything leaves your account.</Small>

      <Section title="Who to?">
        {to ? (
          <List>
            <Row last>
              <Bead label={initials(to.name)} tone="mist" />
              <View style={{ flex: 1 }}>
                <Body>{to.name}</Body>
                <Small>{shortAddress(to.address)}</Small>
              </View>
              <Button label="Change" tone="quiet" style={{ minHeight: 44, paddingHorizontal: space.md }} onPress={() => setTo(null)} />
            </Row>
          </List>
        ) : (
          <>
            {list === null ? (
              <Small>Finding people from your circles…</Small>
            ) : list.length > 0 ? (
              <List>
                {list.map((p, i) => (
                  <Row key={p.address} last={i === list.length - 1} onPress={() => setTo(p)}>
                    <Bead label={initials(p.name)} tone="mist" />
                    <View style={{ flex: 1 }}>
                      <Body>{p.name}</Body>
                      {p.circle ? <Small>{p.circle}</Small> : null}
                    </View>
                    <Body>›</Body>
                  </Row>
                ))}
              </List>
            ) : (
              <Small>People from your circles show up here.</Small>
            )}
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Button label="Scan a Kitty code" tone="quiet" style={{ flex: 1 }} onPress={() => navigation.navigate("Scan")} />
              <Button label="Paste a link" tone="quiet" style={{ flex: 1 }} onPress={() => setPasting(true)} />
            </View>
            {pasting && (
              <>
                <Field
                  label="Pay link"
                  placeholder="https://kitty-circle.vercel.app/p/…"
                  value={pasted}
                  onChangeText={setPasted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Button label="Paste from clipboard" tone="quiet" onPress={async () => setPasted(await Clipboard.getStringAsync())} />
                {pasted !== "" && !payee && <Small style={{ color: color.clay }}>That isn't a Kitty pay link.</Small>}
                {payee && <Button label="Use this" onPress={() => setTo({ address: payee.address, name: payee.name ?? shortAddress(payee.address) })} />}
              </>
            )}
          </>
        )}
      </Section>

      <Section title="How much?">
        <Field label="Amount" prefix="$" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        <Small>
          {local ? `${local} (approximate). ` : ""}
          {bal ? `You have ${money(bal.dollars)} in dollars.` : ""}
        </Small>
      </Section>

      <Section title="How should it arrive?">
        <Choice options={ARRIVALS} value={arrival} onChange={setArrival} />
        <Small>
          {arrival === "dollars"
            ? "They get dollars they can save, send on, or pay into a circle."
            : "It goes through Agora's Instant Settlement and lands in the form a local cash-out partner takes, at a fixed 1:1 price, in the same transaction."}
        </Small>
      </Section>

      {error && <Notice tone="error">{error}</Notice>}

      <View style={styles.link}>
        <Heading>No Kitty code?</Heading>
        <Small>Send by link instead. Whoever opens it can collect the money, and you can take it back until they do.</Small>
        <Button
          label={usd && !problem ? `Make a ${money(usd)} link` : "Make a link"}
          tone="quiet"
          busy={busy}
          disabled={!!problem || busy}
          onPress={() => go(true)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: color.pinkSoft, borderRadius: radius.hero, padding: space.lg, gap: space.sm, marginTop: space.sm },
  link: { backgroundColor: color.cream, borderRadius: radius.card, padding: space.md, gap: space.sm },
});
