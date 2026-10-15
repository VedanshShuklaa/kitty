// Keeps the landing page on one screen. The CSS media queries guess what fits from the
// viewport; this measures. Shed order: the long proof line if it wraps, then (only while the
// page still overflows) the step descriptions, the explainer, and finally the long proof.
// Without this script the media-query guesses stand.
(() => {
  "use strict";
  const page = document.querySelector(".page");
  const copy = document.querySelector(".copy");
  const proof = document.querySelector(".proof .long");
  if (!page || !copy || !proof) return;
  const root = document.documentElement;
  const all = ["fit-proof", "fit-explain", "fit-detail"];

  // The span is a flex item, so it wraps inside its own box: compare height to one line.
  const wraps = () => {
    if (proof.offsetParent === null) return false;
    return proof.getBoundingClientRect().height > parseFloat(getComputedStyle(proof).lineHeight) * 1.5;
  };
  const over = () => copy.scrollHeight > copy.clientHeight + 1 || root.scrollHeight > window.innerHeight + 1;

  // Cheapest loss first: step descriptions go before the explainer (dropping the explainer
  // alone leaves a hole above the steps on desktop), the long proof line last.
  const tries = [[], ["fit-detail"], ["fit-explain"], ["fit-explain", "fit-detail"], ["fit-explain", "fit-detail", "fit-proof"]];

  function fit() {
    page.classList.remove(...all);
    const short = wraps();
    for (const t of tries) {
      page.classList.remove(...all);
      page.classList.add(...t);
      if (short) page.classList.add("fit-proof");
      if (!over()) return;
    }
  }

  let queued = 0;
  const schedule = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; fit(); }); };
  fit();
  window.addEventListener("resize", schedule, { passive: true });
  if (document.fonts) document.fonts.ready.then(schedule);
})();
