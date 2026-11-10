import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { View } from "react-native";

import type { ScreenProps } from "../nav";
import { routeFor } from "../route";
import { color } from "../theme";
import { Body, Button, Field, List, Notice, Row, Screen, Small, Title } from "../ui";

const KINDS = [
  { icon: "people-outline", title: "An invite", detail: "Opens the circle's rules before you join" },
  { icon: "wallet-outline", title: "A pay link", detail: "Sends money to the person who shared it" },
  { icon: "gift-outline", title: "Money sent by link", detail: "Collects it into your account" },
] as const;

export function PasteScreen({ navigation }: ScreenProps<"Paste">) {
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  function go(value: string) {
    const to = routeFor(value);
    if (!to) {
      setError("That doesn't look like a Kitty link. Copy the whole link from the message, including everything after the #.");
      return;
    }
    navigation.replace(to.name, to.params as never);
  }

  return (
    <Screen
      onBack={() => navigation.goBack()}
      footer={
        <>
          <Button
            label="Paste from clipboard"
            onPress={async () => {
              const text = await Clipboard.getStringAsync();
              setLink(text);
              go(text);
            }}
          />
          <Button label="Continue" tone="quiet" disabled={!link.trim()} onPress={() => go(link)} />
        </>
      }
    >
      <Title>Open a Kitty link</Title>
      <Body>Tapping a Kitty link in WhatsApp opens Kitty by itself. If it didn't, copy the link and paste it here.</Body>
      <List>
        {KINDS.map((k, i) => (
          <Row key={k.title} last={i === KINDS.length - 1}>
            <Ionicons name={k.icon} size={24} color={color.pink} accessibilityElementsHidden importantForAccessibility="no" />
            <View style={{ flex: 1, gap: 2 }}>
              <Body>{k.title}</Body>
              <Small>{k.detail}</Small>
            </View>
          </Row>
        ))}
      </List>
      <Field
        label="Link"
        placeholder="https://kitty-circle.vercel.app/…"
        value={link}
        onChangeText={(v) => {
          setLink(v);
          setError(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
      />
      {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
    </Screen>
  );
}
