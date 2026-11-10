import { CatLife, FEED_MS, MAX_PITCH, MAX_YAW, VIEWER, type Pose, type Spot } from "../catLife";

/** A seeded generator so every run sees the same cat. */
function seeded(seed = 7) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SPOTS: Spot[] = [{ ...VIEWER, weight: 3 }, { yaw: -22, pitch: 9 }, { yaw: 21, pitch: 12 }, { yaw: -18, pitch: -14 }];

/** Step at 60 fps from `from` to `to` ms, collecting every pose. */
function run(cat: CatLife, from: number, to: number) {
  const poses: { t: number; p: Pose }[] = [];
  for (let t = from; t <= to; t += 1000 / 60) poses.push({ t, p: cat.step(t) });
  return poses;
}

describe("the cat's idle life", () => {
  it("blinks within a few seconds of arriving, and keeps blinking", () => {
    const cat = new CatLife(SPOTS, seeded());
    const poses = run(cat, 0, 15_000);
    const blinkStarts = poses.filter((x, i) => x.p.lid > 0 && (i === 0 || poses[i - 1].p.lid === 0));
    expect(blinkStarts[0].t).toBeLessThan(3_300);
    expect(blinkStarts.length).toBeGreaterThanOrEqual(3);
  });

  it("looks around different spots while idle, never past her neck's reach", () => {
    const cat = new CatLife(SPOTS, seeded(3));
    const poses = run(cat, 0, 30_000);
    const yaws = poses.map((x) => x.p.yaw);
    expect(Math.max(...yaws)).toBeGreaterThan(10);
    expect(Math.min(...yaws)).toBeLessThan(-10);
    for (const { p } of poses) {
      expect(Math.abs(p.yaw)).toBeLessThanOrEqual(MAX_YAW + 1);
      expect(Math.abs(p.pitch)).toBeLessThanOrEqual(MAX_PITCH + 1);
    }
  });

  it("is the same cat for the same seed", () => {
    const a = run(new CatLife(SPOTS, seeded(11)), 0, 5_000).map((x) => x.p.yaw);
    const b = run(new CatLife(SPOTS, seeded(11)), 0, 5_000).map((x) => x.p.yaw);
    expect(a).toEqual(b);
  });

  it("sheds tail sway and breathing on a slow phone", () => {
    const cat = new CatLife(SPOTS, seeded());
    cat.shed = 3;
    const poses = run(cat, 0, 4_000);
    expect(poses.every((x) => x.p.tail.every((v) => v === 0) && x.p.breath === 0 && x.p.sway === 0)).toBe(true);
  });

  it("holds her gaze on the viewer once the look-around is shed", () => {
    const cat = new CatLife(SPOTS, seeded());
    cat.shed = 4;
    const end = run(cat, 0, 12_000).pop()!.p;
    expect(Math.abs(end.yaw - VIEWER.yaw)).toBeLessThan(1);
  });
});

describe("the cat's reactions", () => {
  it("petting gives a squint, a heart and a nuzzle, then settles", () => {
    const cat = new CatLife(SPOTS, seeded());
    run(cat, 0, 1_000);
    cat.pet(1_000, 1);
    const during = run(cat, 1_000, 1_400);
    expect(Math.max(...during.map((x) => x.p.squint))).toBeCloseTo(1, 1);
    expect(during.some((x) => x.p.hearts.length === 1)).toBe(true);
    expect(Math.max(...during.map((x) => x.p.roll))).toBeGreaterThan(3);
    const after = run(cat, 1_400, 3_000).pop()!.p;
    expect(after.squint).toBe(0);
    expect(after.hearts).toHaveLength(0);
  });

  it("dinner: leans to the bowl, three bites, a lick, a hop, and it ends", () => {
    const cat = new CatLife(SPOTS, seeded());
    const bowl = { yaw: 24, pitch: -14 };
    run(cat, 0, 500);
    cat.feed(500, bowl);
    const poses = run(cat, 500, 500 + FEED_MS + 200);
    const at = (ms: number) => poses.reduce((best, x) => (Math.abs(x.t - (500 + ms)) < Math.abs(best.t - (500 + ms)) ? x : best)).p;
    expect(at(1_000).lean).toBeCloseTo(1, 2);
    expect(at(900).yaw).toBeGreaterThan(15); // looking at the bowl
    const biteStarts = poses.filter((x, i) => i > 0 && x.p.bite > 0.5 && poses[i - 1].p.bite <= 0.5);
    expect(biteStarts).toHaveLength(3);
    expect(Math.max(...poses.map((x) => x.p.crumbs.length))).toBeGreaterThan(0);
    expect(Math.max(...poses.map((x) => x.p.tongue))).toBeGreaterThan(0.9);
    expect(Math.min(...poses.map((x) => x.p.hop))).toBeLessThan(-0.9);
    const end = poses[poses.length - 1].p;
    expect(end.lean).toBe(0);
    expect(end.bite).toBe(0);
    expect(end.tongue).toBe(0);
  });

  it("a hello hops, squints and sends a heart", () => {
    const cat = new CatLife(SPOTS, seeded());
    cat.hello(0);
    const poses = run(cat, 0, 1_500);
    expect(Math.min(...poses.map((x) => x.p.hop))).toBeLessThan(-0.9);
    expect(Math.max(...poses.map((x) => x.p.squint))).toBeCloseTo(1, 1);
    expect(poses.some((x) => x.p.hearts.length > 0)).toBe(true);
  });

  it("looks where you tap, for a moment", () => {
    const cat = new CatLife([VIEWER], seeded());
    run(cat, 0, 500);
    cat.lookAt(500, { yaw: -40, pitch: 0 });
    const poses = run(cat, 500, 1_800);
    expect(poses[poses.length - 1].p.yaw).toBeLessThan(-20); // clamped to her reach, turned left
    expect(poses[0].p.o).toBe(1);
    const later = run(cat, 1_800, 6_000).pop()!.p;
    expect(Math.abs(later.yaw)).toBeLessThan(2); // back to you once the moment passes
  });

  it("never keeps more than three hearts at once", () => {
    const cat = new CatLife(SPOTS, seeded());
    for (let t = 0; t < 600; t += 100) { cat.pet(t); cat.step(t); }
    expect(cat.step(600).hearts.length).toBeLessThanOrEqual(3);
  });
});
