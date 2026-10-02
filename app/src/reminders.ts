import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { zeroHash } from "viem";

import { money } from "./format";
import { cadenceOf, type Snapshot } from "./kitty";

// FR-NOT-01: reminders are scheduled on the phone from each circle's rules.
// They need no server, no Firebase and no network, and are rescheduled from
// scratch every time the circle is refreshed.

export type Reminder = { id: string; at: number; title: string; body: string };

const MIN = 60;
const HOUR = 60 * MIN;

/** Seconds before each due time, per cadence (SRS 15.8). */
function payOffsets(s: Snapshot): number[] {
  const cad = cadenceOf(s.rules);
  if (cad === "demo") return [2 * MIN];
  if (cad === "daily") return [2 * HOUR, 15 * MIN];
  return [24 * HOUR, 2 * HOUR];
}

/** Pure: the reminders this member should have for the current round. */
export function remindersFor(s: Snapshot, title: string, now: number): Reminder[] {
  if (s.state !== "active" || !s.me) return [];
  const mine = s.members[s.me.seat];
  if (!mine || mine.standing === "defaulted") return [];
  const r = s.rules;
  const due = s.due;
  const key = `${s.address.toLowerCase()}:${s.round}`;
  const out: Reminder[] = [];

  if (!mine.paid) {
    for (const off of payOffsets(s)) {
      out.push({
        id: `${key}:pay:${off}`,
        at: due - off,
        title: `${title}: ${money(s.me.pay)} due soon`,
        body: `Round ${s.round} is due in ${off >= HOUR ? `${off / HOUR} hours` : `${off / MIN} minutes`}.`,
      });
    }
  }
  const committed = s.me.commitment !== zeroHash;
  if (r.maxBidBps > 0 && mine.standing === "good" && !mine.received && !committed) {
    out.push({
      id: `${key}:bid`,
      at: due - r.commitWindow,
      title: `${title}: bidding is open`,
      body: "Need the pot this round? You can make a sealed offer until the due time.",
    });
  }
  if (committed && !mine.revealed) {
    out.push({
      id: `${key}:reveal`,
      at: due,
      title: `${title}: open your offer`,
      body: "Your sealed offer only counts once you open it.",
    });
  }
  out.push({
    id: `${key}:close`,
    at: due + r.grace,
    title: `${title}: the pot is ready`,
    body: `Round ${s.round} can be handed out now. Open the circle to do it.`,
  });
  return out.filter((x) => x.at > now);
}

const CHANNEL = "reminders";
let ready: Promise<boolean> | null = null;

/** Asks once per app run; reminders are skipped if the member says no. */
function permission(): Promise<boolean> {
  ready ??= (async () => {
    // show a reminder even while Kitty is open
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: "Circle reminders",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  })().catch(() => false);
  return ready;
}

/**
 * Replaces this circle's scheduled reminders with `wanted`. The phone's clock
 * may differ from the chain's, so `offset` (chain minus phone, in seconds)
 * converts each chain time to a phone time.
 */
export async function syncReminders(circle: string, wanted: Reminder[], offset: number): Promise<void> {
  if (!(await permission())) return;
  const prefix = `${circle.toLowerCase()}:`;
  const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) => n.identifier.startsWith(prefix));
  const want = new Set(wanted.map((w) => w.id));
  await Promise.all(
    scheduled.filter((n) => !want.has(n.identifier)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  const have = new Set(scheduled.map((n) => n.identifier));
  for (const w of wanted) {
    if (have.has(w.id)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: w.id,
      content: { title: w.title, body: w.body, data: { circle } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: (w.at - offset) * 1000, channelId: CHANNEL },
    });
  }
}
