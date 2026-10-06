import * as Notifications from "expo-notifications";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { Address } from "viem";

import { createAccount, signIn } from "./account/passkey";
import { explain } from "./errors";
import { getTestDollars, type Signer } from "./kitty";
import { ensureSwapper } from "./money";
import { expired } from "./policy";
import { restoreCircles, type Restored } from "./restore";
import { clearProfile, forgetCircles, getProfile, setProfile, type Profile } from "./store";
import { getProfileData, putProfile } from "./vault";

// One passkey ceremony starts a signing session; every key Kitty needs is
// derived from it in memory and never stored (FR-ACC-04, SRS 15.5).
//
// The session policy (SRS 15.4, src/policy.ts):
// - need(): actions that sign without a prompt use the live session. If it
//   has ended, one unlock prompt starts a new one and the action carries on.
// - confirm(): actions that commit new money or send it somewhere the member
//   chooses run a fresh ceremony, checked against the session's address.
// - The session ends after 5 minutes in the background, 30 minutes idle, or
//   on Lock. The screens stay up from cache under a "Locked" bar.

type Status = "loading" | "new" | "locked" | "ready" | "paused";

/** FR-SES-03: how long from the passkey prompt to the first confirmed transaction. */
export type Onboarding = { seconds: number } | { error: string };

type Session = {
  status: Status;
  profile: Profile | null;
  /** The live session's signer, or null while locked. Reads use `profile.address`. */
  signer: Signer | null;
  create: (name: string, country: string) => Promise<void>;
  unlock: (name?: string, country?: string) => Promise<void>;
  lock: () => void;
  forget: () => Promise<void>;
  need: () => Promise<Signer>;
  confirm: () => Promise<Signer>;
  touch: () => void;
  onboarding: Onboarding | null;
  restored: Restored | null;
  restore: () => Promise<void>;
  nameCat: (name: string) => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

type Acct = Awaited<ReturnType<typeof signIn>>;

const asSigner = (acct: Acct): Signer => ({ address: acct.address, account: acct.account, prf: acct.prfOutput });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [restored, setRestored] = useState<Restored | null>(null);
  const endRef = useRef<(() => void) | null>(null);
  const signerRef = useRef<Signer | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const lastTouch = useRef(Date.now());
  const backgroundSince = useRef<number | null>(null);

  useEffect(() => {
    getProfile().then((p) => {
      profileRef.current = p;
      setProfileState(p);
      setStatus(p ? "locked" : "new");
    });
  }, []);

  const adopt = useCallback(async (acct: Acct, p: Profile) => {
    await setProfile(p);
    endRef.current?.();
    endRef.current = acct.end;
    const s = asSigner(acct);
    signerRef.current = s;
    profileRef.current = p;
    lastTouch.current = Date.now();
    backgroundSince.current = null;
    setProfileState(p);
    setSigner(s);
    setStatus("ready");
    return s;
  }, []);

  const pause = useCallback(() => {
    endRef.current?.(); // Mera zeroes the session key
    endRef.current = null;
    signerRef.current = null;
    setSigner(null);
    setStatus((st) => (st === "ready" ? "paused" : st));
  }, []);

  const restore = useCallback(async () => {
    const s = signerRef.current;
    if (!s) return;
    setRestored(await restoreCircles(s).catch(() => null));
  }, []);

  /** Everything that follows a sign-in and needs no prompt. */
  const afterSignIn = useCallback(
    (s: Signer) => {
      void restore();
      // whitelisting also makes the account known to the indexer (SRS 15.6)
      ensureSwapper(s).catch(() => {});
    },
    [restore],
  );

  const create = useCallback(
    async (name: string, country: string) => {
      const acct = await createAccount(name);
      const prompted = Date.now();
      const s = await adopt(acct, { name, address: acct.address, country, credentialId: acct.credentialId });
      putProfile(s.prf, { name, country }).catch(() => {});
      // FR-SES-03: the first confirmed transaction is part of onboarding
      void (async () => {
        try {
          await getTestDollars(s);
          const seconds = (Date.now() - prompted) / 1000;
          console.log(`[kitty] first transaction confirmed ${seconds.toFixed(1)} s after the passkey prompt`);
          setOnboarding({ seconds });
        } catch (e) {
          setOnboarding({ error: explain(e, "faucet") });
        }
        afterSignIn(s);
      })();
    },
    [adopt, afterSignIn],
  );

  const unlock = useCallback(
    async (name?: string, country?: string) => {
      // "Welcome back" offers only the known account's passkey; a fresh sign-in offers them all
      const acct = await signIn(profileRef.current?.credentialId);
      // FR-RST-01: the profile comes back from the passkey, not from this phone
      // null: the storage answered "no profile yet". undefined: the read failed,
      // so we know nothing and must not write defaults over a profile that may exist.
      const stored = await getProfileData(acct.prfOutput).catch(() => undefined);
      const cached = profileRef.current?.address === acct.address ? profileRef.current : null;
      const p: Profile = {
        name: stored?.name ?? name ?? cached?.name ?? "Friend",
        country: stored?.country ?? country ?? cached?.country ?? "",
        address: acct.address,
        credentialId: acct.credentialId,
        catName: stored?.catName ?? cached?.catName,
      };
      const s = await adopt(acct, p);
      if (stored === null) putProfile(s.prf, { name: p.name, country: p.country, catName: p.catName }).catch(() => {});
      afterSignIn(s);
    },
    [adopt, afterSignIn],
  );

  /** A ceremony for an account already known here: it must be the same account. */
  const ceremony = useCallback(async () => {
    const p = profileRef.current;
    // only this account's passkey is offered, once the phone knows which one it is
    const acct = await signIn(p?.credentialId);
    if (p && acct.address !== p.address) {
      acct.end();
      throw new Error("That passkey belongs to a different Kitty account. Nothing was signed.");
    }
    return adopt(acct, p ? { ...p, credentialId: acct.credentialId } : { name: "Friend", country: "", address: acct.address, credentialId: acct.credentialId });
  }, [adopt]);

  const need = useCallback(async () => signerRef.current ?? ceremony(), [ceremony]);
  const confirm = useCallback(async () => ceremony(), [ceremony]);

  const forget = useCallback(async () => {
    const leaving = profileRef.current;
    endRef.current?.();
    endRef.current = null;
    signerRef.current = null;
    profileRef.current = null;
    await clearProfile();
    // the next person on this phone must not see this account's circles or get its reminders
    if (leaving) await forgetCircles(leaving.address).catch(() => {});
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    setSigner(null);
    setProfileState(null);
    setRestored(null);
    setOnboarding(null);
    setStatus("new");
  }, []);

  /** "Meet your cat": her name lives in the sealed profile, so it follows the passkey. */
  const nameCat = useCallback(async (catName: string) => {
    const p = profileRef.current;
    if (!p) return;
    const next = { ...p, catName: catName.trim() };
    await setProfile(next);
    profileRef.current = next;
    setProfileState(next);
    const s = signerRef.current;
    if (s) putProfile(s.prf, { name: next.name, country: next.country, catName: next.catName }).catch(() => {});
  }, []);

  const touch = useCallback(() => {
    lastTouch.current = Date.now();
  }, []);

  // FR-SES-02: end the session after time in the background or idle
  useEffect(() => {
    const check = () => {
      if (signerRef.current && expired(Date.now(), lastTouch.current, backgroundSince.current)) pause();
    };
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        check();
        backgroundSince.current = null;
        lastTouch.current = Date.now();
      } else if (backgroundSince.current === null) {
        backgroundSince.current = Date.now();
      }
    });
    const id = setInterval(check, 15_000);
    return () => {
      sub.remove();
      clearInterval(id);
    };
  }, [pause]);

  const value = useMemo(
    () => ({ status, profile, signer, create, unlock, lock: pause, forget, need, confirm, touch, onboarding, restored, restore, nameCat }),
    [status, profile, signer, create, unlock, pause, forget, need, confirm, touch, onboarding, restored, restore, nameCat],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}

/** For screens shown once signed in: the account's address, and how to get a signer for an action. */
export function useMe(): { address: Address; signer: Signer | null; need: () => Promise<Signer>; confirm: () => Promise<Signer> } {
  const { profile, signer, need, confirm } = useSession();
  if (!profile) throw new Error("not signed in");
  return { address: profile.address, signer, need, confirm };
}
