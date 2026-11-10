import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { explain } from "../errors";
import { KittyWordmark } from "../Brand";
import { KittyRoom } from "../KittyRoom";
import { useSession } from "../session";
import { color, space } from "../theme";
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
          <View style={styles.brand}>
            <KittyWordmark />
            <TestnetMarker />
          </View>
          {!returning && <KittyRoom />}
          <Display style={styles.headline}>{returning ? "Your circle.\nYour people." : "Save with people\nyou trust."}</Display>
          <Body style={styles.tagline}>Everyone contributes. Each round, someone takes the pot. Your turn comes around, too.</Body>
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
  hero: { paddingHorizontal: space.md, paddingTop: space.sm, backgroundColor: color.surface, gap: space.md },
  brand: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: space.sm, marginBottom: space.xs },
  headline: { fontSize: 34, lineHeight: 38, letterSpacing: -0.8 },
  tagline: { color: color.slate, marginTop: space.sm },
  body: { padding: space.md, marginTop: space.md, gap: space.md },
});
