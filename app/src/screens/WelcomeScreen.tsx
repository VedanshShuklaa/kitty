import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { explain } from "../errors";
import { KittyLogo } from "../Brand";
import { useSession } from "../session";
import { color, font, radius, space } from "../theme";
import { Body, Button, Check, Choice, Display, Field, Notice, Small, TestnetMarker, Title } from "../ui";

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
          <View style={styles.explainer}>
            <Small style={{ color: color.pink }}>Start a circle</Small>
            <Small>→</Small>
            <Small style={{ color: color.pink }}>Save together</Small>
            <Small>→</Small>
            <Small style={{ color: color.pink }}>Take turns</Small>
          </View>
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
  brand: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 16, marginTop: space.lg, marginBottom: space.md },
  wordmark: { color: color.pink, fontSize: 52, lineHeight: 60 },
  headline: { fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  tagline: { color: color.slate, marginTop: 12 },
  explainer: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 20 },
  body: { padding: space.lg, gap: space.md },
});
