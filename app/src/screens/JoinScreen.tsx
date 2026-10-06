import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { explain, passkeyStep } from "../errors";
import { money, shortAddress } from "../format";
import { depositOf, isKittyCircle, JOIN_STEPS, joinCircle, joinTerms, loadSnapshot, NOT_A_CIRCLE, type Snapshot, type Terms } from "../kitty";
import { parseInvite } from "../links";
import type { ScreenProps } from "../nav";
import { nameAt, rulesInWords } from "../phase";
import { KittyLogo } from "../Brand";
import { CatFace } from "../Cat";
import { syncCircle } from "../restore";
import { useMe } from "../session";
import { firstOfferRound, payoutOrder, STAGE_NAME, termsInWords } from "../standing";
import { getCircle, getShowCat, saveCircle } from "../store";
import { color, font, radius, space } from "../theme";
import { Body, Button, Heading, List, Notice, Row, Screen, Section, Small, Steps, Tag, Title, type StepState } from "../ui";

export function JoinScreen({ route, navigation }: ScreenProps<"Join">) {
  const { address: me, signer, confirm } = useMe();
  const invite = useMemo(() => parseInvite(route.params.link), [route.params.link]);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [run, setRun] = useState<{ active: string; failed: boolean; error?: string } | null>(null);
  const [showCat, setShowCat] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  // null until the factory has been asked; an invite names any address it likes
  const [isCircle, setIsCircle] = useState<boolean | null>(null);
  const [offset, setOffset] = useState(0); // chain clock minus phone clock, in seconds
  useEffect(() => { getShowCat().then(setShowCat).catch(() => {}); }, []);

  const load = useCallback(async () => {
    if (!invite) return;
    setLoadError(null);
    try {
      // nothing from the address is read, shown or saved until Kitty's factory vouches for it
      const ok = await isKittyCircle(invite.circle);
      setIsCircle(ok);
      if (!ok) return;
      const s = await loadSnapshot(invite.circle, me);
      setOffset(s.chainNow - Date.now() / 1000);
      setSnap(s);
    } catch (e) { setLoadError(explain(e)); }
  }, [invite, me]);

  useEffect(() => { void load(); }, [load]);

  // FR-TRU-13/14: terms before money. The record decides this member's
  // deposit, place in the order and offer window; show all of it first.
  const [terms, setTerms] = useState<Terms | null>(null);
  const [termsError, setTermsError] = useState(false);
  const [termsTry, setTermsTry] = useState(0); // bumped by "Try again": the contribution alone never changes
  const contribution = snap?.rules.contribution;
  useEffect(() => {
    if (contribution === undefined) return;
    setTermsError(false);
    joinTerms(me, contribution).then(setTerms).catch(() => setTermsError(true));
  }, [me, contribution, termsTry]);
  const deposit = snap && terms ? depositOf(snap.rules, terms.depositX100) : 0n;

  // A member who reinstalled can come back through their invite link: the
  // chain says they're in, but this phone has forgotten the circle. Put it
  // back on Home with the names from the link, and keep the roster key in
  // Kitty's storage if it isn't there yet. Restore after sign-in does the
  // same from the passkey alone (FR-RST-01).
  useEffect(() => {
    if (!invite || !snap?.me || isCircle !== true) return;
    const mine = snap.me;
    getCircle(me, invite.circle).then(async (known) => {
      const ref = known ?? {
        address: invite.circle,
        title: invite.title,
        names: invite.names,
        seat: mine.seat,
        organizer: snap.organizer.toLowerCase() === me.toLowerCase(),
        addedAt: Date.now(),
      };
      if (!known) await saveCircle(me, ref);
      if (signer && invite.roster) await syncCircle(signer, ref, invite.roster).catch(() => {});
    });
  }, [invite, snap, me, signer, isCircle]);

  if (!invite) {
    return (
      <Screen onBack={() => navigation.goBack()}>
        <Title>This isn't a Kitty invite</Title>
        <Body>Ask the organizer to send the link again, and open it straight from WhatsApp.</Body>
      </Screen>
    );
  }

  if (isCircle === false) {
    return (
      <Screen onBack={() => navigation.goBack()}>
        <Title>This isn't a Kitty circle</Title>
        <Notice tone="error">{NOT_A_CIRCLE}</Notice>
        <Body>Don't join from this link. Ask the organizer to send the invite again, and open it straight from WhatsApp.</Body>
      </Screen>
    );
  }

  const names = invite.names;
  const who = nameAt(names, invite.seat);
  const organizer = nameAt(names, 0);

  async function join() {
    if (!invite || startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setFormError(null);
    let current = JOIN_STEPS[0].id;
    try {
      // joining commits a deposit and every round's payment: a fresh fingerprint (SRS 15.4).
      // A cancelled or failed prompt is a note on the form, not a failed run.
      let s;
      try {
        s = await passkeyStep(confirm());
      } catch (e) {
        setRun(null);
        setFormError(explain(e));
        return;
      }
      await joinCircle(s, invite, (id) => {
        current = id;
        setRun({ active: id, failed: false });
      });
      const ref = { address: invite.circle, title: invite.title, names, seat: invite.seat, organizer: false, addedAt: Date.now() };
      await saveCircle(s.address, ref);
      // FR-KEY-03: keep a copy of the roster key, wrapped under this member's passkey
      await syncCircle(s, ref, invite.roster).catch(() => {});
      navigation.replace("Circle", { address: invite.circle });
    } catch (e) {
      setRun({ active: current, failed: true, error: explain(e) });
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  if (run) {
    const at = JOIN_STEPS.findIndex((s) => s.id === run.active);
    const steps = JOIN_STEPS.map((s, i) => ({
      label: s.label,
      state: (i < at ? "done" : i === at ? (run.failed ? "failed" : "active") : "todo") as StepState,
    }));
    return (
      <Screen
        footer={
          run.failed ? (
            <>
              <Button label="Try again" busy={starting} onPress={join} />
              <Button label="Back to the invite" tone="quiet" disabled={starting} onPress={() => setRun(null)} />
            </>
          ) : undefined
        }
      >
        <Title>Joining {invite.title}</Title>
        <Small>Your phone may ask for your fingerprint or screen lock.</Small>
        <View style={{ marginTop: space.md }}>
          <Steps steps={steps} />
        </View>
        {run.error && <Notice tone="error">{run.error}</Notice>}
      </Screen>
    );
  }

  // the circle's own clock, so a phone with the wrong time doesn't misjudge the join deadline
  const now = Math.floor(Date.now() / 1000 + offset);
  let blocker: string | null = null;
  let already = false;
  if (snap) {
    const seat = snap.members[invite.seat];
    if (snap.me) already = true;
    else if (seat?.address) blocker = `${who} already took this place. If that wasn't you, ask ${organizer} for a new link.`;
    else if (snap.state === "cancelled" || (snap.state === "forming" && now >= Number(snap.rules.joinDeadline)))
      blocker = `This circle no longer exists: not everyone joined in time, so it was called off and deposits went back. Ask ${organizer} to start a new one.`;
    else if (snap.state !== "forming") blocker = "This circle has already started, so it can't take new members.";
    else if (terms?.stage === "Away")
      blocker = "Your cat is staying with the neighbours: you still owe another circle. Pay that back on Account, then you can join.";
    else if (terms && terms.open >= terms.maxOpen)
      blocker = `Your cat lets you be in ${terms.maxOpen} ${terms.maxOpen === 1 ? "circle" : "circles"} at once, and you're in that many now. Finish one first.`;
  }

  // the order if nobody makes an offer and nobody misses: everyone seated,
  // and this member at their stage; seats still empty come after (FR-TRU-14)
  const order =
    snap && terms
      ? payoutOrder([
          ...snap.members.filter((m) => m.address).map((m) => ({ seat: m.seat, stage: m.stage, mine: false, owner: m.address! })),
          { seat: invite.seat, stage: terms.stage, mine: true, owner: me },
        ])
      : [];
  const myTurn = order.findIndex((o) => o.mine) + 1;
  const offerRound = terms && snap ? firstOfferRound(terms.offerFrom, snap.rules.memberCount) : null;


  return (
    <Screen
      onBack={() => navigation.goBack()}
      footer={
        already ? (
          <Button label="Open the circle" onPress={() => navigation.replace("Circle", { address: invite.circle })} />
        ) : snap && terms && !blocker ? (
          <>
            {formError && <Notice tone="error" onClose={() => setFormError(null)}>{formError}</Notice>}
            <Button label={`Join and put down ${money(deposit)}`} busy={starting} onPress={join} />
          </>
        ) : undefined
      }
    >
      <View style={styles.hero}>
        <KittyLogo size={64} />
        <Small>{organizer} invited you to</Small>
        <Title>{invite.title}</Title>
        <Body>A place for {who}, with people you know.</Body>
        {snap && (
          <Small selectable>
            The names come from the link. The circle was started by {shortAddress(snap.organizer)}. Check with {organizer} that this is theirs.
          </Small>
        )}
        {snap && <View style={{ marginTop: space.sm, gap: space.sm }}>
          <Heading>{money(snap.rules.contribution)} each round</Heading>
          <Small>{snap.rules.memberCount} people · {snap.rules.memberCount} rounds</Small>
          {terms && <Small>Deposit to join: {money(deposit)}. Read your terms and the rules below before you confirm.</Small>}
        </View>}
      </View>

      {loadError && <><Notice tone="error">{loadError}</Notice><Button label="Try again" tone="quiet" onPress={load} /></>}
      {!snap && !loadError && <Small>Loading the circle…</Small>}
      {already && <Notice tone="good">You're already in this circle.</Notice>}
      {blocker && <Notice tone="error">{blocker}</Notice>}

      {snap && !already && !blocker && termsError && (
        <>
          <Notice tone="error">Couldn't check your terms for this circle. Check your connection and try again.</Notice>
          <Button label="Try again" tone="quiet" onPress={() => setTermsTry((t) => t + 1)} />
        </>
      )}

      {snap && terms && !already && !blocker && (
        <Section title="Your terms" right={<Tag label={STAGE_NAME[terms.stage]} tone={terms.stage === "Wary" ? "clay" : terms.stage === "Shy" ? "slate" : "leaf"} />}>
          <Body>
            If nobody makes an offer and nobody misses, you'd be paid in round {myTurn} of {snap.rules.memberCount}.{" "}
            {offerRound === null
              ? "Your cat is wary, so you can't make offers to go earlier in this circle."
              : offerRound === 1
                ? "You can make an offer to go earlier in any round."
                : `You can make an offer to go earlier from round ${offerRound}.`}
          </Body>
          <List>
            {termsInWords(terms.stage)
              .filter((t) => t.label !== "Circles at once")
              .map((t, i, all) => (
                <Row key={t.label} last={i === all.length - 1}>
                  <Body style={{ flex: 1 }}>{t.label}</Body>
                  <Body style={{ fontFamily: font.bodyBold, flexShrink: 1, textAlign: "right" }}>{t.value}</Body>
                </Row>
              ))}
          </List>
        </Section>
      )}

      {snap && terms && !already && !blocker && (
        <Section title="Paid in this order">
          <List>
            {order.map((o, i) => (
              <Row key={o.seat} last={i === order.length - 1}>
                <Body style={{ width: 28, color: color.slate }}>{i + 1}</Body>
                {showCat && <CatFace owner={o.owner} stage={o.stage ?? "Shy"} size={36} />}
                <Body style={{ flex: 1, fontFamily: o.mine ? font.bodyBold : font.body }}>{o.mine ? `You (${who})` : nameAt(names, o.seat)}</Body>
                <Tag label={STAGE_NAME[o.stage ?? "Shy"]} tone={o.stage === "Wary" || o.stage === "Away" ? "clay" : o.stage === "Shy" ? "slate" : "leaf"} />
              </Row>
            ))}
          </List>
          <Small>
            Members whose cats trust them more are paid first; among equals, seat order. {snap.rules.memberCount - order.length > 0
              ? `${snap.rules.memberCount - order.length} still to join will slot in by their own cats.`
              : ""}
          </Small>
        </Section>
      )}

      {snap && (
        <Section title="Before you join">
          <View style={{ gap: space.sm }}>
            {rulesInWords(snap.rules).map((l) => (
              <Body key={l.lead}>
                <Body style={{ fontFamily: font.bodyBold }}>{l.lead}</Body> {l.text}
              </Body>
            ))}
          </View>
        </Section>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: color.pinkSoft, borderRadius: radius.hero, padding: space.lg, gap: space.xs, marginTop: space.xs },
});
