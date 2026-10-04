import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { explain } from "../errors";
import { KittyLogo } from "../Brand";
import { useSession } from "../session";
import { color, font, radius, space } from "../theme";
import { Body, Button, Check, Choice, Display, Field, Label, Notice, Small, TestnetMarker, Title } from "../ui";

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
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={styles.frame} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.hero}>
          <TestnetMarker />
          <View style={styles.brand}>
            <KittyLogo size={112} />
            <Display style={styles.wordmark}>kitty</Display>
          </View>
          <Display style={styles.headline}>A little each round.
More, together.</Display>
          <Body style={styles.tagline}>Save with people you trust. Everyone contributes, and you take turns receiving the pot.</Body>
          <View style={styles.explainer} accessible accessibilityLabel="Start a circle, save together, take turns">
            <Small style={styles.step}>Start a circle</Small>
            <Small>→</Small>
            <Small style={styles.step}>Save together</Small>
            <Small>→</Small>
            <Small style={styles.step}>Take turns</Small>
          </View>
        </View>

        <View style={styles.body}>
          {returning ? (
            <>
              <Title>Welcome back, {profile.name}</Title>
              <Body style={{ color: color.slate }}>Unlock with your fingerprint or screen lock.</Body>
              {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
              <Button label="Unlock" busy={busy === "unlock"} onPress={() => run("unlock", () => unlock())} />
              <Button label="Use a different account" tone="quiet" disabled={!!busy} onPress={forget} />
            </>
          ) : (
            <>
              <Title>Let’s get you started</Title>
              <Small>Try Kitty with test dollars. No real money needed.</Small>
              <Field
                label="What should your circle call you?"
                placeholder="Your first name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoComplete="given-name"
                maxLength={24}
              />
              <View style={{ gap: space.xs }}>
                <Label>Where do you live?</Label>
                <Choice options={COUNTRIES} value={country} onChange={setCountry} />
              </View>
              <Check label="I'm 18 or older" value={adult} onChange={setAdult} />
              {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
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
              <Small>Your phone uses a passkey to sign you in with your fingerprint or screen lock. No password to remember.</Small>
            </>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper },
  frame: { flex: 1, width: "100%", maxWidth: 600, alignSelf: "center" },
  hero: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg, backgroundColor: color.surface, borderBottomLeftRadius: radius.hero, borderBottomRightRadius: radius.hero },
  brand: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.md, marginTop: space.lg, marginBottom: space.md },
  wordmark: { color: color.pink, fontSize: 52, lineHeight: 60 },
  headline: { fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  tagline: { color: color.slate, marginTop: space.sm },
  explainer: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.lg },
  step: { color: color.pink, fontFamily: font.bodyBold },
  body: { padding: space.lg, gap: space.md },
});
