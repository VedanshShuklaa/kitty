import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { explain } from "../errors";
import { Ring, type RingBead } from "../Ring";
import { useSession } from "../session";
import { color, font, radius, space } from "../theme";
import { Body, Button, Check, Choice, Display, Field, Notice, Small, TestnetMarker, Title } from "../ui";

// A still life of a circle mid-round: some have paid, one is up next.
const HERO: RingBead[] = [
  { label: "", tone: "paid", received: true },
  { label: "", tone: "paid" },
  { label: "", tone: "waiting", turn: true },
  { label: "", tone: "paid" },
  { label: "", tone: "waiting" },
  { label: "", tone: "paid" },
  { label: "", tone: "waiting" },
];

const COUNTRIES = [
  { label: "Ghana", value: "GH" },
  { label: "Nigeria", value: "NG" },
  { label: "Kenya", value: "KE" },
  { label: "Somewhere else", value: "other" },
];

export function WelcomeScreen() {
  const { status, profile, create, unlock, forget } = useSession();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("GH");
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState<"create" | "unlock" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "create" | "unlock", fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(explain(e, "passkey"));
    } finally {
      setBusy(null);
    }
  }

  const returning = status === "locked" && profile;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <SafeAreaView edges={["top"]}>
            <TestnetMarker onIndigo />
          </SafeAreaView>
          <View style={styles.ringWrap}>
            <Ring beads={HERO} size={230} />
          </View>
          <Display style={styles.wordmark}>kitty</Display>
          <Body style={styles.tagline}>Save with people you trust. Take turns with the pot. Nobody holds the money.</Body>
        </View>

        <View style={styles.body}>
          {returning ? (
            <>
              <Title>Welcome back, {profile.name}</Title>
              <Body style={{ color: color.slate }}>Unlock with your fingerprint or screen lock.</Body>
              {error && <Notice tone="error">{error}</Notice>}
              <Button label="Unlock" busy={busy === "unlock"} onPress={() => run("unlock", () => unlock())} />
              <Button label="Use a different account" tone="quiet" disabled={!!busy} onPress={forget} />
            </>
          ) : (
            <>
              <Field
                label="What should your circle call you?"
                placeholder="Your first name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoComplete="given-name"
                maxLength={24}
              />
              <View style={{ gap: 6 }}>
                <Small style={{ color: color.indigo, fontFamily: font.bodyMedium, fontSize: 15 }}>Where do you live?</Small>
                <Choice options={COUNTRIES} value={country} onChange={setCountry} />
              </View>
              <Check label="I'm 18 or older" value={adult} onChange={setAdult} />
              {error && <Notice tone="error">{error}</Notice>}
              <Button
                label="Create my account"
                busy={busy === "create"}
                disabled={!name.trim() || !adult || !!busy}
                onPress={() => run("create", () => create(name.trim(), country))}
              />
              <Button
                label="I already have an account"
                tone="quiet"
                busy={busy === "unlock"}
                disabled={!!busy}
                onPress={() => run("unlock", () => unlock(name.trim() || undefined, country))}
              />
              <Small>Your account is a passkey on this phone. No password, nothing to write down.</Small>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper },
  hero: {
    backgroundColor: color.indigo,
    borderBottomLeftRadius: radius.hero,
    borderBottomRightRadius: radius.hero,
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    paddingTop: space.sm,
    overflow: "hidden",
  },
  ringWrap: { alignItems: "flex-end", marginTop: space.md, marginRight: -space.xl },
  wordmark: { color: color.onIndigo, fontSize: 64, lineHeight: 66, marginTop: -space.xl },
  tagline: { color: color.onIndigoMuted, fontSize: 18, lineHeight: 26, marginTop: space.sm, maxWidth: 320 },
  body: { padding: space.lg, gap: space.md },
});
