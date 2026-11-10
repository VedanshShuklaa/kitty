// Playwright browser_run_code_unsafe filename entry (or any runner that passes a page).
// Checks the restyled flow screens against the mocked preview: layout at phone,
// tablet and enlarged text, touch targets, and the main interactions. Nothing here
// talks to a network; every financial action is inert in the preview.
async (page) => {
  const base = 'http://127.0.0.1:4174/';
  const failures = [];
  const errors = [];
  const layouts = [];
  const assert = (ok, message) => { if (!ok) failures.push(message); };
  const onError = e => errors.push(e.message);
  page.on('pageerror', onError);
  const load = async (query) => {
    await page.goto(`${base}?${query}`);
    await page.waitForTimeout(700);
  };
  const measure = () => page.evaluate(() => {
    const out = { overflow: document.documentElement.scrollWidth - innerWidth, small: [] };
    for (const el of document.querySelectorAll('[role=button],[role=radio],[role=checkbox],[role=link],[role=tab],button')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height && (r.height < 47.5 || r.width < 47.5)) out.small.push(`${el.getAttribute('aria-label') || el.textContent.slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
  const screens = ['Create', 'Join', 'Bid', 'Paste', 'MeetCat', 'Send', 'Receive&links&cashOut', 'Scan', 'Scan&cameraOff', 'Scan&camera', 'Claim', 'Claim&collected'];
  try {
    for (const [w, h] of [[320, 640], [390, 844], [768, 1024]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const s of screens) {
        await load(`screen=${s}`);
        const m = await measure();
        layouts.push({ s, w, ...m });
        assert(m.overflow <= 0, `${s} @${w}: horizontal overflow ${m.overflow}px`);
        assert(m.small.length === 0, `${s} @${w}: small targets ${m.small.join(', ')}`);
      }
    }
    // enlarged text on a short phone: nothing pushes past the screen edge
    await page.setViewportSize({ width: 320, height: 568 });
    for (const s of screens) {
      await page.goto(`${base}?screen=${s}`);
      await page.addStyleTag({ content: '#root [dir=auto]{font-size:160% !important;line-height:1.35 !important}' });
      await page.waitForTimeout(500);
      const m = await measure();
      layouts.push({ s, w: '320x568@1.6', ...m });
      assert(m.overflow <= 0, `${s} large text: horizontal overflow ${m.overflow}px`);
    }
    await page.setViewportSize({ width: 390, height: 844 });

    // Create: disabled until named; filling names enables it; summary follows the amount
    await load('screen=Create');
    const create = page.getByRole('button', { name: 'Create circle' });
    assert(await create.getAttribute('aria-disabled') === 'true', 'Create: enabled before the form is valid');
    await page.getByLabel('Name your circle').fill('Book Club');
    await page.getByLabel('Person 2', { exact: true }).fill('Ama');
    await page.getByLabel('Person 3', { exact: true }).fill('Kofi');
    assert(await create.getAttribute('aria-disabled') !== 'true', 'Create: still disabled with a valid form');
    await page.getByRole('radio', { name: '$20' }).click();
    assert(await page.getByText('$60', { exact: true }).count() > 0, 'Create: summary pot did not follow the amount');
    await page.getByRole('button', { name: 'Remove person 3' }).click();
    assert(await page.getByLabel('Person 3', { exact: true }).count() === 0, 'Create: remove person did nothing');

    // Paste: a wrong link explains itself and the notice closes
    await load('screen=Paste');
    await page.getByLabel('Link', { exact: true }).fill('hello');
    await page.getByRole('button', { name: 'Continue' }).click();
    const wrong = page.getByText("That doesn't look like a Kitty link", { exact: false });
    assert(await wrong.count() === 1, 'Paste: no error for a wrong link');
    await page.getByRole('button', { name: 'Close this message' }).click();
    assert(await wrong.count() === 0, 'Paste: notice did not close');

    // Join: terms and the order before the money
    await load('screen=Join');
    for (const t of ['Your terms', 'Paid in this order', 'Before you join', 'Each round', 'Deposit to join']) {
      assert(await page.getByText(t, { exact: true }).count() > 0, `Join: missing "${t}"`);
    }
    assert(await page.getByRole('button', { name: /Join and put down \$/ }).count() === 1, 'Join: no join action');

    // Bid: "more" changes the offer
    await load('screen=Bid');
    const offer = () => page.getByText(/^Give up \$/).first().textContent();
    const before = await offer();
    await page.getByRole('button', { name: 'Give up more' }).click();
    assert(await offer() !== before, 'Bid: "Give up more" did not change the offer');

    // Send: pick a person, the action names amount and person, then change
    await load('screen=Send');
    await page.getByRole('button', { name: /Friend A/ }).click();
    assert(await page.getByRole('button', { name: 'Change' }).count() === 1, 'Send: picking a person did not select them');
    await page.getByLabel('Amount', { exact: true }).fill('5');
    assert(await page.getByRole('button', { name: /^Send \$5(\.00)? to Friend A$/ }).count() === 1, 'Send: action does not name amount and person');
    await page.getByRole('button', { name: 'Change' }).click();
    assert(await page.getByRole('button', { name: 'Scan a Kitty code' }).count() === 1, 'Send: change did not return to the list');

    // Receive: each uncollected link has its own take-back action
    await load('screen=Receive&links');
    assert(await page.getByRole('button', { name: 'Take it back' }).count() === 2, 'Receive: uncollected links missing');

    // Scan: permission states
    await load('screen=Scan');
    assert(await page.getByRole('button', { name: 'Use the camera' }).count() === 1, 'Scan: no camera request');
    await load('screen=Scan&cameraOff');
    assert(await page.getByText('Camera access is off', { exact: false }).count() === 1, 'Scan: blocked camera not explained');

    // Claim: collect, then the receipt; an emptied link says so
    await load('screen=Claim');
    await page.getByRole('button', { name: /Collect \$/ }).click();
    await page.waitForTimeout(300);
    assert(await page.getByText(/Collected from/).count() === 1, 'Claim: no receipt after collecting');
    await load('screen=Claim&collected');
    assert(await page.getByText('already been collected', { exact: false }).count() === 1, 'Claim: collected link not explained');

    return { failures, errors, layouts };
  } finally {
    page.off('pageerror', onError);
  }
}
