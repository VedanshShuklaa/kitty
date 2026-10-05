// Run with Playwright's browser_run_code_unsafe filename option, against preview.mjs.
// Uses only the isolated sample-data preview. No payment or account services run.
async (page) => {
  const failures = [];
  const errors = [];
  const results = [];
  const onError = e => errors.push(e.message);
  page.on('pageerror', onError);
  const base = 'http://127.0.0.1:4174/';
  const assert = (ok, message) => { if (!ok) failures.push(message); };
  const overflow = () => page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > innerWidth,
    text: [...document.querySelectorAll('[dir="auto"]')].filter(e => e.clientWidth && e.scrollWidth > e.clientWidth + 2).map(e => e.textContent),
  }));
  try {
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      for (const screen of ['Home', 'Me', 'MeetCat', 'Circle']) {
        await page.goto(`${base}?screen=${screen}`);
        await page.getByText('Test dollars on Monad testnet', { exact: true }).first().waitFor();
        if (screen === 'Me') await page.getByRole('button', { name: 'Pet Mimi', exact: true }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        const result = await overflow();
        results.push({ width, screen, ...result });
        assert(!result.horizontal && !result.text.length, `${screen} overflows at ${width}`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const stage of ['Away', 'Wary', 'Shy', 'Friendly', 'AtHome', 'Family']) {
      await page.goto(`${base}?screen=Me&stage=${stage}`);
      await page.getByRole('img', { name: /^Mimi:/ }).waitFor();
      assert((await page.getByRole('button', { name: 'Pet Mimi', exact: true }).count()) === (stage === 'Away' ? 0 : 1), `Pet availability at ${stage}`);
      if (stage === 'Away') {
        assert(await page.getByText(/You owe \$6/).count() === 1, 'Away must show debt');
        assert(await page.getByRole('button', { name: 'Pay back $6', exact: true }).count() > 0, 'Away must keep repayment available');
      }
      await page.screenshot({ path: `output/cat-ui/${stage.toLowerCase()}.png` });
    }
    await page.goto(`${base}?screen=Me`);
    await page.getByRole('button', { name: 'Pet Mimi', exact: true }).click();
    await page.getByText('A little purr, just for you. Her standing stays the same.').waitFor();
    assert(await page.getByRole('img', { name: /^Mimi: Friendly/ }).count() === 1, 'Petting changes no stage');
    await page.getByRole('button', { name: /How her trust changes/ }).click();
    await page.getByRole('button', { name: 'Explore Family', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Family explained' }).waitFor();
    assert(await page.getByRole('img', { name: /^Mimi: Friendly/ }).count() === 1, 'Guide must not change actual standing');
    await page.getByRole('checkbox', { name: /Show my cat/ }).click();
    assert(await page.getByRole('img', { name: /^Mimi:/ }).count() === 0, 'Hide cat removes portrait');
    assert(await page.getByRole('button', { name: 'Pet Mimi', exact: true }).count() === 0, 'Hide cat removes petting');
    assert(await page.getByText('After At home and Family', { exact: true }).count() === 1, 'Hide cat preserves real terms');
    for (const screen of ['Me', 'MeetCat']) {
      await page.goto(`${base}?screen=${screen}&standingError`);
      await page.getByText(/Couldn't (update your cat's standing|load your cat)/).waitFor();
      assert(await page.getByRole('img', { name: /^Mimi:|Your cat is/ }).count() === 0, 'Failed read must not invent a stage');
    }
    await page.goto(`${base}?screen=Home&offline`);
    await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
    assert(await page.getByText('—', { exact: true }).count() === 1, 'Offline balance stays unknown');
    // Browser-only stress test; not a substitute for native Dynamic Type.
    await page.setViewportSize({ width: 320, height: 568 });
    for (const screen of ['Home', 'Me', 'MeetCat']) {
      await page.goto(`${base}?screen=${screen}`);
      if (screen === 'Me') {
        await page.getByRole('button', { name: /How her trust changes/ }).click();
      }
      await page.evaluate(() => {
        document.querySelectorAll('[dir="auto"]').forEach(e => {
          const c = getComputedStyle(e);
          e.style.fontSize = `${parseFloat(c.fontSize) * 1.6}px`;
          if (c.lineHeight !== 'normal') e.style.lineHeight = `${parseFloat(c.lineHeight) * 1.6}px`;
        });
      });
      const result = await overflow();
      results.push({ width: 320, screen, textScale: 1.6, ...result });
      assert(!result.horizontal && !result.text.length, `${screen} overflows at large text`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}?screen=Me&stage=Shy`);
    await page.getByRole('button', { name: 'Pet Mimi', exact: true }).waitFor();
    return { failures, errors, results };
  } finally { page.off('pageerror', onError); }
}
