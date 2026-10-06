import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import { Share, StyleSheet, View } from "react-native";
import type { Hex } from "viem";

import { explain, passkeyStep } from "../errors";
import { money, parseMoney } from "../format";
import { balances, claimLink, convert, payLink, sendLinks, SendFailed, type Arrival, type Balances } from "../money";
import type { ScreenProps } from "../nav";
import { QrCode } from "../Qr";
import { useMe, useSession } from "../session";
import { color, radius, space } from "../theme";
import { Amount, Body, Button, Choice, Field, List, Notice, Row, Screen, Section, Small, Title } from "../ui";

// Receive: the Kitty code (a QR of this account's pay link), both balances,
// a one-tap conversion between them (FR-SND-05), and money sent by link that
// nobody has collected yet (FR-SND-08).

const DIRECTIONS: { label: string; value: Arrival }[] = [
  { label: "To cash-out", value: "cashOut" },
  { label: "To dollars", value: "dollars" },
];

export function ReceiveScreen({ navigation }: ScreenProps<"Receive">) {
  const { address, signer, confirm } = useMe();
  const { profile } = useSession();
  const link = payLink(address, profile?.name ?? "");
  const [bal, setBal] = useState<Balances | null>(null);
  const [copied, setCopied] = useState(false);
  const [into, setInto] = useState<Arrival>("cashOut");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<{ n: number; key: Hex; balance: bigint }[] | null>(null);

  const load = useCallback(async () => {
    balances(address).then(setBal).catch(() => {});
    // the links' keys are re-derived from the passkey, so this needs the live session
    if (signer) sendLinks(signer.prf).then((all) => setPending(all.filter((l) => l.balance > 0n))).catch(() => {});
  }, [address, signer]);

  useEffect(() => {
    void load();
  }, [load]);

  const usd = parseMoney(amount);
  const available = bal ? (into === "cashOut" ? bal.dollars : bal.cashOut) : null;
  const problem = !usd || usd === 0n ? "Type an amount." : available !== null && usd > available ? `You have ${money(available)} to move.` : null;

  async function move() {
    if (!usd || problem) return;
    const tappedAt = Date.now();
    setBusy("convert");
    setNotice(null);
    try {
      const s = await passkeyStep(confirm());
      const done = await convert(s, into, usd, tappedAt);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setNotice({
        tone: "good",
        text: `Moved ${money(usd)} ${into === "cashOut" ? "to ready to cash out" : "back to dollars"} in ${(done.ms / 1000).toFixed(1)} s.`,
      });
      setAmount("");
      await load();
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof SendFailed ? e.message : `${explain(e)} No money moved.` });
    } finally {
      setBusy(null);
    }
  }

  async function takeBack(key: Hex, n: number) {
    setBusy(`link-${n}`);
    setNotice(null);
    try {
      const s = await passkeyStep(confirm());
      const { amount: back } = await claimLink(s, key, Date.now());
      setNotice({ tone: "good", text: `${money(back)} is back in your dollars.` });
      await load();
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof SendFailed ? e.message : explain(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen onBack={() => navigation.goBack()}>
      <Title>Receive money</Title>
      <View style={styles.code}>
        <QrCode value={link} size={220} label="Your Kitty code. Someone can scan it to send you money." />
        <Small style={{ textAlign: "center" }}>Show this Kitty code to someone with Kitty, or send them your link.</Small>
        <View style={{ flexDirection: "row", gap: space.sm, alignSelf: "stretch" }}>
          <Button label="Share my link" style={{ flex: 1 }} onPress={() => Share.share({ message: `Send me money on Kitty: ${link}` }).catch(() => {})} />
          <Button
            label={copied ? "Copied" : "Copy"}
            tone="quiet"
            style={{ flex: 1 }}
            onPress={async () => {
              await Clipboard.setStringAsync(link);
              setCopied(true);
            }}
          />
        </View>
      </View>

      <Section title="Your money">
        <List>
          <Row>
            <Body style={{ flex: 1 }}>Dollars</Body>
            <Amount style={{ fontSize: 22 }}>{bal ? money(bal.dollars) : "—"}</Amount>
          </Row>
          <Row last>
            <View style={{ flex: 1 }}>
              <Body>Ready to cash out</Body>
              <Small>The form a local cash-out partner takes</Small>
            </View>
            <Amount style={{ fontSize: 22 }}>{bal ? money(bal.cashOut) : "—"}</Amount>
          </Row>
        </List>
      </Section>

      <Section title="Move between them">
        <Small>Instant, at Agora's fixed 1:1 price. Your phone asks for your fingerprint first.</Small>
        <Choice options={DIRECTIONS} value={into} onChange={setInto} />
        <Field label="Amount" prefix="$" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        {amount !== "" && problem && <Small style={{ color: color.clay }}>{problem}</Small>}
        <Button label={usd && !problem ? `Move ${money(usd)}` : "Move"} busy={busy === "convert"} disabled={!!problem || !!busy} onPress={move} />
      </Section>

      {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      {pending && pending.length > 0 && (
        <Section title="Links nobody has collected">
          <List>
            {pending.map((l, i) => (
              <Row key={l.n} last={i === pending.length - 1}>
                <Body style={{ flex: 1 }}>{money(l.balance)}</Body>
                <Button
                  label="Take it back"
                  tone="quiet"
                  busy={busy === `link-${l.n}`}
                  disabled={!!busy}
                  size="row"
                  onPress={() => takeBack(l.key, l.n)}
                />
              </Row>
            ))}
          </List>
          <Small>Each link's key comes back from your passkey, so you can take an unclaimed send back from any phone.</Small>
        </Section>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  code: {
    backgroundColor: color.surface,
    borderRadius: radius.hero,
    padding: space.lg,
    gap: space.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: color.line,
  },
});
