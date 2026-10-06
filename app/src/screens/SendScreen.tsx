import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, Share, StyleSheet, View } from "react-native";
import type { Address } from "viem";

import { explorerTx } from "../chain";
import { explain, passkeyStep } from "../errors";
import { groupedAddress, initials, money, parseMoney, shortAddress } from "../format";
import { loadRates, localEstimate, type Rates } from "../fx";
import { membersOf } from "../indexer";
import { loadSnapshot } from "../kitty";
import { balances, createSendLink, parsePayee, sendMoney, SendFailed, type Arrival, type Balances, type Settled } from "../money";
import type { ScreenProps } from "../nav";
import { nameAt } from "../phase";
import { useMe, useSession } from "../session";
import { listCircles } from "../store";
import { color, radius, space } from "../theme";
import { Amount, Bead, Body, Button, Choice, Field, Heading, LinkText, List, Notice, Row, Screen, Section, Small, Title } from "../ui";

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
  // `name` is only ever one the member already knows (picked from their circles);
  // a name carried by a link or code is never trusted, so it is not kept at all
  const [to, setTo] = useState<{ address: Address; name: string | null } | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [amount, setAmount] = useState("");
  const [arrival, setArrival] = useState<Arrival>("dollars");
  const [bal, setBal] = useState<Balances | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // the receipt is a snapshot of what was sent, not of the form (which stays editable)
  const [done, setDone] = useState<{ settled: Settled; link?: string; to: string | null; usd: bigint; arrival: Arrival } | null>(null);
  const sending = useRef(false);

  useEffect(() => {
    people(address).then(setList).catch(() => setList([]));
    balances(address).then(setBal).catch(() => {});
    loadRates().then(setRates);
  }, [address]);

  // a scanned code or an opened pay link arrives as route params
  const params = route.params;
  useEffect(() => {
    // never replaces a recipient the member already picked; the carried name is dropped
    if (params?.to) {
      const address = params.to;
      setTo((cur) => cur ?? { address, name: null });
    }
  }, [params]);

  // who the recipient is, by what the member already knows: their circles' people
  const person = to ? list?.find((p) => p.address.toLowerCase() === to.address.toLowerCase()) : undefined;
  const toName = person?.name ?? to?.name ?? null;

  const usd = parseMoney(amount);
  const local = usd ? localEstimate(usd, profile?.country, rates) : null;
  const problem = !usd || usd === 0n ? "Type an amount." : bal && usd > bal.dollars ? `You have ${money(bal.dollars)} in dollars.` : null;
  const payee = parsePayee(pasted);

  async function go(byLink: boolean) {
    if (!usd || problem || (!byLink && !to) || sending.current) return;
    sending.current = true;
    const tappedAt = Date.now();
    const sent = { usd, arrival, to: toName ?? (to ? shortAddress(to.address) : null) };
    setBusy(true);
    setError(null);
    try {
      // FR-SES-01: a send always takes a fresh fingerprint; only this step is a passkey step
      const s = await passkeyStep(confirm());
      if (byLink) {
        const { url, settled } = await createSendLink(s, usd, profile?.name ?? "A friend", tappedAt);
        setDone({ ...sent, settled, link: url });
      } else if (to) {
        setDone({ ...sent, settled: await sendMoney(s, to.address, usd, arrival, tappedAt) });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(e instanceof SendFailed ? e.message : `${explain(e)} No money left your account.`);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  if (done) {
    const { settled, link, usd: sentUsd, arrival: sentArrival, to: sentTo } = done;
    return (
      <Screen footer={<Button label="Done" onPress={() => navigation.popTo("Home")} />}>
        <View style={styles.hero}>
          <Small>{link ? "Your link is ready" : `Sent to ${sentTo ?? "them"}`}</Small>
          <Amount>{money(sentUsd)}</Amount>
          <Body>
            Settled in {(settled.ms / 1000).toFixed(1)} s, {(settled.afterSigning / 1000).toFixed(1)} s after your fingerprint.
          </Body>
          {!link && (
            <Small>{sentArrival === "cashOut" ? "It arrived ready to cash out, through Agora's Instant Settlement." : "It arrived as dollars."}</Small>
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
              onPress={() => Share.share({ message: `${profile?.name ?? "I"} sent you ${money(sentUsd)} on Kitty: ${link}` }).catch(() => {})}
            />
          </>
        )}
        <LinkText label="See it on the public record" onPress={() => Linking.openURL(explorerTx(settled.hash))} />
      </Screen>
    );
  }

  return (
    <Screen
      onBack={() => navigation.goBack()}
      footer={
        <>
          {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
          {to && problem && amount !== "" && <Small style={{ textAlign: "center" }}>{problem}</Small>}
          <Button
            label={to && usd && !problem ? `Send ${money(usd)} to ${toName ?? shortAddress(to.address)}` : "Send"}
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
              <Bead label={initials(toName ?? "?")} tone="mist" />
              <View style={{ flex: 1 }}>
                {toName ? (
                  <>
                    <Body>{toName}</Body>
                    <Small>{shortAddress(to.address)}</Small>
                  </>
                ) : (
                  <>
                    <Body selectable>{groupedAddress(to.address)}</Body>
                    <Small>Not one of your circle members. Check with them that this is their address before you send.</Small>
                  </>
                )}
              </View>
              <Button label="Change" tone="quiet" size="row" onPress={() => setTo(null)} />
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
                    <Body style={{ color: color.slate }}>›</Body>
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
                {payee && <Button label="Use this" onPress={() => setTo({ address: payee.address, name: null })} />}
              </>
            )}
          </>
        )}
      </Section>

      <Section title="How much?">
        <Field label="Amount" prefix="$" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} editable={!busy} />
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
            : "It goes through Agora's Instant Settlement and lands in the form a local cash-out partner takes, at a fixed 1:1 price, in one step."}
        </Small>
      </Section>

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
