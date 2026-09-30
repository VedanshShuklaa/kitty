import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { createAccount, signIn } from "./account/passkey";
import type { Signer } from "./kitty";
import { clearProfile, getProfile, setProfile, type Profile } from "./store";

// One passkey prompt per app session. The PRF output lives only in memory
// (FR-ACC-04); locking ends the signing session and drops it.

type Status = "loading" | "new" | "locked" | "ready";

type Session = {
  status: Status;
  profile: Profile | null;
  signer: Signer | null;
  create: (name: string, country: string) => Promise<void>;
  unlock: (name?: string, country?: string) => Promise<void>;
  lock: () => void;
  forget: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const endRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    getProfile().then((p) => {
      setProfileState(p);
      setStatus(p ? "locked" : "new");
    });
  }, []);

  const adopt = useCallback(async (acct: Awaited<ReturnType<typeof signIn>>, p: Profile) => {
    await setProfile(p);
    endRef.current?.();
    endRef.current = acct.end;
    setProfileState(p);
    setSigner({ address: acct.address, account: acct.account, prf: acct.prfOutput });
    setStatus("ready");
  }, []);

  const create = useCallback(
    async (name: string, country: string) => {
      const acct = await createAccount(name);
      await adopt(acct, { name, address: acct.address, country });
    },
    [adopt],
  );

  const unlock = useCallback(
    async (name?: string, country?: string) => {
      const acct = await signIn();
      await adopt(acct, {
        name: name ?? profile?.name ?? "Friend",
        country: country ?? profile?.country ?? "",
        address: acct.address,
      });
    },
    [adopt, profile],
  );

  const lock = useCallback(() => {
    endRef.current?.();
    endRef.current = null;
    setSigner(null);
    setStatus(profile ? "locked" : "new");
  }, [profile]);

  const forget = useCallback(async () => {
    endRef.current?.();
    endRef.current = null;
    await clearProfile();
    setSigner(null);
    setProfileState(null);
    setStatus("new");
  }, []);

  const value = useMemo(
    () => ({ status, profile, signer, create, unlock, lock, forget }),
    [status, profile, signer, create, unlock, lock, forget],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}

/** For screens that only render once unlocked. */
export function useSigner(): Signer {
  const { signer } = useSession();
  if (!signer) throw new Error("not unlocked");
  return signer;
}
