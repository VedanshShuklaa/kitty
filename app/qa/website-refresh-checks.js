// Playwright browser_run_code_unsafe filename entry. Local mocked screens only.
async (page) => {
  const base = 'http://127.0.0.1:4174/';
  const captureScreenshots = !new URL(page.url()).searchParams.has('checksOnly');
  const failures = [];
  const errors = [];
  const layouts = [];
  const captures = [];
  const assert = (ok, message) => { if (!ok) failures.push(message); };
  const onError = e => errors.push(e.message);
  page.on('pageerror', onError);
  const load = async (screen, flags = '') => {
    await page.goto(`${base}?screen=${screen}${flags}`);
    await page.getByText('Test dollars on Monad testnet', { exact: true }).first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    if (screen === 'Home' && !flags.includes('offline')) await page.getByRole('heading', { name: /^Your circles/ }).waitFor();
    if (screen === 'Circle' && !flags.includes('offline')) await page.getByRole('heading', { name: 'Friday Circle', exact: true }).waitFor();
    if (screen === 'Me' && !flags.includes('standingError') && !flags.includes('offline')) await page.getByRole('heading', { name: 'What this means for you', exact: true }).waitFor();
  };
  const layout = async (label) => {
    const result = await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth > innerWidth + 1,
      text: [...document.querySelectorAll('[dir="auto"]')].filter(e => e.clientWidth && e.scrollWidth > e.clientWidth + 2).map(e => e.textContent),
      smallTargets: [...document.querySelectorAll('[role="button"],[role="tab"],[role="radio"],[role="checkbox"]')].filter(e => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.width < 47 || r.height < 47);
      }).map(e => e.getAttribute('aria-label') || e.textContent),
    }));
    layouts.push({ label, ...result });
    assert(!result.horizontal && !result.text.length, `${label}: overflowing content ${result.text.join(', ')}`);
    assert(!result.smallTargets.length, `${label}: undersized controls ${result.smallTargets.join(', ')}`);
  };
  const capture = async name => {
    if (!captureScreenshots) return;
    const path = `.impeccable/review/${name}.png`;
    await page.screenshot({ path, fullPage: true });
    captures.push(path);
  };
  try {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      for (const screen of ['Welcome', 'Home', 'Circle', 'Me']) {
        await load(screen);
        await layout(`${screen}-${width}`);
        await capture(`${screen.toLowerCase()}-${width}`);
      }
    }
    await page.setViewportSize({ width: 320, height: 568 });
    for (const screen of ['Welcome', 'Home', 'Circle', 'Me']) {
      await load(screen, '&longName');
      await page.evaluate(() => document.querySelectorAll('[dir="auto"]').forEach(e => {
        const css = getComputedStyle(e);
        e.style.fontSize = `${parseFloat(css.fontSize) * 1.6}px`;
        if (css.lineHeight !== 'normal') e.style.lineHeight = `${parseFloat(css.lineHeight) * 1.6}px`;
      }));
      await layout(`${screen}-320-short-large-text-long-name`);
      await capture(`${screen.toLowerCase()}-large-text`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await load('Welcome');
    const create = page.getByRole('button', { name: 'Create my account', exact: true });
    assert(await create.isDisabled(), 'Welcome: empty form must be disabled');
    await page.getByRole('textbox', { name: 'What should your circle call you?' }).fill('Alex');
    assert(await create.isDisabled(), 'Welcome: adult confirmation is required');
    await page.getByRole('checkbox', { name: "I'm 18 or older" }).click();
    assert(await create.isEnabled(), 'Welcome: completed form enables account creation');
    await page.getByRole('radio', { name: 'Kenya', exact: true }).click();
    await page.getByRole('radio', { name: 'Kenya', exact: true, checked: true }).waitFor();
    await load('Welcome', '&returning');
    assert(await page.getByRole('button', { name: 'Unlock', exact: true }).count() === 1, 'Returning account unlock');
    assert(await page.getByRole('textbox').count() === 0, 'Returning account avoids new-account form');
    await capture('welcome-returning');

    await load('Home');
    await page.getByRole('button', { name: /^Open Friday Circle/ }).click();
    await page.getByRole('button', { name: 'Pay $10', exact: true }).waitFor();
    const status = await page.getByRole('heading', { name: '3 of 5 have paid', exact: true }).boundingBox();
    assert(status && status.y < 650, 'Circle payment status appears before scenery');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('tab', { name: 'Account', exact: true }).click();
    await page.getByRole('heading', { name: 'Account', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Home', exact: true }).click();
    await page.getByRole('heading', { name: 'Hello, Host.', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Join circle', exact: true }).click();
    await page.getByRole('textbox').first().waitFor();

    await load('Home', '&empty');
    assert(await page.getByText('Your first circle starts here', { exact: true }).count() === 1, 'Empty home guidance');
    await capture('home-empty');
    await load('Home', '&offline');
    await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
    assert(await page.getByText('—', { exact: true }).count() === 1, 'Failed balance stays unknown');
    await capture('home-offline');
    for (const state of ['forming', 'completed', 'cancelled']) {
      await load('Circle', `&state=${state}`);
      await layout(`Circle-${state}`);
      assert(await page.getByRole('button', { name: 'Pay $10', exact: true }).count() === 0, `${state}: no round payment`);
      await capture(`circle-${state}`);
    }
    for (const stage of ['Away', 'Wary', 'Shy', 'Friendly', 'AtHome', 'Family']) {
      await load('Me', `&stage=${stage}`);
      assert(await page.getByRole('button', { name: 'Pet Mimi', exact: true }).count() === (stage === 'Away' ? 0 : 1), `${stage}: pet availability`);
      if (stage === 'Away') {
        assert(await page.getByText(/You owe \$6/).count() === 1, 'Away: debt remains explicit');
        assert(await page.getByRole('button', { name: 'Pay back $6', exact: true }).count() === 1, 'Away: repayment remains available');
      }
      await layout(`Account-${stage}`);
    }
    await load('Me');
    await page.getByRole('button', { name: 'Pet Mimi', exact: true }).click();
    await page.getByText('A little purr, just for you. Her standing stays the same.').waitFor();
    assert(await page.getByRole('img', { name: /^Mimi: Friendly/ }).count() === 1, 'Petting changes no standing');
    await page.getByRole('button', { name: /How her trust changes/ }).click();
    await page.getByRole('button', { name: 'Explore Family', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Family explained', exact: true }).waitFor();
    await page.getByRole('checkbox', { name: 'Show my cat', exact: true }).click();
    assert(await page.getByRole('img', { name: /^Mimi:/ }).count() === 0, 'Hidden cat removes artwork');
    assert(await page.getByRole('heading', { name: 'What this means for you', exact: true }).count() === 1, 'Hidden cat preserves terms');
    await capture('account-hidden-cat');
    await load('Me', '&standingError');
    await page.getByRole('button', { name: 'Refresh standing', exact: true }).waitFor();
    assert(await page.getByRole('img', { name: /^Mimi:/ }).count() === 0, 'Failed standing does not invent a cat');
    await capture('account-standing-error');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await load('Welcome');
    assert(await page.getByRole('img', { name: /^Kitty, a pink cat/ }).count() === 1, 'Brand scene available with reduced motion');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    return { failures, errors, layouts, captures };
  } catch (error) {
    failures.push(String(error));
    return { failures, errors, layouts, captures };
  } finally {
    page.off('pageerror', onError);
  }
}
