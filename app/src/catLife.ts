// The cat's signs of life, ported from the website cat (site/public/js/kitty.js): a head that
// chases a speed-capped gaze with critically damped springs, eyes that lead, blinks (sometimes
// double), ear flicks, a tail wave, breathing, and an idle look-around between spots in her
// room. Reactions (pet, feed, hello, look at a tap) are short timelines on top.
//
// Pure and clock-driven: step(now) returns the pose at `now` (ms). No React, no timers, so the
// renderer decides the frame rate and tests can step it deterministically.

/** A place she can look at, as head angles in degrees (yaw right +, pitch up +). */
export type Spot = { yaw: number; pitch: number; weight?: number };
/** A floating heart: t runs 0 → 1 over its life; side is -1 (left) to 1 (right). */
export type Heart = { t: number; side: number };
/** A crumb popping out of the bowl: t runs 0 → 1; k picks its direction. */
export type Crumb = { t: number; k: number };

export type Pose = {
  yaw: number; pitch: number; roll: number; neck: number; dip: number;
  eyeYaw: number; eyePitch: number;
  earSec: number; whiskSec: number;
  /** blink lid 0 open → 1 shut */
  lid: number;
  /** happy squint 0 → 1 (eyes become arcs, mouth smiles) */
  squint: number;
  /** ears forward 0 → 1 */
  perk: number;
  /** ear flick in degrees, [left, right] */
  flick: [number, number];
  /** small "o" mouth 0 → 1 */
  o: number;
  tongue: number;
  chomp: number;
  /** 0 → 1 → 0 over one breath */
  breath: number;
  /** per-joint tail offsets in degrees (website's 12-joint chain) */
  tail: number[];
  /** simple sway about -1 → 1 for one-piece tails */
  sway: number;
  /** hop as a fraction of a full rise: 0 rest, -1 top */
  hop: number; hopSX: number; hopSY: number; cushion: number;
  /** leaning toward the bowl 0 → 1, and the head's bite dip 0 → 1 */
  lean: number; bite: number;
  /** purr tremble, already oscillating, about -1 → 1 */
  purr: number;
  hearts: Heart[];
  crumbs: Crumb[];
};

export const MAX_YAW = 25;
export const MAX_PITCH = 15;
export const TAIL_JOINTS = [-12, -18, -18, -16, -15, -12, -10, -4, -2, 12, 16, 26];
const TAIL_AMP = [0.8, 1.2, 1.5, 1.7, 1.9, 2.1, 2.3, 2.5, 2.7, 3, 3.3, 3.6];
export const VIEWER: Spot = { yaw: 0, pitch: -1 };

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type S = { x: number; v: number };
const sp = (): S => ({ x: 0, v: 0 });
/** Critically damped spring, exact for any frame time. */
function spring(s: S, target: number, omega: number, dt: number) {
  const x = s.x - target, e = Math.exp(-omega * dt), t = (s.v + omega * x) * dt;
  s.x = target + (x + t) * e;
  s.v = (s.v - omega * t) * e;
}
/** Underdamped follower for ears and whiskers: trails the head and overshoots a touch. */
function wobble(s: S, target: number, dt: number) {
  for (let i = 0, n = Math.ceil(dt / 0.008), h = dt / n; i < n; i++) {
    s.v += (-260 * (s.x - target) - 14 * s.v) * h;
    s.x += s.v * h;
  }
}

export function blinkCurve(t: number) {
  if (t < 0 || t >= 230) return 0;
  return t < 70 ? easeIn(t / 70) : t < 100 ? 1 : 1 - easeOut((t - 100) / 130);
}
export function pulse(t: number, up = 120, down = 420) {
  if (t < 0 || t > up + down) return 0;
  return t < up ? easeOut(t / up) : 1 - easeInOut((t - up) / down);
}
function flickCurve(t: number) {
  if (t < 0 || t > 370) return 0;
  return t < 250 ? 12 * Math.sin((Math.PI * t) / 250) : -2.5 * Math.sin((Math.PI * (t - 250)) / 120);
}
function squintCurve(t: number, hold: number) {
  if (t < 0 || t > hold + 320) return 0;
  return t < 120 ? easeOut(t / 120) : t < hold + 120 ? 1 : 1 - easeInOut((t - hold - 120) / 200);
}
/** squash 120, rise 160, land 100 (cushion dips), settle 150 */
function hopCurve(t: number) {
  const h = { y: 0, sx: 1, sy: 1, cushion: 1 };
  if (t < 0 || t > 530) return h;
  if (t < 120) { const k = easeOut(t / 120); h.sy = lerp(1, 0.9, k); h.sx = lerp(1, 1.06, k); }
  else if (t < 280) { const k = easeOut((t - 120) / 160); h.y = -k; h.sy = lerp(0.9, 1.05, k); h.sx = lerp(1.06, 0.97, k); }
  else if (t < 380) { const k = easeIn((t - 280) / 100); h.y = -(1 - k); h.sy = lerp(1.05, 0.93, k); h.sx = lerp(0.97, 1.05, k); h.cushion = lerp(1, 0.93, k); }
  else { const k = easeOut((t - 380) / 150); h.sy = lerp(0.93, 1, k); h.sx = lerp(1.05, 1, k); h.cushion = lerp(0.93, 1, k); }
  return h;
}

const FEED = { lean: [300, 700, 2000, 2350], bites: [780, 1180, 1580], lick: 2060, squint: 2320, heart: 2380, hop: 2480, end: 3100 };
/** How long dinner takes, start to settled. */
export const FEED_MS = FEED.end;

/**
 * One cat's life. `shed` drops work on slow phones like the website does:
 * 1 no follow-through, 2 no tail sway, 3 no breathing, 4 no idle look-around.
 */
export class CatLife {
  shed = 0;
  private readonly r: () => number;
  private readonly spots: Spot[];
  private started = false;
  private prev = 0;
  // head, goal, eyes, neck, roll, follow-through
  private H = { yaw: sp(), pitch: sp() };
  private G = { yaw: 0, pitch: 0 };
  private E = { yaw: sp(), pitch: sp() };
  private N = sp();
  private roll = sp();
  private earLag = sp();
  private whiskLag = sp();
  private T = { yaw: VIEWER.yaw, pitch: VIEWER.pitch };
  private eyeOmega = 40;
  private yawSpeed = 0;
  private slowUntil = 0;
  // timelines
  private blinkT0 = -1e9; private blinkDouble = false; private nextBlink = 0;
  private flickT0 = -1e9; private flickEar = 0; private nextFlick = 0;
  private squintT0 = -1e9; private squintHold = 900;
  private perkT0 = -1e9; private oT0 = -1e9;
  private nuzzleT0 = -1e9; private nuzzleSide = 1;
  private purrT0 = -1e9;
  private hopT0 = -1e9;
  private feedT0 = -1e9;
  private holdUntil = 0; private hold: Spot | null = null;
  private current: Spot = VIEWER; private nextLook = 0; private glanceBack: { spot: Spot; at: number } | null = null;
  private hearts: { t0: number; side: number }[] = [];
  private crumbs: { t0: number; k: number }[] = [];
  private events: { at: number; run: (at: number) => void }[] = [];
  private tailPhase = 0; private tailPeriod = 5; private breathT = 0;
  private twitchT0 = -1e9;

  constructor(spots: Spot[], random: () => number = Math.random) {
    this.spots = spots.length ? spots : [VIEWER];
    this.r = random;
  }

  private rand(a: number, b: number) { return a + this.r() * (b - a); }

  /** Arrival: ears perk, first blink and first glance a little later. */
  start(now: number) {
    if (this.started) return;
    this.started = true;
    this.prev = now;
    this.nextBlink = now + this.rand(1800, 3200);
    this.nextFlick = now + this.rand(5000, 10000);
    this.nextLook = now + this.rand(1500, 3000);
    this.perkT0 = now + 200;
    this.tailPhase = this.rand(0, Math.PI * 2);
  }

  private blink(now: number, allowDouble = true) {
    this.blinkT0 = now;
    this.blinkDouble = allowDouble && this.r() < 0.25;
    this.nextBlink = now + this.rand(3000, 6000) + (this.blinkDouble ? 330 : 0);
  }
  private lidAt(now: number) {
    return Math.max(blinkCurve(now - this.blinkT0), this.blinkDouble ? blinkCurve(now - this.blinkT0 - 330) : 0);
  }
  private squintAt(now: number) { return squintCurve(now - this.squintT0, this.squintHold); }
  private squint(now: number, hold: number) {
    // extra taps restart the squint without letting it fall open
    const live = this.squintAt(now) > 0 && now - this.squintT0 > 120;
    this.squintT0 = live ? now - 120 : now;
    this.squintHold = hold;
  }
  private heart(now: number, side = this.rand(-0.6, 0.6)) {
    this.hearts = this.hearts.filter((h) => now - h.t0 < 1150).slice(-2);
    this.hearts.push({ t0: now, side });
  }
  private at(now: number, delay: number, run: (at: number) => void) { this.events.push({ at: now + delay, run }); }
  private holdGaze(spot: Spot, until: number) { this.hold = spot; this.holdUntil = until; }

  /** Petting: a happy squint, a nuzzle toward the hand, a purr, ears up, a heart. */
  pet(now: number, side = 1) {
    this.start(now);
    this.squint(now, 1000);
    this.nuzzleT0 = now; this.nuzzleSide = side >= 0 ? 1 : -1;
    this.purrT0 = now;
    this.perkT0 = now;
    this.heart(now, side >= 0 ? 0.5 : -0.5);
    this.holdGaze(VIEWER, now + 1600);
  }

  /** Dinner: look at the bowl, lean in, three bites, lick, a happy squint and a hop. */
  feed(now: number, bowl: Spot) {
    this.start(now);
    this.feedT0 = now;
    this.perkT0 = now;
    this.holdGaze(bowl, now + FEED.squint);
    this.events = [];
    for (const b of FEED.bites) this.at(now, b + 60, (t) => { this.crumbs = this.crumbs.filter((c) => t - c.t0 < 500); this.crumbs.push({ t0: t, k: this.r() }); });
    this.at(now, FEED.squint, (t) => { this.squint(t, 800); this.holdGaze(VIEWER, t + 1200); });
    this.at(now, FEED.heart, (t) => this.heart(t, 0.3));
    this.at(now, FEED.hop, (t) => { this.hopT0 = t; });
  }

  /** A hello: a hop, ears up, a squint and a heart. */
  hello(now: number) {
    this.start(now);
    this.hopT0 = now;
    this.perkT0 = now + 400;
    this.at(now, 260, (t) => { this.squint(t, 800); this.heart(t, 0.2); });
    this.holdGaze(VIEWER, now + 1800);
  }

  /** Arriving on screen: one small hop, then ears up as she settles (the website's arrival). */
  arrive(now: number) {
    this.start(now);
    this.hopT0 = now + 300;
    this.perkT0 = now + 860;
  }

  /** One slow, deliberate blink: a cat's way of saying hello. */
  slowBlink(now: number) {
    this.start(now);
    this.blink(now, false);
    this.holdGaze(VIEWER, now + 1200);
  }

  /** A tap somewhere in her room: a small "o", then she looks there for a moment. */
  lookAt(now: number, spot: Spot) {
    this.start(now);
    this.oT0 = now; this.perkT0 = now; this.twitchT0 = now;
    this.holdGaze({ yaw: clamp(spot.yaw, -MAX_YAW, MAX_YAW), pitch: clamp(spot.pitch, -MAX_PITCH, MAX_PITCH) }, now + 2000);
  }

  private pick(): Spot {
    const options = this.spots.filter((s) => s !== this.current);
    const pool = options.length ? options : this.spots;
    const total = pool.reduce((n, s) => n + (s.weight ?? 1), 0);
    let x = this.r() * total;
    for (const s of pool) { x -= s.weight ?? 1; if (x <= 0) return s; }
    return pool[pool.length - 1];
  }

  private chooseTarget(now: number): Spot {
    if (this.hold && now < this.holdUntil) return this.hold;
    if (this.hold) { this.hold = null; this.slowUntil = now + 700; this.nextLook = now + this.rand(1500, 3000); }
    if (this.shed >= 4) return VIEWER;
    if (this.glanceBack && now >= this.glanceBack.at) {
      this.current = this.glanceBack.spot;
      this.glanceBack = null;
      this.nextLook = now + this.rand(2500, 5500);
    } else if (now >= this.nextLook) {
      const next = this.pick();
      // sometimes only a glance: a quick look, then straight back
      if (this.r() < 0.22 && this.current !== next) this.glanceBack = { spot: this.current, at: now + this.rand(550, 850) };
      this.current = next;
      this.nextLook = now + this.rand(2500, 6000);
    }
    return this.current;
  }

  step(now: number): Pose {
    this.start(now);
    const dtMs = clamp(now - this.prev, 0, 64);
    this.prev = now;
    const dt = dtMs / 1000;

    if (this.events.length) {
      const due = this.events.filter((e) => now >= e.at);
      if (due.length) {
        this.events = this.events.filter((e) => now < e.at);
        for (const e of due) e.run(e.at);
      }
    }
    if (now >= this.nextBlink && this.squintAt(now) === 0) this.blink(now);
    if (now >= this.nextFlick) { this.flickT0 = now; this.flickEar = this.r() < 0.5 ? 0 : 1; this.nextFlick = now + this.rand(6000, 12000); }

    const target = this.chooseTarget(now);
    if (Math.abs(target.yaw - this.T.yaw) >= 0.5 || Math.abs(target.pitch - this.T.pitch) >= 0.5) {
      // a big turn earns a blink, as cats (and people) do
      if (Math.abs(target.yaw - this.H.yaw.x) > 15 && now - this.blinkT0 > 600 && this.squintAt(now) === 0) this.blink(now, false);
      this.T = { yaw: target.yaw, pitch: target.pitch };
    }

    // the head chases a speed-capped goal: a jump across the room is a quick turn, never a snap
    const maxV = (now < this.slowUntil ? 40 : 240) * dt;
    this.G.yaw += clamp(this.T.yaw - this.G.yaw, -maxV, maxV);
    this.G.pitch += clamp(this.T.pitch - this.G.pitch, -maxV, maxV);
    spring(this.H.yaw, this.G.yaw, 19, dt);
    spring(this.H.pitch, this.G.pitch, 19, dt);
    spring(this.N, this.T.yaw, 13, dt);
    const nuzzle = pulse(now - this.nuzzleT0, 180, 520);
    spring(this.roll, 6 * clamp(this.H.yaw.x / MAX_YAW, -1, 1) + 9 * this.nuzzleSide * nuzzle, 12, dt);
    // eyes jump (~60 ms) when the target moves a lot, and track smoothly when it moves a little
    const gap = Math.abs(this.T.yaw - this.E.yaw.x) + Math.abs(this.T.pitch - this.E.pitch.x);
    this.eyeOmega = gap > 6 ? 80 : Math.max(40, this.eyeOmega - 200 * dt);
    spring(this.E.yaw, this.T.yaw, this.eyeOmega, dt);
    spring(this.E.pitch, this.T.pitch, this.eyeOmega, dt);
    this.yawSpeed += (Math.abs(this.H.yaw.v) - this.yawSpeed) * 0.3;
    const dip = -2 * clamp(this.yawSpeed / 110, 0, 1);

    if (this.shed < 1) { wobble(this.earLag, this.H.yaw.x, dt); wobble(this.whiskLag, this.H.yaw.x, dt); }
    else { this.earLag = { x: this.H.yaw.x, v: 0 }; this.whiskLag = { x: this.H.yaw.x, v: 0 }; }

    if (this.shed < 2) {
      this.tailPhase += (dt / this.tailPeriod) * Math.PI * 2;
      if (this.tailPhase > Math.PI * 2) { this.tailPhase -= Math.PI * 2; this.tailPeriod = this.rand(4, 6); }
    }
    const tt = now - this.twitchT0;
    const twitch = tt >= 0 && tt < 450 ? Math.sin(tt / 28) * (1 - tt / 450) * 9 : 0;
    const tail = TAIL_AMP.map((a, j) => (this.shed < 2 ? a * Math.sin(this.tailPhase - j * 0.32) : 0) + (j >= TAIL_AMP.length - 3 ? twitch * 0.6 : 0));
    if (this.shed < 3) this.breathT += dt;
    const purrEnv = pulse(now - this.purrT0, 150, 1450);
    const breath = this.shed < 3 ? 0.5 - 0.5 * Math.cos((this.breathT / 3.5) * Math.PI * 2) : 0;

    // dinner
    const f = now - this.feedT0;
    const [l0, l1, l2, l3] = FEED.lean;
    const lean = f < l0 || f > l3 ? 0 : f < l1 ? easeInOut((f - l0) / (l1 - l0)) : f < l2 ? 1 : 1 - easeInOut((f - l2) / (l3 - l2));
    const bite = Math.max(...FEED.bites.map((b) => pulse(f - b, 110, 230)));
    const tongue = pulse(f - FEED.lick, 120, 330);

    const hop = hopCurve(now - this.hopT0);
    const flick = flickCurve(now - this.flickT0) * (this.shed < 1 ? 1 : 0.6);
    const sq = this.squintAt(now);
    this.hearts = this.hearts.filter((h) => now - h.t0 < 1150);
    this.crumbs = this.crumbs.filter((c) => now - c.t0 < 500);
    return {
      yaw: this.H.yaw.x, pitch: this.H.pitch.x, roll: this.roll.x, neck: this.N.x, dip,
      eyeYaw: this.E.yaw.x, eyePitch: this.E.pitch.x,
      earSec: this.earLag.x - this.H.yaw.x, whiskSec: this.whiskLag.x - this.H.yaw.x,
      lid: sq > 0 ? 0 : this.lidAt(now),
      squint: sq,
      perk: pulse(now - this.perkT0),
      flick: [this.flickEar === 0 ? flick : 0, this.flickEar === 1 ? flick : 0],
      o: now - this.oT0 < 250 ? 1 : 0,
      tongue, chomp: bite,
      breath, tail, sway: this.shed < 2 ? Math.sin(this.tailPhase) + twitch / 9 : 0,
      hop: hop.y, hopSX: hop.sx, hopSY: hop.sy, cushion: hop.cushion,
      lean, bite,
      purr: purrEnv * Math.sin((now / 1000) * Math.PI * 2 * 24),
      hearts: this.hearts.map((h) => ({ t: (now - h.t0) / 1150, side: h.side })),
      crumbs: this.crumbs.map((c) => ({ t: (now - c.t0) / 500, k: c.k })),
    };
  }
}

/** The resting pose: what she looks like before any motion, and with Reduce Motion on. */
export const REST_POSE: Pose = {
  yaw: 0, pitch: 0, roll: 0, neck: 0, dip: 0, eyeYaw: 0, eyePitch: 0, earSec: 0, whiskSec: 0,
  lid: 0, squint: 0, perk: 0, flick: [0, 0], o: 0, tongue: 0, chomp: 0, breath: 0,
  tail: TAIL_AMP.map(() => 0), sway: 0, hop: 0, hopSX: 1, hopSY: 1, cushion: 1, lean: 0, bite: 0, purr: 0, hearts: [], crumbs: [],
};
