import * as Clipboard from "expo-clipboard";
import { useState } from "react";

import type { ScreenProps } from "../nav";
import { routeFor } from "../route";
import { Body, Button, Field, Notice, Screen, Title } from "../ui";

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
      <Body>An invite, a pay link or money sent by link. Tapping it in WhatsApp opens Kitty by itself. If it didn't, copy the link and paste it here.</Body>
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
      {error && <Notice tone="error">{error}</Notice>}
    </Screen>
  );
}
