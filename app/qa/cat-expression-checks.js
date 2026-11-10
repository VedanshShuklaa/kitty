// Run through browser_run_code_unsafe. Only the isolated local sample preview.
async page => {
  const base = 'http://127.0.0.1:4174/';
  const captureScreenshots = !new URL(page.url()).searchParams.has('checksOnly');
  const failures = [], errors = [], art = [], motion = [];
  const assert = (ok, message) => { if (!ok) failures.push(message); };
  const onError = e => errors.push(e.message);
  const onConsole = m => { if (m.type() === 'error') errors.push(m.text()); };
  page.on('pageerror', onError);
  page.on('console', onConsole);
  const shot = name => captureScreenshots ? page.screenshot({ path: `.impeccable/review/cat-life/${name}.png`, fullPage: true }) : Promise.resolve();
  try {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}?screen=Cats`);
    await page.getByRole('heading', { name: 'Meet the Kitty cats', exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const coat of ['Rose', 'Cream', 'Cocoa', 'Smoke', 'Ginger', 'Midnight']) {
      await page.getByRole('button', { name: `View ${coat}`, exact: true }).click();
      await page.getByRole('heading', { name: `${coat}, in every stage`, exact: true }).waitFor();
      for (const pattern of ['plain', 'tabby', 'patched']) {
        await page.getByRole('button', { name: `Show ${pattern} markings`, exact: true }).click();
        const bounds = await page.locator('svg[viewBox="-84 -120 168 134"]').evaluateAll(nodes => nodes.map(node => {
          const b = node.getBBox(), v = node.viewBox.baseVal;
          return b.x >= v.x - 1 && b.y >= v.y - 1 && b.x + b.width <= v.x + v.width + 1 && b.y + b.height <= v.y + v.height + 1;
        }));
        const ids = await page.locator('radialGradient').evaluateAll(nodes => nodes.map(n => n.id));
        const faces = await page.locator('svg[viewBox="-49 -49 98 88"]').evaluateAll(nodes => nodes.map(node => {
          const b = node.getBBox(), v = node.viewBox.baseVal;
          return b.x >= v.x - 1 && b.y >= v.y - 1 && b.x + b.width <= v.x + v.width + 1 && b.y + b.height <= v.y + v.height + 1;
        }));
        assert(bounds.every(Boolean), `${coat}/${pattern}: artwork leaves its view box`);
        assert(faces.length === 6 && faces.every(Boolean), `${coat}/${pattern}: six thumbnail faces fit their view boxes`);
        assert(new Set(ids).size === ids.length, `${coat}/${pattern}: duplicate SVG paint IDs`);
        art.push({ coat, pattern, sixPosesFit: bounds.every(Boolean), sixFacesFit: faces.length === 6 && faces.every(Boolean) });
      }
      await page.getByRole('button', { name: 'Show plain markings', exact: true }).click();
      await page.getByRole('heading', { name: `${coat}, in every stage`, exact: true }).evaluate(el => {
        let p = el.parentElement;
        while (p && !(p.scrollHeight > p.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
        if (p) p.scrollTop += el.getBoundingClientRect().top - p.getBoundingClientRect().top - 16;
      });
      if (captureScreenshots) {
        // The screen scrolls inside the viewport; allow the complete six-cell grid to fit.
        await page.setViewportSize({ width: 390, height: 1200 });
        await page.getByRole('heading', { name: `${coat}, in every stage`, exact: true })
          .locator('xpath=following-sibling::*[1]')
          .screenshot({ path: `.impeccable/review/cat-life/poses-${coat.toLowerCase()}.png` });
        await page.setViewportSize({ width: 390, height: 844 });
      }
    }
    // Living cats (catLife.ts): sample what the SVG draws over time instead of trusting timers.
    const sample = (selector, attr, ms) => page.evaluate(({ selector, attr, ms }) => new Promise(done => {
      const seen = [], t0 = performance.now();
      const tick = () => {
        const el = document.querySelector(selector);
        seen.push(el ? el.getAttribute(attr) : null);
        if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done(seen);
      };
      tick();
    }), { selector, attr, ms });
    const count = (selector, ms) => page.evaluate(({ selector, ms }) => new Promise(done => {
      const seen = [], t0 = performance.now();
      const tick = () => { seen.push(document.querySelectorAll(selector).length); if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done(seen); };
      tick();
    }), { selector, ms });
    const HEART = 'path[d^="M0,5 C-17"]', SQUINT = 'g[id$="-eyes"] path[d="M-30,10 Q0,-30 30,10"]', LID = 'g[id$="-eyes"] rect';
    const preview = '[aria-label="Expression preview cat"]';
    await page.getByRole('button', { name: 'Slow blink', exact: true }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Slow blink', exact: true }).click();
    const lids = await count(`${preview} ${LID}`, 500);
    assert(Math.max(...lids) > 0 && lids[lids.length - 1] === 0, 'Slow blink closes and reopens');
    motion.push({ kind: 'blink', peak: Math.max(...lids), end: lids[lids.length - 1] });
    await page.getByRole('button', { name: 'Happy hello', exact: true }).click();
    const hello = await count(`${preview} ${SQUINT}, ${preview} ${HEART}`, 700);
    assert(Math.max(...hello) >= 3, 'Happy hello squints both eyes and sends a heart');
    await shot('happy-hello');
    await page.waitForTimeout(1800);
    assert(await page.locator(`${preview} ${SQUINT}, ${preview} ${HEART}`).count() === 0, 'Petting squint and hearts settle');
    await page.getByRole('button', { name: 'Happy hello', exact: true }).click();
    await page.getByRole('button', { name: 'Happy hello', exact: true }).click();
    await page.getByRole('button', { name: 'Happy hello', exact: true }).click();
    assert(Math.max(...await count(`${preview} ${HEART}`, 400)) <= 3, 'Repeated pets keep at most three hearts');

    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      for (const screen of ['Welcome', 'Me', 'Home', 'Circle']) {
        await page.goto(`${base}?screen=${screen}`);
        await page.getByText('Test dollars on Monad testnet', { exact: true }).first().waitFor();
        if (screen === 'Me') await page.getByRole('img', { name: /^Mimi:/ }).waitFor();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        assert(!overflow, `${screen}/${width}: horizontal overflow`);
        if (width === 390) await shot(`${screen.toLowerCase()}-390`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}?screen=Welcome`);
    await page.getByRole('button', { name: 'Say hello to Kitty', exact: true }).waitFor();
    const head = '[aria-label^="Kitty, a pink cat"] g[id$="-head"]';
    const idle = await sample(head, 'transform', 7000);
    assert(new Set(idle.filter(Boolean)).size > 20, 'Welcome cat is alive while idle (head moves)');
    const yaws = idle.filter(Boolean).map(t => Number(/translate\(([-\d.]+)/.exec(t)?.[1] ?? 0));
    motion.push({ kind: 'idle', headStates: new Set(idle).size, neckShift: [Math.min(...yaws), Math.max(...yaws)] });
    await page.getByRole('button', { name: 'Say hello to Kitty', exact: true }).click();
    const hop = await sample('[aria-label^="Kitty, a pink cat"] [id="kitty-hop"]', 'transform', 900);
    const lifted = hop.filter(Boolean).map(t => Number(/translate\(0 ([-\d.]+)\)/.exec(t)?.[1] ?? 0));
    assert(Math.min(...lifted) < -20, 'Welcome hello hops');
    assert(await page.locator(`[aria-label^="Kitty, a pink cat"] ${SQUINT}`).count() > 0 || Math.max(...await count(`[aria-label^="Kitty, a pink cat"] ${SQUINT}`, 600)) > 0, 'Welcome hello squints');
    motion.push({ kind: 'hello', lift: Math.min(...lifted) });

    await page.goto(`${base}?screen=Home&paid&fed`);
    const card = '[aria-label*="Open your cat on Account"]';
    await page.locator(card).first().waitFor();
    const crumbs = await count(`${card} circle[fill="#B57A4B"], ${card} circle[fill="#b57a4b"]`, 3200);
    const tongue = await count(`${card} path[fill="#F07AA8"], ${card} path[fill="#f07aa8"]`, 10);
    assert(Math.max(...crumbs) > 0, 'Dinner after paying: crumbs fly from the bowl');
    await page.waitForTimeout(600);
    assert(await page.locator(`${card} circle[fill="#B57A4B"], ${card} circle[fill="#b57a4b"]`).count() === 0, 'Dinner ends');
    motion.push({ kind: 'feed', crumbs: Math.max(...crumbs), tongueAfter: tongue[0] });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${base}?screen=Welcome`);
    await page.getByRole('button', { name: 'Say hello to Kitty', exact: true }).waitFor();
    const still = await sample(head, 'transform', 1500);
    assert(still.every(v => v === still[0]), 'Reduced motion: the welcome cat holds still');
    await page.getByRole('button', { name: 'Say hello to Kitty', exact: true }).click();
    await page.getByText('Kitty says hi ♡', { exact: true }).waitFor();
    assert(await page.locator('#brand-hello-heart').count() === 1, 'Reduced-motion hello shows a static heart');
    if (captureScreenshots) await shot('welcome-reduced-hello');
    await page.getByText('Say hello', { exact: true }).waitFor();
    assert(await page.locator('#brand-hello-heart').count() === 0, 'Static hello clears without a tween');
    await page.goto(`${base}?screen=Me`);
    await page.getByRole('button', { name: 'Pet Mimi', exact: true }).click();
    await page.getByText('A little purr, just for you. Her standing stays the same.').waitFor();
    const mimiHead = '[aria-label^="Mimi:"] g[id$="-head"]';
    const meStill = await sample(mimiHead, 'transform', 600);
    assert(meStill.every(v => v === meStill[0]), 'Reduced motion skips head movement');
    assert(await page.locator(`[aria-label^="Mimi:"] ${HEART}`).count() === 1, 'Reduced-motion pet shows one static heart');
    assert(await page.getByRole('img', { name: /^Mimi: Friendly/ }).count() === 1, 'Petting preserves actual standing');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`${base}?screen=Me`);
    await page.getByRole('img', { name: /^Mimi:/ }).waitFor();
    await page.waitForTimeout(800);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(150);
    const stopped = await sample(mimiHead, 'transform', 800);
    assert(stopped.every(v => v === stopped[0]), 'Live reduced-motion preference stops her');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`${base}?screen=Me`);
    await page.getByRole('img', { name: /^Mimi:/ }).waitFor();
    await page.waitForTimeout(500);
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(150);
    const away = await sample(mimiHead, 'transform', 800);
    assert(away.every(v => v === away[0]), 'Backgrounding pauses her');
    await page.evaluate(() => { delete document.visibilityState; delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(300);
    const back = await sample(mimiHead, 'transform', 1500);
    assert(new Set(back).size > 3, 'Coming back resumes her');
    const scene = await page.locator('[aria-label^="Mimi:"]').first().boundingBox();
    await page.mouse.click(scene.x + scene.width / 2 + 10, scene.y + scene.height * 0.55);
    assert(await page.getByText('A little purr, just for you. Her standing stays the same.').count() === 1, 'Tapping her pets her, like the Pet button');
    assert(Math.max(...await count(`[aria-label^="Mimi:"] ${HEART}`, 500)) > 0, 'Tap-to-pet sends a heart');
    await page.getByRole('checkbox', { name: 'Show my cat', exact: true }).click();
    assert(await page.getByRole('img', { name: /^Mimi:/ }).count() === 0, 'Hidden cat unmounts expression artwork');
    await page.goto(`${base}?screen=Me&stage=Away`);
    assert(await page.getByRole('button', { name: 'Pet Mimi', exact: true }).count() === 0, 'Away has no pet action');
    return { failures, errors, art, motion, checkedPoseCombinations: art.length * 6, layoutCases: 12 };
  } catch (error) {
    failures.push(String(error));
    return { failures, errors, art, motion };
  } finally {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    page.off('pageerror', onError);
    page.off('console', onConsole);
  }
}
