// Kitty on the landing page: a layered 2.5D head turn, small signs of life, and her
// reactions to the Download button. One rAF loop, transforms and opacity only, no layout
// reads inside the loop. Without this script she sits still in her resting pose.
(() => {
  "use strict";
  const svg = document.getElementById("kitty");
  const scene = document.querySelector(".scene");
  if (!svg || !scene || !window.requestAnimationFrame) return;

  const room = scene.parentElement;
  const roomImg = scene.querySelector(".room-img");
  const btn = document.getElementById("download");
  const fx = scene.querySelector(".fx");
  const stars = Array.from(fx.querySelectorAll(".star"));
  const $ = (id) => document.getElementById(id);
  const q = (root, sel) => root.querySelector(sel);

  const cat = $("cat"), cushion = $("cushion"), shadow = $("shadow"), body = $("body"), neck = $("neck"), head = $("head");
  const ears = [$("earL"), $("earR")], cheeks = [$("cheekL"), $("cheekR")], blush = [$("blushL"), $("blushR")];
  const whisk = [$("whiskL"), $("whiskR")], muzzle = $("muzzle"), nose = $("nose"), mouth = $("mouth");
  const mouthW = q(mouth, ".m-w"), mouthO = q(mouth, ".m-o"), mouthBig = q(mouth, ".m-big");
  const eyes = [$("eyeL"), $("eyeR")].map((g) => ({
    g, ball: q(g, ".eyeball"), iris: q(g, ".iris"), glint: q(g, ".glint"), lid: q(g, ".lid"), happy: q(g, ".happy"),
  }));
  const chains = Array.from(svg.querySelectorAll("#tail .ch")).map((c) => Array.from(c.querySelectorAll("g")));

  // Her own units: the shared 1600x1200 scene box. The cat's origin sits on the cushion at (800, 840).
  const CAT = { x: 800, y: 840 };
  const FACE = { x: 800, y: 840 - 214 - 100 };  // where she looks from
  const HEART_Y = 270;                          // above her ears, inside the safe zone
  const SIDE = [-1, 1];                         // left, right as the viewer sees her
  const EYE_X = [-62, 62], EYE_Y = -108, CHEEK_X = [-150, 150], CHEEK_Y = -46;
  const EAR_X = [-92, 92], EAR_Y = -172, WHISK_X = [-62, 62], WHISK_Y = -56;
  const TAIL = [-12, -18, -18, -16, -15, -12, -10, -4, -2, 12, 16, 26];  // joint angles, 28 units apart
  const TAIL_AMP = [0.8, 1.2, 1.5, 1.7, 1.9, 2.1, 2.3, 2.5, 2.7, 3, 3.3, 3.6];
  const MAX_YAW = 25, MAX_PITCH = 15;
  const KX = 80, KY = 62;                       // a full turn moves the nose ~11% of the head's width

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

  // ---- helpers ----
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const rand = (a, b) => a + Math.random() * (b - a);
  const r2 = (n) => Math.round(n * 100) / 100;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;
  const written = new WeakMap();
  function set(node, attr, value) {
    let m = written.get(node);
    if (!m) written.set(node, (m = {}));
    if (m[attr] === value) return;
    m[attr] = value;
    node.setAttribute(attr, value);
  }
  const tf = (node, value) => set(node, "transform", value);
  const op = (node, value) => set(node, "opacity", String(r2(value)));

  // Critically damped spring, exact for any frame time, so speed never depends on frame rate.
  function spring(s, target, omega, dt) {
    const x = s.x - target, e = Math.exp(-omega * dt), t = (s.v + omega * x) * dt;
    s.x = target + (x + t) * e;
    s.v = (s.v - omega * t) * e;
  }
  // Underdamped follower for ears and whiskers: trails the head and overshoots a touch.
  function wobble(s, target, dt) {
    for (let i = 0, n = Math.ceil(dt / 0.008), h = dt / n; i < n; i++) {
      s.v += (-260 * (s.x - target) - 14 * s.v) * h;
      s.x += s.v * h;
    }
  }
  const sp = () => ({ x: 0, v: 0 });

  // ---- layout cache: read on resize, orientation change and font load, never in the loop ----
  const L = { faceX: 0, faceY: 0, unit: 1, sx: 0, sy: 0, btnX: 0, btnY: 0, vw: 1 };
  function measure() {
    const r = svg.getBoundingClientRect();
    L.unit = r.width / 1600 || 1;
    L.sx = r.left; L.sy = r.top;
    L.faceX = r.left + FACE.x * L.unit;
    L.faceY = r.top + FACE.y * L.unit;
    L.vw = window.innerWidth || 1;
    if (btn) {
      const b = btn.getBoundingClientRect();
      L.btnX = b.left + b.width / 2;
      L.btnY = b.top + b.height / 2;
    }
    if (S.started && reduce.matches) renderStill();
  }
  // A screen point to gaze angles, seen from a virtual distance of 60% of the viewport width.
  function anglesTo(px, py) {
    const d = 0.6 * L.vw;
    return {
      yaw: clamp(deg(Math.atan2(px - L.faceX, d)), -MAX_YAW, MAX_YAW),
      pitch: clamp(deg(Math.atan2(L.faceY - py, d)), -MAX_PITCH, MAX_PITCH),
    };
  }
  const sceneToScreen = (x, y) => [L.sx + x * L.unit, L.sy + y * L.unit];
  const restAngles = () => anglesTo(L.btnX, L.btnY);

  // ---- state ----
  const H = { yaw: sp(), pitch: sp() };   // head
  const G = { yaw: 0, pitch: 0 };         // speed-capped goal the head chases
  const E = { yaw: sp(), pitch: sp() };   // eyes, which lead
  const N = sp();                         // neck lean
  const roll = sp();
  const earLag = sp(), whiskLag = sp();
  const T = { yaw: 0, pitch: 0 };         // gaze target
  let eyeOmega = 40, yawSpeed = 0, slowUntil = 0;

  const S = {
    started: false, arrived: false, hopT0: -1, lookFrom: 0,
    pointer: null, pointerGoneAt: -1e9, lull: false,
    hover: false, focus: false, pressExcite: false, tap: null, tilt: null, idle: null,
    excite: 0, squintT0: -1e9, perkT0: -1e9, oT0: -1e9, twitchT0: -1e9,
    blinkT0: -1e9, blinkDouble: false, nextBlink: 0, flickT0: -1e9, flickEar: 0, nextFlick: 0,
    lastInput: 0, tailPhase: 0, tailPeriod: 5, breathT: 0,
    shed: 0, ema: 16.7, slowFrames: 0,
  };

  // ---- the pose: everything she does comes down to this one render ----
  function pose(p) {
    const yaw = p.yaw, pitch = p.pitch + p.dip;
    const sy = Math.sin(rad(yaw)), spi = Math.sin(rad(pitch)), cy = Math.cos(rad(yaw));
    const dx = (d) => d * KX * sy, dy = (d) => -d * KY * spi;
    const far = (s) => s * yaw > 0;
    const sideScale = (s) => (far(s) ? Math.pow(cy, 1.8) : 1 + 0.1 * Math.abs(sy));
    const sq = p.squint, ex = p.excite;

    // body breathes from the bottom; neck and head ride along
    const lift = 250 * 0.015 * p.breath;
    tf(cat, `translate(0 ${r2(p.hopY + p.dipY)}) scale(${r2(p.hopSX)} ${r2(p.hopSY)})`);
    tf(body, `scale(1 ${r2(1 + 0.015 * p.breath)})`);
    tf(cushion, `translate(0 112) scale(${r2(1 + (1 - p.cushion) * 0.25)} ${r2(p.cushion)}) translate(0 -112)`);
    tf(shadow, `translate(0 ${r2(p.dipY)})`);

    // neck and chest take about a third of the turn: lean, skew, and carry the head's pivot
    const n = p.neck / MAX_YAW;
    tf(neck, `translate(${r2(n * 4)} ${r2(-lift)}) translate(0 -150) rotate(${r2(n * 3)}) skewX(${r2(-n * 5)}) scale(1 ${r2(1 + 0.03 * spi)}) translate(0 150)`);
    tf(head, `translate(${r2(n * 9)} ${r2(-214 - lift - 6 * spi)}) rotate(${r2(p.roll)})`);

    for (let i = 0; i < 2; i++) {
      const s = SIDE[i], f = far(s), mirror = i === 0 ? -1 : 1;
      // ears sit behind the face: slight opposite parallax; the far ear narrows and slips behind
      const rot = -s * 9 * p.perk + s * p.flick[i] + p.earSec * 0.6;
      tf(ears[i], `translate(${r2(EAR_X[i] + dx(-0.3) - (f ? s * 18 * Math.abs(sy) : 0))} ${r2(EAR_Y + dy(-0.3) + 6 * spi)}) rotate(${r2(rot)}) scale(${r2(mirror * (f ? cy * cy : 1))} ${r2(1 - 0.24 * spi)})`);
      // cheeks tuck in on the far side and lift in the happy squint
      tf(cheeks[i], `translate(${r2(CHEEK_X[i] + dx(0.35) - (f ? s * 14 * Math.abs(sy) : 0))} ${r2(CHEEK_Y + dy(0.35) - 10 * sq)}) scale(${r2(-mirror * sideScale(s))} 1)`);
      const bx = 112 * s;
      tf(blush[i], `translate(${r2(bx + dx(0.5))} ${r2(-58 + dy(0.5) - 8 * sq)}) scale(${r2(sideScale(s) * (1 + 0.15 * sq))} ${r2(1 + 0.1 * sq)}) translate(${-bx} 58)`);
      op(blush[i], 0.55 + 0.35 * sq);
      // whiskers pivot at the muzzle; far side shortens; a little follow-through
      tf(whisk[i], `translate(${r2(WHISK_X[i] + dx(0.9))} ${r2(WHISK_Y + dy(0.9) - 3 * sq)}) rotate(${r2(-s * 4 * sq + p.whiskSec * 0.5)}) scale(${r2(-mirror * sideScale(s))} 1)`);
    }

    // eyes: parallax 0.6, the far eye narrows, and the iris leads inside its clip
    const irisX = clamp(clamp(p.eyeYaw / MAX_YAW, -1, 1) * 4.5 + clamp((p.eyeYaw - yaw) / 10, -1, 1) * 4, -8, 8);
    const irisY = clamp(-(clamp(p.eyePitch / MAX_PITCH, -1, 1) * 3.5 + clamp((p.eyePitch - p.pitch) / 8, -1, 1) * 3), -7, 7);
    const open = 1 + 0.08 * ex;
    for (let i = 0; i < 2; i++) {
      const e = eyes[i];
      tf(e.g, `translate(${r2(EYE_X[i] + dx(0.6))} ${r2(EYE_Y + dy(0.6) - 4 * sq)}) scale(${r2(sideScale(SIDE[i]))} 1)`);
      tf(e.ball, `scale(${r2(open)} ${r2(open * (1 - 0.92 * sq))})`);
      tf(e.iris, `translate(${r2(irisX)} ${r2(irisY)}) scale(${r2(1 + 0.15 * ex)} ${r2(1 + 0.11 * ex)})`);
      tf(e.lid, `translate(0 ${r2(84 * p.lid)})`);
      op(e.glint, ex);
      op(e.ball, 1 - sq * sq);
      op(e.happy, sq);
      tf(e.happy, `scale(1 ${r2(0.6 + 0.4 * sq)})`);
    }

    // muzzle, nose and mouth sit furthest forward
    tf(muzzle, `translate(${r2(dx(0.9))} ${r2(dy(0.9) - 3 * sq)})`);
    tf(nose, `translate(${r2(dx(1))} ${r2(dy(1) - 3 * sq)})`);
    tf(mouth, `translate(${r2(dx(0.85))} ${r2(dy(0.85) - 2 * sq)})`);
    const o = (1 - sq) * p.o;
    op(mouthW, 1 - Math.max(sq, o));
    op(mouthO, o);
    op(mouthBig, sq);
    tf(mouthBig, `translate(0 -55) scale(${r2(0.7 + 0.3 * sq)}) translate(0 55)`);

    // tail: a wave travelling from base to tip, rotations only
    for (let j = 0; j < TAIL.length; j++) {
      const a = r2(TAIL[j] + p.tail[j]);
      const t = j === 0 ? `rotate(${a})` : `translate(28 0) rotate(${a})`;
      for (let c = 0; c < chains.length; c++) tf(chains[c][j], t);
    }
  }

  // ---- timelines ----
  function blinkCurve(t) {
    if (t < 0 || t >= 230) return 0;
    return t < 70 ? easeIn(t / 70) : t < 100 ? 1 : 1 - easeOut((t - 100) / 130);
  }
  const lidAt = (now) => Math.max(blinkCurve(now - S.blinkT0), S.blinkDouble ? blinkCurve(now - S.blinkT0 - 330) : 0);
  function squintAt(now) {
    const t = now - S.squintT0;
    if (t < 0 || t > 1220) return 0;
    if (reduce.matches) return t < 1000 ? 1 : 0;
    return t < 120 ? easeOut(t / 120) : t < 1020 ? 1 : 1 - easeInOut((t - 1020) / 200);
  }
  function pulse(t0, now, up = 120, down = 420) {
    const t = now - t0;
    if (t < 0 || t > up + down) return 0;
    return t < up ? easeOut(t / up) : 1 - easeInOut((t - up) / down);
  }
  function flickAt(now) {
    const t = now - S.flickT0;
    if (t < 0 || t > 370) return 0;
    return t < 250 ? 12 * Math.sin((Math.PI * t) / 250) : -2.5 * Math.sin((Math.PI * (t - 250)) / 120);
  }
  // squash 120, rise 160, land 100 (cushion dips), settle 150
  function hopAt(now) {
    const h = { y: 0, sx: 1, sy: 1, cushion: 1 };
    const t = now - S.hopT0;
    if (S.hopT0 < 0 || t < 0 || t > 530) return h;
    const RISE = -0.08 * 560;
    if (t < 120) { const k = easeOut(t / 120); h.sy = lerp(1, 0.9, k); h.sx = lerp(1, 1.06, k); }
    else if (t < 280) { const k = easeOut((t - 120) / 160); h.y = RISE * k; h.sy = lerp(0.9, 1.05, k); h.sx = lerp(1.06, 0.97, k); }
    else if (t < 380) { const k = easeIn((t - 280) / 100); h.y = RISE * (1 - k); h.sy = lerp(1.05, 0.93, k); h.sx = lerp(0.97, 1.05, k); h.cushion = lerp(1, 0.93, k); }
    else { const k = easeOut((t - 380) / 150); h.sy = lerp(0.93, 1, k); h.sx = lerp(1.05, 1, k); h.cushion = lerp(0.93, 1, k); }
    return h;
  }

  function blink(now, allowDouble = true) {
    S.blinkT0 = now;
    S.blinkDouble = allowDouble && Math.random() < 0.25;
    S.nextBlink = now + rand(3000, 6000) + (S.blinkDouble ? 330 : 0);
  }

  // ---- what she looks at ----
  function chooseTarget(now) {
    if (S.hover || S.focus || S.pressExcite) return restAngles();
    if (S.tap && now < S.tap.until) return anglesTo(S.tap.x, S.tap.y);
    if (S.tap) { S.tap = null; slowUntil = now + 1000; }
    if (S.idle && S.idle.target) return S.idle.target;
    if (S.lull) return restAngles();
    if (S.pointer) return anglesTo(S.pointer.x, S.pointer.y);
    if (S.tilt) return S.tilt;
    return restAngles();
  }
  function setTarget(a, now) {
    if (Math.abs(a.yaw - T.yaw) < 0.5 && Math.abs(a.pitch - T.pitch) < 0.5) return; // dead zone: no jitter
    if (Math.abs(a.yaw - H.yaw.x) > 15 && now - S.blinkT0 > 600 && squintAt(now) === 0) blink(now, false);
    T.yaw = a.yaw; T.pitch = a.pitch;
  }

  // Idle look-around: blink, glance at one thing, pause, glance at another, pause, back to rest.
  const SPOTS = [[365, 470], [1176, 905], [420, 930]];
  function startIdle(now) {
    const order = SPOTS.slice().sort(() => Math.random() - 0.5).slice(0, 2);
    const steps = [{ at: now, blink: true }];
    let t = now + 260;
    for (const spot of order) { steps.push({ at: t, spot }); t += rand(1000, 2000) + 350; }
    steps.push({ at: t, end: true });
    S.idle = { steps, i: 0, target: null };
  }
  function runIdle(now) {
    const st = S.idle;
    while (st.i < st.steps.length && now >= st.steps[st.i].at) {
      const s = st.steps[st.i++];
      if (s.blink) blink(now, false);
      if (s.spot) { const [x, y] = sceneToScreen(s.spot[0], s.spot[1]); st.target = anglesTo(x, y); }
      if (s.end) { S.idle = null; S.lull = true; S.lastInput = now; slowUntil = now + 1000; return; }
    }
  }

  // ---- the loop ----
  let raf = 0, prev = 0, starsOn = false;
  const tailOff = new Array(TAIL.length).fill(0);
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dtMs = prev ? Math.min(now - prev, 64) : 16.7;
    prev = now;
    const dt = dtMs / 1000;

    // if frames keep dropping, shed follow-through, then tail sway, breathing, look-around
    S.ema += (dtMs - S.ema) * 0.05;
    if (S.ema > 21 && S.shed < 4) { if (++S.slowFrames > 120) { S.shed++; S.slowFrames = 0; S.ema = 16.7; } }
    else S.slowFrames = 0;
    if (!S.arrived) return;

    if (now >= S.nextBlink && squintAt(now) === 0) blink(now);
    if (now >= S.nextFlick) { S.flickT0 = now; S.flickEar = Math.random() < 0.5 ? 0 : 1; S.nextFlick = now + rand(6000, 12000); }
    if (S.shed < 4 && !S.idle && !S.lull && now - S.lastInput > 8000 && !S.hover && !S.focus) startIdle(now);
    if (S.idle) runIdle(now);
    if (now >= S.lookFrom) setTarget(chooseTarget(now), now);

    // the head chases a speed-capped goal: a jump across the screen is a quick turn, never a snap
    const maxV = (now < slowUntil ? 40 : 240) * dt;
    G.yaw += clamp(T.yaw - G.yaw, -maxV, maxV);
    G.pitch += clamp(T.pitch - G.pitch, -maxV, maxV);
    spring(H.yaw, G.yaw, 19, dt);
    spring(H.pitch, G.pitch, 19, dt);
    spring(N, T.yaw, 13, dt);
    spring(roll, 6 * clamp(H.yaw.x / MAX_YAW, -1, 1), 12, dt);
    // eyes jump (~60 ms) when the target moves a lot, and track smoothly when it moves a little
    const gap = Math.abs(T.yaw - E.yaw.x) + Math.abs(T.pitch - E.pitch.x);
    eyeOmega = gap > 6 ? 80 : Math.max(40, eyeOmega - 200 * dt);
    spring(E.yaw, T.yaw, eyeOmega, dt);
    spring(E.pitch, T.pitch, eyeOmega, dt);
    // big turns follow an arc: the head dips a little mid-turn
    yawSpeed += (Math.abs(H.yaw.v) - yawSpeed) * 0.3;
    const dip = -2 * clamp(yawSpeed / 110, 0, 1);

    if (S.shed < 1) { wobble(earLag, H.yaw.x, dt); wobble(whiskLag, H.yaw.x, dt); }
    else { earLag.x = whiskLag.x = H.yaw.x; earLag.v = whiskLag.v = 0; }

    // excitement: about 200 ms in, 300 ms out
    const want = S.hover || S.focus || S.pressExcite;
    S.excite = want ? Math.min(1, S.excite + dtMs / 200) : Math.max(0, S.excite - dtMs / 300);

    if (S.shed < 2) {
      S.tailPhase += (dt / S.tailPeriod) * Math.PI * 2;
      if (S.tailPhase > Math.PI * 2) { S.tailPhase -= Math.PI * 2; S.tailPeriod = rand(4, 6); }
    }
    const tt = now - S.twitchT0;
    const twitch = tt >= 0 && tt < 450 ? Math.sin(tt / 28) * (1 - tt / 450) * 9 : 0;
    for (let j = 0; j < TAIL.length; j++) tailOff[j] = (S.shed < 2 ? TAIL_AMP[j] * Math.sin(S.tailPhase - j * 0.32) : 0) + (j >= TAIL.length - 3 ? twitch * 0.6 : 0);
    if (S.shed < 3) S.breathT += dt;
    const breath = S.shed < 3 ? 0.5 - 0.5 * Math.cos((S.breathT / 3.5) * Math.PI * 2) : 0;

    const hop = hopAt(now), flick = flickAt(now) * (S.shed < 1 ? 1 : 0.6), sq = squintAt(now);
    pose({
      yaw: H.yaw.x, pitch: H.pitch.x, dip, roll: roll.x, neck: N.x, eyeYaw: E.yaw.x, eyePitch: E.pitch.x,
      earSec: earLag.x - H.yaw.x, whiskSec: whiskLag.x - H.yaw.x,
      perk: Math.max(easeOut(S.excite), pulse(S.perkT0, now)),
      flick: [S.flickEar === 0 ? flick : 0, S.flickEar === 1 ? flick : 0],
      lid: sq > 0 ? 0 : lidAt(now), squint: sq, excite: easeOut(S.excite), o: now - S.oT0 < 250 ? 1 : 0,
      breath, tail: tailOff,
      hopY: hop.y, hopSX: hop.sx, hopSY: hop.sy, cushion: hop.cushion, dipY: (1 - hop.cushion) * 112,
    });
    setStars(S.excite > 0.4);
  }
  function start() {
    if (raf || document.hidden || reduce.matches || !S.started) return;
    prev = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  // Reduced motion: a still rest pose toward the button; reactions appear without moving.
  function renderStill() {
    const a = restAngles(), sq = squintAt(performance.now());
    const ex = S.hover || S.focus || S.pressExcite ? 1 : 0;
    pose({
      yaw: a.yaw, pitch: a.pitch, dip: 0, roll: (6 * a.yaw) / MAX_YAW, neck: a.yaw, eyeYaw: a.yaw, eyePitch: a.pitch,
      earSec: 0, whiskSec: 0, perk: ex, flick: [0, 0], lid: 0, squint: sq, excite: ex, o: 0,
      breath: 0, tail: tailOff, hopY: 0, hopSX: 1, hopSY: 1, cushion: 1, dipY: 0,
    });
    setStars(!!ex);
  }
  function setStars(on) {
    if (on === starsOn) return;
    starsOn = on;
    for (const s of stars) s.classList.toggle("on", on);
  }

  // ---- reactions ----
  const HEART = '<svg viewBox="-12 -11 24 22" width="100%" height="100%" aria-hidden="true"><path d="M0,9 C-14,0 -11,-11 -5,-10 C-2,-9.6 -0.6,-7.6 0,-6 C0.6,-7.6 2,-9.6 5,-10 C11,-11 14,0 0,9 Z" fill="#EC7BAD"/><ellipse cx="-5" cy="-5" rx="2.4" ry="1.6" fill="#fff" opacity=".6" transform="rotate(-30 -5 -5)"/></svg>';
  function heart() {
    const hearts = fx.querySelectorAll(".heart");
    if (hearts.length >= 3) hearts[0].remove();
    const h = document.createElement("span");
    h.className = "heart";
    h.style.left = (CAT.x + 70 + KX * 0.6 * Math.sin(rad(H.yaw.x))) / 16 + "%";
    h.style.top = HEART_Y / 12 + "%";
    h.innerHTML = HEART;
    fx.appendChild(h);
    if (reduce.matches) setTimeout(() => h.remove(), 1000);
    else h.addEventListener("animationend", () => h.remove(), { once: true });
  }
  function happy() {
    const now = performance.now();
    // extra taps restart the squint without letting it fall open
    S.squintT0 = squintAt(now) > 0 && now - S.squintT0 > 120 ? now - 120 : now;
    heart();
    if (reduce.matches) { renderStill(); setTimeout(renderStill, 1010); }
  }
  function input(now = performance.now()) {
    S.lastInput = now;
    S.idle = null;
    S.lull = false;
  }
  function pointerGone() {
    if (!S.pointer) return;
    S.pointer = null;
    S.pointerGoneAt = performance.now();
    slowUntil = S.pointerGoneAt + 1000;
  }

  // Mouse and pen are tracked; touch looks at the tapped spot instead.
  document.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const now = performance.now();
    // noticing: back after 3+ s without a pointer, ears perk and a small "o"
    if (!S.pointer && S.arrived && now - S.pointerGoneAt > 3000) { S.oT0 = now; S.perkT0 = now; }
    S.pointer = { x: e.clientX, y: e.clientY };
    input(now);
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", pointerGone);
  window.addEventListener("blur", pointerGone);
  document.addEventListener("pointerdown", (e) => {
    input();
    if (e.pointerType !== "touch" || e.target.closest("a, button")) return;
    S.tap = { x: e.clientX, y: e.clientY, until: performance.now() + 2000 };
  }, { passive: true });
  document.addEventListener("keydown", () => input(), { passive: true });

  // Petting is a pointer-only extra.
  svg.addEventListener("click", (e) => { if (e.target.closest("#cat")) { input(); happy(); } });

  const still = () => { if (reduce.matches) renderStill(); };
  if (btn) {
    btn.addEventListener("pointerenter", (e) => { if (e.pointerType !== "touch") { S.hover = true; S.twitchT0 = performance.now(); still(); } });
    btn.addEventListener("pointerleave", () => { S.hover = false; still(); });
    btn.addEventListener("focus", () => { if (btn.matches(":focus-visible")) { S.focus = true; S.twitchT0 = performance.now(); still(); } });
    btn.addEventListener("blur", () => { S.focus = false; still(); });
    // touch has no hover, so the button's reaction starts on press
    btn.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") { S.pressExcite = true; S.twitchT0 = performance.now(); still(); } });
    const release = () => { if (S.pressExcite) setTimeout(() => { S.pressExcite = false; still(); }, 700); };
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    // the download is never delayed: no preventDefault, the reaction runs alongside it
    btn.addEventListener("click", happy);
  }

  // Device tilt, only where the browser allows it without a permission prompt.
  let tiltBase = null;
  function onTilt(e) {
    if (e.beta == null || e.gamma == null) return;
    if (!tiltBase) tiltBase = { b: e.beta, g: e.gamma };  // calibrate to how the phone is held
    const yaw = clamp((e.gamma - tiltBase.g) * 0.7, -12, 12), pitch = clamp(-(e.beta - tiltBase.b) * 0.7, -12, 12);
    if (!S.tilt) S.tilt = { yaw: 0, pitch: 0 };
    S.tilt.yaw += (yaw - S.tilt.yaw) * 0.06;
    S.tilt.pitch += (pitch - S.tilt.pitch) * 0.06;
  }
  const tiltOk = "DeviceOrientationEvent" in window && typeof window.DeviceOrientationEvent.requestPermission !== "function" && !finePointer.matches;
  const listenTilt = (on) => {
    if (!tiltOk) return;
    if (on && !reduce.matches) window.addEventListener("deviceorientation", onTilt, { passive: true });
    else window.removeEventListener("deviceorientation", onTilt);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { stop(); listenTilt(false); }
    else { listenTilt(true); start(); }
  });
  window.addEventListener("resize", measure, { passive: true });
  window.addEventListener("orientationchange", measure, { passive: true });
  if ("ResizeObserver" in window) new ResizeObserver(measure).observe(room);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  if (reduce.addEventListener) reduce.addEventListener("change", () => {
    if (reduce.matches) { stop(); listenTilt(false); renderStill(); } else { listenTilt(true); start(); }
  });

  // ---- arrival: logo placeholder until the room art is decoded, a 300 ms fade, one small hop ----
  function arrive() {
    if (S.started) return;
    S.started = true;
    measure();
    scene.style.transition = "opacity 300ms ease-out";
    scene.style.opacity = "1";
    const now = performance.now();
    S.nextBlink = now + rand(1800, 3200);
    S.nextFlick = now + rand(6000, 12000);
    S.lastInput = now;
    if (reduce.matches) { S.arrived = true; renderStill(); return; }
    listenTilt(true);
    S.hopT0 = now + 300;
    S.perkT0 = now + 860;             // ears perk as she settles...
    S.lookFrom = now + 1000;          // ...then she looks at the pointer, or the button
    setTimeout(() => { S.arrived = true; }, 300);
    start();
  }
  const shown = getComputedStyle(scene).opacity === "1";
  scene.style.opacity = shown ? "1" : "0";
  scene.style.animation = "none";
  if (!roomImg || (roomImg.complete && roomImg.naturalWidth)) arrive();
  else {
    const go = () => (roomImg.decode ? roomImg.decode().catch(() => {}) : Promise.resolve()).then(arrive);
    roomImg.addEventListener("load", go, { once: true });
    roomImg.addEventListener("error", arrive, { once: true });
  }
})();
