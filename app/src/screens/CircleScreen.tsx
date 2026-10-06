import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, Share, StyleSheet, View } from "react-native";
import type { Address, Hex } from "viem";

import { explorerAddress } from "../chain";
import { explain, revertName } from "../errors";
import { feedLine } from "../feed";
import { initials, money, shortAddress, when } from "../format";
import { House } from "../House";
import { houseWords, type Resident } from "../house";
import { earnRate, feedOf, housePiecesOf, type Activity } from "../indexer";
import {
  cancelCircle,
  closeRound,
  contribute,
  inviteKeyFor,
  loadSnapshot,
  payArrears,
  repay,
  potOf,
  revealBid,
  withdraw,
  type Member,
  type Snapshot,
} from "../kitty";
import { inviteLink } from "../links";
import type { ScreenProps } from "../nav";
import { nameAt, nextInLine, plan, rulesInWords, type Action } from "../phase";
import { remindersFor, syncReminders } from "../reminders";
import { rosterKeyHex, syncCircle } from "../restore";
import { useMe, useSession } from "../session";
import { payoutOrder, STAGE_NAME } from "../standing";
import { getCircle, getInviteKeys, getShowCat, markFed, type CircleRef } from "../store";
import { tidyCircle, tidyStep } from "../tidy";
import { color, font, radius, space } from "../theme";
import { Amount, Bead, Body, Button, Heading, LinkText, List, Notice, Progress, Row, Screen, Section, Small, Tag, Title } from "../ui";

export function CircleScreen({ route, navigation }: ScreenProps<"Circle">) {
  const { address } = route.params;
  const { address: me, signer, need } = useMe();
  const { profile } = useSession();
  const [pieces, setPieces] = useState<number | null>(null);
  const [showCat, setShowCat] = useState(true);
  const [ate, setAte] = useState(false); // her one hop after this member pays
  const [ref, setRef] = useState<CircleRef | undefined>();
  const [legacyKeys, setLegacyKeys] = useState<(Hex | null)[] | null>(null);
  const [feed, setFeed] = useState<Activity[] | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [offset, setOffset] = useState(0); // chain clock minus phone clock
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState<Action["kind"] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "good"; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getCircle(me, address).then(setRef);
    getInviteKeys(address).then(setLegacyKeys);
    getShowCat().then(setShowCat).catch(() => {});
    earnRate()
      .then((r) => setRate(r?.aprBps ?? null))
      .catch(() => {});
  }, [me, address]);

  // FR-KEY-03: the organizer's roster goes to Kitty's storage once, sealed
  // Only re-read the saved circle when something was actually saved: a roster with no
  // names saves nothing, and re-reading would hand back a fresh object and run this again.
  useEffect(() => {
    if (ref && signer && ref.organizer && !ref.synced && ref.names.length > 0) {
      syncCircle(signer, ref)
        .then((saved) => (saved ? getCircle(me, address).then(setRef) : undefined))
        .catch(() => {});
    }
  }, [ref, signer, me, address]);

  const titleRef = useRef("Savings circle");
  titleRef.current = ref?.title ?? "Savings circle";
  // reminders speak in her voice only while her drawing is on
  const voiceRef = useRef<string | null>(null);
  voiceRef.current = showCat ? (profile?.catName || "Your cat") : null;
  // What's happened and the house change only when something happens, so they are read
  // when the screen opens, on pull-to-refresh and after this member's own actions,
  // not on every 5 s poll.
  const loadExtras = useCallback(() => {
    feedOf(address).then(setFeed).catch(() => {});
    housePiecesOf(address).then(setPieces).catch(() => setPieces(null));
  }, [address]);

  const loadOnce = useCallback(async () => {
    try {
      const s = await loadSnapshot(address, me);
      const off = s.chainNow - Date.now() / 1000;
      setSnap(s);
      setOffset(off);
      setLoadError(null);
      syncReminders(address, remindersFor(s, titleRef.current, s.chainNow, voiceRef.current), off).catch(() => {});
    } catch (e) {
      setLoadError(explain(e));
    }
  }, [address, me]);

  // Reads never overlap. A call that lands mid-read (right after an action) asks for one more
  // read when this one ends and waits for it; the poll passes `again = false` so a slow network
  // can't turn it into back-to-back reads.
  const inflight = useRef<Promise<void> | null>(null);
  const rerun = useRef(false);
  const load = useCallback(
    (again = true): Promise<void> => {
      if (inflight.current) {
        if (again) rerun.current = true;
        return inflight.current;
      }
      const run = (async () => {
        try {
          do {
            rerun.current = false;
            await loadOnce();
          } while (rerun.current);
        } finally {
          inflight.current = null;
        }
      })();
      inflight.current = run;
      return run;
    },
    [loadOnce],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
      loadExtras();
      const poll = setInterval(() => void load(false), 5_000);
      const tick = setInterval(() => setTick((t) => t + 1), 1_000);
      return () => {
        clearInterval(poll);
        clearInterval(tick);
      };
    }, [load, loadExtras]),
  );

  async function refresh() {
    setRefreshing(true);
    loadExtras();
    await load();
    setRefreshing(false);
  }

  const now = Date.now() / 1000 + offset;
  const names = ref?.names ?? [];
  const title = ref?.title ?? "Savings circle";

  // the automatic close and reveal each run once per round (the buttons stay as the manual path)
  const autoClosed = useRef<number | null>(null);
  const autoRevealed = useRef<number | null>(null);
  const closeRetryAt = useRef(0);
  const revealRetryAt = useRef(0);

  async function act(a: Action, auto = false) {
    if (!snap) return;
    if (a.kind === "bid") {
      navigation.navigate("Bid", { address, round: snap.round });
      return;
    }
    // the auto-close never prompts: it only runs while the session is live
    if (auto && !signer) return;
    setBusy(a.kind);
    setNotice(null);
    try {
      // SRS 15.4: these sign without a prompt while the session is live, and
      // after one unlock prompt if it has ended
      const s = await need();
      let done = "";
      switch (a.kind) {
        case "pay": {
          const late = Date.now() / 1000 + offset > snap.due;
          await contribute(s, address, snap.round, a.amount ?? 0n);
          done = "Paid. Everyone in the circle can see it.";
          void markFed(late ? "late" : "onTime");
          setAte(true);
          setTimeout(() => setAte(false), 1_000);
          break;
        }
        case "reveal": {
          const bps = await revealBid(s, address, snap.round, snap.rules.maxBidBps);
          done = auto
            ? `Your phone opened your sealed offer: you'd give up ${bps / 100}%.`
            : `Your offer is open: you'd give up ${bps / 100}%.`;
          break;
        }
        case "close":
          await closeRound(s, address, snap.round);
          done = "The pot has been handed out.";
          break;
        case "withdraw":
          await withdraw(s, address);
          done = "Collected. It's in your test dollars now.";
          break;
        case "cancel":
          await cancelCircle(s, address);
          done = "The circle is called off. Everyone can collect their deposit.";
          break;
        case "arrears":
          await payArrears(s, address, a.amount ?? 0n);
          done = "You're caught up.";
          break;
        case "repay":
          await repay(s, address, a.amount ?? 0n);
          done = "Paid back. The members who lost out have it now.";
          break;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setNotice({ tone: "good", text: auto && a.kind === "close" ? "The round was due, so your phone handed out the pot." : done });
      await load();
      loadExtras();
    } catch (e) {
      if (auto && a.kind === "close") {
        // the chain clock can lag the phone's by a second or two: try again on the next read
        // and a dropped connection isn't a refusal: both try again shortly
        const why = revertName(e);
        if (why === "TooEarly" || !why) {
          autoClosed.current = null;
          closeRetryAt.current = Date.now() + (why ? 3_000 : 10_000);
        }
        // otherwise another member's phone likely got there first; just catch up
        await load();
        return;
      }
      if (auto && revertName(e) === "TooEarly") {
        autoRevealed.current = null;
        revealRetryAt.current = Date.now() + 3_000;
        await load();
        return;
      }
      // an automatic reveal that failed for a reason other than the contract's
      // gets another go while its window is open (the notice below still shows)
      if (auto && a.kind === "reveal" && !revertName(e)) {
        autoRevealed.current = null;
        revealRetryAt.current = Date.now() + 10_000;
      }
      if (auto && revertName(e) === "WrongRound") {
        await load();
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setNotice({ tone: "error", text: explain(e) });
    } finally {
      setBusy(null);
    }
  }

  const p = snap ? plan(snap, now) : null;

  // FR-KEEP-01: an open circle whose round is due gets closed by whichever
  // member's phone has it open, without a prompt. Once per round per visit;
  // the button stays as the manual path. The contract wants the grace period
  // to have fully passed and the chain clock can lag the phone's, so wait two
  // seconds more than the button does.
  const closable = !!snap && snap.state === "active" && now >= snap.due + snap.rules.grace + 2;
  useEffect(() => {
    if (!snap || !closable || busy || loadError || !signer || autoClosed.current === snap.round) return;
    if (Date.now() < closeRetryAt.current) return;
    autoClosed.current = snap.round;
    act({ kind: "close", label: "Hand out the pot" }, true);
    // act is recreated every render, so it stays out of the deps; the round
    // guard keeps this to one call
  }, [snap, closable, busy, loadError, signer]);

  // Reveal is in the no-prompt policy, and a sealed offer that isn't opened in
  // its window doesn't count, so an open circle reveals for its member
  // automatically, once per round, whenever the plan says it's time.
  const revealDue = !!snap && snap.state === "active" && !!p && p.actions.some((x) => x.kind === "reveal");
  useEffect(() => {
    if (!snap || !revealDue || busy || loadError || !signer || autoRevealed.current === snap.round) return;
    if (Date.now() < revealRetryAt.current) return;
    autoRevealed.current = snap.round;
    act({ kind: "reveal", label: "Open my sealed offer" }, true);
  }, [snap, revealDue, busy, loadError, signer]);

  // a circle that can't start any more is called off and the deposit collected, without a prompt
  const tidying = useRef(false);
  useEffect(() => {
    const step = snap ? tidyStep(snap) : null;
    if (!snap || !signer || busy || tidying.current || (step !== "cancel" && step !== "withdraw" && step !== "record")) return;
    tidying.current = true;
    // writing a finished circle into the record is bookkeeping: no busy button, no notice
    if (step !== "record") setBusy(step);
    tidyCircle(signer, snap)
      .then((done) => {
        if (done && step !== "record") {
          setNotice({
            tone: "good",
            text: `Not everyone joined in time, so the circle is called off.${done.returned > 0n ? ` Your ${money(done.returned)} deposit is back in your dollars.` : ""}`,
          });
        }
      })
      // another phone already called it off, collected or recorded it: nothing to tell this member
      .catch((e) => {
        const name = revertName(e);
        if (name !== "WrongState" && name !== "AlreadyPaid" && step !== "record") setNotice({ tone: "error", text: explain(e) });
      })
      .finally(() => {
        setBusy(null);
        void load();
        loadExtras();
      });
  }, [snap, signer, busy, load, loadExtras]);

  // everyone's cat in the circle's house, in the order they're paid; rebuilt only when
  // who is there, their stage or their name changes, so the per-second tick and the
  // 5 s reads don't redraw up to twelve SVG cats
  const residentsKey = snap
    ? [
        ...snap.members.filter((m) => m.address).map((m) => `${m.seat}:${m.address}:${m.stage ?? "Shy"}`),
        names.join("|"),
        snap.me?.seat ?? -1,
      ].join(",")
    : "";
  const residents = useMemo<Resident[]>(
    () =>
      snap
        ? payoutOrder(snap.members.filter((m) => m.address)).map((m) => ({
            owner: m.address!,
            stage: m.stage ?? "Shy",
            name: nameAt(names, m.seat),
            mine: m.seat === snap.me?.seat,
          }))
        : [],
    [residentsKey], // the key already covers everything the list is built from
  );

  if (!snap || !p) {
    return (
      <Screen onBack={() => navigation.goBack()}>
        <Title>{title}</Title>
        {loadError ? <><Notice tone="error">{loadError}</Notice><Button label="Try again" busy={refreshing} onPress={refresh} /></> : <Small>Loading the circle…</Small>}
      </Screen>
    );
  }

  const r = snap.rules;
  const n = r.memberCount;
  const [primary, ...secondary] = p.actions;
  const next = snap.state === "active" ? nextInLine(snap.members) : undefined;
  const mySeat = snap.me?.seat;
  const joined = snap.members.filter((m) => m.address).length;
  const paid = snap.members.filter((m) => m.paid).length;

  let heroLine = "";
  if (snap.state === "forming") heroLine = `First payment ${when(Number(r.firstDue))}`;
  else if (snap.state === "active" && next) {
    heroLine = next.seat === mySeat ? "You're next in line" : `${nameAt(names, next.seat)} is next in line`;
    heroLine += r.maxBidBps > 0 ? ", unless someone bids." : ".";
  } else if (snap.state === "completed") heroLine = `${n} rounds, ${n} pots. Done.`;
  else if (snap.state === "cancelled") heroLine = "Called off before it started.";

  return (
    <Screen
      onBack={() => navigation.goBack()}
      refreshing={refreshing}
      onRefresh={refresh}
      footer={
        primary || notice ? (
          <>
            {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
            {primary && (
              <Button label={primary.label} busy={busy === primary.kind} disabled={!!busy || !!loadError} onPress={() => act(primary)} />
            )}
          </>
        ) : undefined
      }
    >
      <Title>{title}</Title>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Body>{snap.state === "forming" ? "Getting your circle ready" : "This round’s pot"}</Body>
          {snap.state === "active" && <Tag label={`Round ${snap.round} of ${n}`} tone="marigold" />}
        </View>
        {snap.state === "forming" ? <>
          <Amount>{joined} of {n}</Amount>
          <Small>people have joined</Small>
        </> : snap.state === "active" ? <>
          <Amount selectable>{money(snap.pot)}</Amount>
          <Small>of {money(potOf(r))} expected · {paid} of {n} paid</Small>
        </> : <Heading>{snap.state === "completed" ? "Circle complete" : "Circle called off"}</Heading>}
        {(snap.state === "forming" || snap.state === "active") && (
          <Progress
            onSoft
            value={snap.state === "forming" ? joined : paid}
            total={n}
            label={snap.state === "forming" ? `${joined} of ${n} joined` : `${paid} of ${n} paid`}
          />
        )}
        <Body>{heroLine}</Body>
        {snap.yield && snap.yield.earned > 0n && (
          <Small>
            Deposits have earned {money(snap.yield.earned)} so far (simulated testnet yield, following earnAUSD on Monad mainnet
            {rate !== null && rate > 0 ? `, now ${(rate / 100).toFixed(1)}% a year` : ""}).
          </Small>
        )}
      </View>
      {loadError && <><Notice tone="error">Couldn't refresh. These are the last loaded amounts. Refresh before making a payment.</Notice><Button label="Try again" tone="quiet" busy={refreshing} onPress={refresh} /></>}

      <View style={{ gap: space.sm }}>
        {showCat && <House pieces={snap.state === "forming" ? 0 : (pieces ?? 0)} residents={residents} react={ate} />}
        <Small>{houseWords({ state: snap.state, pieces: snap.state === "forming" ? 0 : pieces, joined, memberCount: n, round: snap.round })}</Small>
      </View>

      <View style={{ gap: space.xs }}>
        <Heading>{p.headline}</Heading>
        <Body style={{ color: color.slate }}>{p.detail}</Body>
        {primary?.kind === "pay" && snap.me && (snap.me.creditUsed > 0n || snap.me.holdbackReleased > 0n) && (
          <Small>
            You pay {money(snap.me.pay)}: {money(r.contribution)}
            {snap.me.creditUsed > 0n ? `, less ${money(snap.me.creditUsed)} from others' offers` : ""}
            {snap.me.holdbackReleased > 0n ? `, less ${money(snap.me.holdbackReleased)} of your held-back pot` : ""}.
          </Small>
        )}
      </View>

      {secondary.map((a) => (
        <Button key={a.kind} label={a.label} tone="quiet" busy={busy === a.kind} disabled={!!busy || !!loadError} onPress={() => act(a)} />
      ))}

      <Section title="Members">
        <List>
          {snap.members.map((m, i) => (
            <MemberRow key={m.seat} m={m} snap={snap} name={nameAt(names, m.seat)} me={m.seat === mySeat} now={now} last={i === n - 1} />
          ))}
        </List>
      </Section>

      {snap.state === "forming" && ref?.organizer && (
        <Section title="Invite links">
          <Small>Each link works for one person only. Send it to them on WhatsApp.</Small>
          {!signer && !legacyKeys ? (
            <Button label="Unlock to show invite links" tone="quiet" onPress={() => need().catch(() => {})} />
          ) : (
            <List>
              {snap.members
                .filter((m) => !m.address && m.seat > 0)
                .map((m, i, open) => {
                  // FR-KEY-02: derived from the passkey, so any phone it signs in on can re-share them
                  const key = legacyKeys?.[m.seat] ?? (signer ? inviteKeyFor(signer, address, m.seat) : null);
                  if (!key) return null;
                  const roster = signer && !legacyKeys ? rosterKeyHex(signer, address) : null;
                  const link = inviteLink({ circle: address, seat: m.seat, key, title, names, roster });
                  const who = nameAt(names, m.seat);
                  return (
                    <Row key={m.seat} last={i === open.length - 1}>
                      <Bead label={initials(who)} tone="mist" />
                      <Body style={{ flex: 1 }}>{who}</Body>
                      <Button
                        label="Send"
                        a11yLabel={`Send invite to ${who}`}
                        tone="dark"
                        size="row"
                        onPress={() =>
                          Share.share({ message: `${who}, join "${title}", our savings circle on Kitty: ${link}` }).catch(() => {})
                        }
                      />
                    </Row>
                  );
                })}
            </List>
          )}
        </Section>
      )}

      {snap.state !== "forming" && (
        <Section title="Rounds">
          <List>
            {Array.from({ length: n }, (_, i) => {
              const round = i + 1;
              const due = Number(r.firstDue) + i * r.period;
              const got = snap.recipients[i];
              const seat = got ? snap.members.find((m) => m.address?.toLowerCase() === got.toLowerCase())?.seat : undefined;
              const current = snap.state === "active" && round === snap.round;
              return (
                <Row key={round} last={round === n}>
                  <Body style={{ minWidth: 76 }}>Round {round}</Body>
                  <Small style={{ flex: 1 }}>{when(due)}</Small>
                  {seat !== undefined ? (
                    <Tag label={seat === mySeat ? "You took it" : `${nameAt(names, seat)} took it`} tone="marigold" />
                  ) : current ? (
                    <Tag label="Now" tone="leaf" />
                  ) : null}
                </Row>
              );
            })}
          </List>
        </Section>
      )}

      {feed && feed.length > 0 && (
        <Section title="What's happened">
          <List>
            {feed
              .map((a) => ({ a, line: feedLine(a, (who: Address | null) => personName(who, snap, names, me)) }))
              .filter((x): x is { a: Activity; line: string } => !!x.line)
              .slice(0, 12)
              .map(({ a, line }, i, rows) => (
                <Row key={a.id} last={i === rows.length - 1}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Body>{line}</Body>
                    <Small>{when(a.at)}</Small>
                  </View>
                </Row>
              ))}
          </List>
        </Section>
      )}

      <Section title="How this circle works">
        <View style={{ gap: space.sm }}>
          {rulesInWords(r).map((l) => (
            <Body key={l.lead}>
              <Body style={{ fontFamily: font.bodyBold }}>{l.lead}</Body> {l.text}
            </Body>
          ))}
        </View>
      </Section>

      <LinkText label="See this circle's public record" onPress={() => Linking.openURL(explorerAddress(address))} />
    </Screen>
  );
}

/** "You", the member's name from the roster, or a short address for someone outside the circle. */
function personName(who: Address | null, snap: Snapshot, names: string[], me: Address): string {
  if (!who) return "Someone";
  if (who.toLowerCase() === me.toLowerCase()) return "You";
  const m = snap.members.find((x) => x.address?.toLowerCase() === who.toLowerCase());
  return m ? nameAt(names, m.seat) : shortAddress(who);
}

function MemberRow({ m, snap, name, me, now, last }: { m: Member; snap: Snapshot; name: string; me: boolean; now: number; last: boolean }) {
  let tag: { label: string; tone: "leaf" | "clay" | "slate" | "marigold" } | null = null;
  let bead: "indigo" | "leaf" | "clay" | "mist" = "mist";
  if (!m.address) tag = { label: "Not joined yet", tone: "slate" };
  else if (snap.state === "forming") {
    tag = { label: "Joined", tone: "leaf" };
    bead = "indigo";
  } else if (m.standing === "defaulted") {
    tag = { label: m.owed > 0n ? `Owes ${money(m.owed)}` : "Out", tone: "clay" };
    bead = "clay";
  } else if (snap.state === "active") {
    if (m.standing === "behind") tag = { label: `Behind ${money(m.arrears)}`, tone: "clay" };
    else if (m.paid) tag = { label: "Paid", tone: "leaf" };
    else if (now > snap.due) tag = { label: "Late", tone: "clay" };
    else tag = { label: "Not yet", tone: "slate" };
    bead = m.paid ? "leaf" : now > snap.due ? "clay" : "indigo";
  } else bead = "indigo";
  return (
    <Row last={last}>
      <Bead label={initials(name)} tone={bead} />
      <View style={{ flex: 1 }}>
        <Body>
          {name}
          {me ? " (you)" : ""}
        </Body>
        {m.stage && <Small>Cat: {STAGE_NAME[m.stage]}</Small>}
        {m.received && <Small>Has had the pot</Small>}
      </View>
      {tag && <Tag label={tag.label} tone={tag.tone} />}
    </Row>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: color.pinkSoft, borderRadius: radius.hero, padding: space.lg, gap: space.sm },
  heroTop: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: space.sm },
});
