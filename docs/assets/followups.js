'use strict';

// Keep the actual post text in HTML so it remains readable without JavaScript.
document.querySelectorAll('.post-copy[data-copy-label]').forEach((post) => {
  const text = post.textContent.trim();
  const isTemplate = post.hasAttribute('data-template');
  const row = document.createElement('div');
  row.className = 'post-tools';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = isTemplate ? 'Copy template' : 'Copy post';
  button.setAttribute('aria-label', `Copy ${post.dataset.copyLabel}`);
  const count = document.createElement('span');
  count.className = 'small';
  count.textContent = isTemplate
    ? 'Fill in real observations before posting'
    : `${Array.from(text).length} / 280 characters before URL shortening`;
  const status = document.createElement('span');
  status.className = 'copy-status';
  status.setAttribute('role', 'status');

  button.addEventListener('click', async () => {
    let timer;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Clipboard timed out')), 1200);
        }),
      ]);
      status.textContent = 'Copied';
    } catch {
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(post);
        selection.removeAllRanges();
        selection.addRange(range);
        status.textContent = 'Text selected. Press Ctrl+C or Command+C.';
      } else {
        status.textContent = 'Select the post text and copy it manually.';
      }
    } finally {
      clearTimeout(timer);
    }
  });

  row.append(button, count, status);
  post.after(row);
});
