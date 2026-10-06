import type { Address } from "viem";

import { cancelCircle, loadSnapshot, recordFinish, withdraw, type Signer, type Snapshot } from "./kitty";
import { getCircle, saveCircle } from "./store";

// A circle that can never start shouldn't wait for anyone to notice. Once
// joining has closed with seats still empty, the next member's phone to see it
// calls it off and collects their deposit, with no prompt (both are in the
// no-prompt list, SRS 15.4). Fully collected called-off circles leave Home.

export type TidyStep = "cancel" | "withdraw" | "record" | "archive" | null;

/** Pure: what this member's phone should do next for a circle. */
export function tidyStep(s: Snapshot): TidyStep {
  if (!s.me) return null;
  if (s.state === "forming") return s.chainNow >= Number(s.rules.joinDeadline) ? "cancel" : null;
  if (s.state === "cancelled") return s.me.withdrawable > 0n ? "withdraw" : "archive";
  // with nothing to collect there's no withdraw to write the finished circle
  // into the record, which would keep it counted as open (circles-at-once)
  if (s.state === "completed" && s.me.unrecorded) return "record";
  return null;
}

/** Runs the steps for one circle; returns what came back to this member, or null if nothing happened. */
export async function tidyCircle(s: Signer, snap: Snapshot): Promise<{ calledOff: boolean; returned: bigint } | null> {
  let step = tidyStep(snap);
  if (!step) return null;
  let calledOff = false;
  let returned = 0n;
  let current = snap;
  for (let i = 0; i < 3 && step; i++) {
    if (step === "cancel") {
      await cancelCircle(s, current.address);
      calledOff = true;
    } else if (step === "withdraw") {
      returned = current.me?.withdrawable ?? 0n;
      await withdraw(s, current.address);
    } else if (step === "record") {
      await recordFinish(s, current.address);
    } else {
      await archive(s.address, current.address);
      break;
    }
    current = await loadSnapshot(current.address, s.address);
    step = tidyStep(current);
  }
  return { calledOff, returned };
}

async function archive(me: Address, circle: Address): Promise<void> {
  const ref = await getCircle(me, circle);
  if (ref && !ref.archived) await saveCircle(me, { ...ref, archived: true });
}
