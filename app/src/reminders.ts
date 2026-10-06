import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { zeroHash } from "viem";

import { money } from "./format";
import { cadenceOf, type Snapshot } from "./kitty";
import { canOffer } from "./phase";

// FR-NOT-01: reminders are scheduled on the phone from each circle's rules.
// They need no server, no Firebase and no network, and are rescheduled from
// scratch every time the circle is refreshed.

export type Reminder = { id: string; at: number; title: string; body: string };

const MIN = 60;
const HOUR = 60 * MIN;

/** Seconds before each due time, per cadence (SRS 15.8). */
function payOffsets(s: Snapshot): number[] {
  const cad = cadenceOf(s.rules);
  if (cad === "practice1" || cad === "practice2") return [20];
  if (cad === "demo") return [2 * MIN];
  if (cad === "daily") return [2 * HOUR, 15 * MIN];
  return [24 * HOUR, 2 * HOUR];
}

function inWords(off: number): string {
  if (off >= HOUR) return `${off / HOUR} ${off === HOUR ? "hour" : "hours"}`;
  if (off >= MIN) return `${off / MIN} ${off === MIN ? "minute" : "minutes"}`;
  return `${off} seconds`; // practice rounds remind 20 s ahead
}

/**
 * Pure: the reminders this member should have for the current round. With
 * `cat` (her name, while "Show my cat" is on) the pay and pot reminders speak
 * in her voice; the amount and time never change, and offers stay out of her
 * world (FR-TRU-09).
 */
export function remindersFor(s: Snapshot, title: string, now: number, cat: string | null = null): Reminder[] {
  if (s.state !== "active" || !s.me) return [];
  const mine = s.members[s.me.seat];
  if (!mine || mine.standing === "defaulted") return [];
  const r = s.rules;
  const due = s.due;
  const key = `${s.address.toLowerCase()}:${s.round}`;
  const out: Reminder[] = [];

  if (!mine.paid) {
    for (const off of payOffsets(s)) {
      out.push(
        cat
          ? {
              id: `${key}:pay:${off}`,
              at: due - off,
              title: `${cat}'s bowl is empty soon`,
              body: `${title}: pay ${money(s.me.pay)} in the next ${inWords(off)}.`,
            }
          : {
              id: `${key}:pay:${off}`,
              at: due - off,
              title: `${title}: ${money(s.me.pay)} due soon`,
              body: `Round ${s.round} is due in ${inWords(off)}.`,
            },
      );
    }
  }
  const committed = s.me.commitment !== zeroHash;
  // members whose cat can't make an offer this round don't get the reminder
  if (r.maxBidBps > 0 && canOffer(mine, s.round, r.memberCount) && !committed) {
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
    title: cat ? `Pot day in ${title}` : `${title}: the pot is ready`,
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

/**
 * Reschedules one circle's reminders from a snapshot the screen already has,
 * converting chain times to phone times from the snapshot's own clock reading.
 * Home calls this for every circle it loads, so a member who never opens a
 * circle during a round still gets that round's reminders.
 */
export function syncFromSnapshot(s: Snapshot, title: string, cat: string | null = null): Promise<void> {
  const offset = s.chainNow - Date.now() / 1000;
  return syncReminders(s.address, remindersFor(s, title, s.chainNow, cat), offset);
}
