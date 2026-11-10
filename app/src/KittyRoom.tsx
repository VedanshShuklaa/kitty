import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";

import { WebsiteCat } from "./WebsiteCat";
import { tapPoint } from "./Cat";
import { VIEWER, type Spot } from "./catLife";
import { color, font, radius } from "./theme";
import { useCatLife } from "./useCatLife";

// The things in the website room she glances at: window, picture, yarn, bowl, and you.
const SPOTS: Spot[] = [{ ...VIEWER, weight: 3 }, { yaw: -24, pitch: 7 }, { yaw: 24, pitch: 12 }, { yaw: -18, pitch: -15 }, { yaw: 20, pitch: -14 }];
const FACE = { x: 800, y: 526 };
// The scene box sits 135% wide, 17.5% left and 30% below the room (see s.scene).
const SCENE = { w: 1.35, left: -0.175, below: 0.3, aspect: 1.65 };

/** The website's brand scene. Its hello is local and never changes standing. */
export function KittyRoom() {
  const [hellos, setHellos] = useState(0);
  const [helloVisible, setHelloVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const { pose, act } = useCatLife(SPOTS);
  useEffect(() => { act((cat, now) => cat.arrive(now)); }, [act]);
  useEffect(() => {
    if (!hellos) return;
    act((cat, now) => cat.hello(now));
    const timer = setTimeout(() => setHelloVisible(false), 1800);
    return () => clearTimeout(timer);
  }, [hellos, act]);

  // A tap on her is a pet; a tap anywhere else in the room and she looks there.
  const tap = (lx: number, ly: number) => {
    if (!width) return;
    const sceneW = width * SCENE.w, sceneH = sceneW * 0.75;
    const top = (width / SCENE.aspect) * (1 + SCENE.below) - sceneH;
    const x = ((lx - width * SCENE.left) / sceneW) * 1600, y = ((ly - top) / sceneH) * 1200;
    if (Math.abs(x - FACE.x) < 210 && y > 300 && y < 860) act((cat, now) => cat.pet(now, x >= FACE.x ? 1 : -1));
    else act((cat, now) => cat.lookAt(now, { yaw: (Math.atan2(x - FACE.x, 960) * 180) / Math.PI, pitch: (Math.atan2(FACE.y - y, 960) * 180) / Math.PI }));
  };

  return (
    <View style={s.room} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View style={s.scene} accessible accessibilityRole="image" accessibilityLabel="Kitty, a pink cat, sitting on a cushion in a sunny room" pointerEvents="none">
        <Image source={require("../assets/kitty-room.webp")} style={StyleSheet.absoluteFill} resizeMode="stretch" />
        <Svg width="100%" height="100%" viewBox="0 0 1600 1200" style={StyleSheet.absoluteFill}>
          <WebsiteCat p={pose ?? undefined} />
          {helloVisible && !pose && <Path id="brand-hello-heart" d="M0,18 C-48,-13 -24,-48 0,-25 C24,-48 48,-13 0,18Z" transform="translate(1050 380)" fill={color.pink} />}
        </Svg>
      </View>
      <Pressable accessible={false} importantForAccessibility="no" focusable={false} style={StyleSheet.absoluteFill} onPress={(e) => tap(...tapPoint(e.nativeEvent))} />
      <Pressable accessibilityRole="button" accessibilityLabel="Say hello to Kitty" accessibilityHint="A little hello, just for fun." onPress={() => { setHelloVisible(true); setHellos(n => n + 1); }} style={({ pressed }) => [s.hello, pressed && { opacity: 0.7 }]}>
        <Text accessibilityLiveRegion="polite" style={s.helloText}>{helloVisible ? "Kitty says hi ♡" : "Say hello"}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  room: { width: "100%", aspectRatio: SCENE.aspect, borderRadius: radius.hero, overflow: "hidden", backgroundColor: color.room },
  scene: { position: "absolute", width: "135%", aspectRatio: 4 / 3, left: "-17.5%", bottom: "-30%" },
  hello: { position: "absolute", right: 8, bottom: 8, minHeight: 48, justifyContent: "center", paddingHorizontal: 16, borderRadius: radius.control, backgroundColor: color.surface },
  helloText: { fontFamily: font.bodyBold, fontSize: 14, color: color.pink },
});
