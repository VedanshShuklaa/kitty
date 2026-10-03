import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { shortAddress } from "../format";
import { parsePayee, parseSendLink } from "../money";
import type { ScreenProps } from "../nav";
import { color, radius, space } from "../theme";
import { Body, Button, Notice, Screen, Small, Title } from "../ui";

// FR-SND-01: a scanned Kitty code picks the person to send to. A scanned
// send-by-link code opens the claim screen instead.

export function ScanScreen({ navigation }: ScreenProps<"Scan">) {
  const [permission, ask] = useCameraPermissions();
  const [bad, setBad] = useState(false);
  const handled = useRef(false);

  function scanned(data: string) {
    if (handled.current) return;
    const payee = parsePayee(data);
    if (payee) {
      handled.current = true;
      navigation.navigate("Send", { to: payee.address, name: payee.name ?? shortAddress(payee.address) });
      return;
    }
    if (parseSendLink(data)) {
      handled.current = true;
      navigation.replace("Claim", { link: data });
      return;
    }
    setBad(true);
  }

  if (!permission?.granted) {
    return (
      <Screen onBack={() => navigation.goBack()}>
        <Title>Scan a Kitty code</Title>
        <Body>Kitty needs the camera to read someone's code. It's only used while this screen is open.</Body>
        {permission && !permission.canAskAgain ? (
          <Notice tone="info">Camera access is off for Kitty. Turn it on in your phone's settings, or paste their link instead.</Notice>
        ) : (
          <Button label="Use the camera" onPress={ask} />
        )}
      </Screen>
    );
  }

  return (
    <Screen onBack={() => navigation.goBack()}>
      <Title>Scan a Kitty code</Title>
      <Small>Point the camera at the code on their Receive screen.</Small>
      <View style={styles.frame}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => scanned(data)}
        />
      </View>
      {bad && <Notice tone="error">That code isn't a Kitty code. Ask them to open Receive in Kitty.</Notice>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: { aspectRatio: 1, borderRadius: radius.card, overflow: "hidden", backgroundColor: color.ink, marginTop: space.sm },
});
