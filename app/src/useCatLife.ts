import { NavigationContext } from "@react-navigation/native";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState } from "react-native";

import { CatLife, type Pose, type Spot } from "./catLife";

const clock = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

/**
 * Runs one cat's life while she can be seen: the app is in front, her screen is focused and
 * Reduce Motion is off. Returns `pose: null` when she should hold still (Reduce Motion, or not
 * yet started); renderers then draw the resting artwork and their static reactions.
 *
 * Up to 60 fps; if frames keep arriving late it drops to 30 fps, then sheds follow-through,
 * tail sway, breathing and the look-around, like the website cat.
 */
export function useCatLife(spots: Spot[], enabled = true) {
  const life = useRef<CatLife | null>(null);
  if (!life.current) life.current = new CatLife(spots);
  const [pose, setPose] = useState<Pose | null>(null);
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [focused, setFocused] = useState(true);
  const [front, setFront] = useState(!AppState.currentState || AppState.currentState === "active");

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => { if (live) setReduced(r); }).catch(() => { if (live) setReduced(false); });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (r) => setReduced(r));
    const app = AppState.addEventListener("change", (s) => setFront(s === "active"));
    return () => { live = false; sub.remove(); app.remove(); };
  }, []);
  // Pause when her screen is covered. Welcome renders outside the navigator (App.tsx), where
  // there is no navigation object and useFocusEffect would throw; there she is always in view.
  const navigation = useContext(NavigationContext);
  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const focus = navigation.addListener("focus", () => setFocused(true));
    const blur = navigation.addListener("blur", () => setFocused(false));
    return () => { focus(); blur(); };
  }, [navigation]);

  const run = enabled && reduced === false && focused && front;
  useEffect(() => {
    if (!run) return;
    const cat = life.current!;
    let raf = 0, last = 0, ema = 1000 / 60, slow = 0, interval = 1000 / 60;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = clock();
      const p = cat.step(now);
      if (last && now - last < interval - 4) return;
      const dt = last ? now - last : interval;
      last = now;
      ema += (dt - ema) * 0.05;
      if (ema > interval * 1.4) {
        if (++slow > 90) {
          if (interval < 30) interval = 1000 / 30;
          else cat.shed = Math.min(4, cat.shed + 1);
          slow = 0;
          ema = interval;
        }
      } else slow = 0;
      setPose(p);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [run]);

  /** Reactions take effect on the next frame; with Reduce Motion they change nothing visible. */
  const act = useCallback((fn: (cat: CatLife, now: number) => void) => {
    if (life.current) fn(life.current, clock());
  }, []);
  return { pose: reduced ? null : pose, act };
}
