(() => {
  const scenes = window.KITTY_TIMELINE;
  const duration = scenes.at(-1).end;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let time = 0, playing = false, previous = 0, current = -1;
  const clock = n => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  const mascot = (label) => `<div class="mascot"><img src="../assets/kitty-logo.png" alt=""><span class="floating-word">${label}</span></div>`;
  const visual = (kind) => {
    if (kind === 'intro') return mascot('Your circle starts here');
    if (kind === 'end') return mascot('Save with people you trust');
    if (kind === 'cat') return `<div class="mascot"><img src="../assets/kitty-logo.png" alt=""><span class="cat-label">Your standing, explained</span></div>`;
    if (kind === 'rules') return `<div class="rules-board"><p class="board-title">Friday Circle</p><div class="board-row"><span>People</span><strong>3 friends</strong></div><div class="board-row"><span>Contribution</span><strong>$5 / round</strong></div><div class="board-row"><span>Before joining</span><strong>Read the terms</strong></div><p class="board-foot">Illustration · deposits are separate</p></div>`;
    if (kind === 'pool') return `<div class="money-diagram"><div class="person p1"><b>$5</b><span>Host</span></div><div class="person p2"><b>$5</b><span>Friend A</span></div><div class="person p3"><b>$5</b><span>Friend B</span></div><div class="pot"><strong>$15</strong><span>gross pot</span></div><i class="token" data-token="0">$5</i><i class="token" data-token="1">$5</i><i class="token" data-token="2">$5</i></div>`;
    if (kind === 'turns') return `<div class="turn-list">${['Host','Friend A','Friend B'].map((n,i)=>`<div class="turn" data-turn="${i}"><span class="turn-number">${i+1}</span><div>${n}<small>Recipient in round ${i+1}</small></div></div>`).join('')}<p class="board-foot">Illustrative order · no offers in this example</p></div>`;
    if (kind === 'record') return `<div class="record-board"><p class="board-title">Round 1 record</p>${['Host','Friend A','Friend B'].map(n=>`<div class="board-row"><span>${n}</span><strong>$5</strong><span class="board-tag">Paid</span></div>`).join('')}<p class="board-foot">Sample record · no transaction was sent</p></div>`;
    return `<div class="terms-board"><p><strong>Before joining</strong>Know the deposit and payout rules.</p><p><strong>If a payment is missed</strong>Coverage depends on available funds.</p><p><strong>If you make an offer</strong>Getting the pot sooner has a cost.</p></div>`;
  };
  const buttons = scenes.map((s,i) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = `${clock(s.start)} ${s.title}`;
    b.onclick = () => {pause(); window.setKittyTime(s.start);}; $('chapters').append(b); return b;
  });
  window.setKittyTime = (seconds) => {
    time = Math.min(duration, Math.max(0, Number(seconds) || 0));
    const index = scenes.findIndex(s => time < s.end);
    const i = index < 0 ? scenes.length - 1 : index, scene = scenes[i];
    if (current !== i) {
      current = i; $('chapter-label').textContent = scene.title; $('headline').textContent = scene.headline;
      $('deck').textContent = scene.deck; $('caption').textContent = scene.caption; $('visual').innerHTML = visual(scene.kind);
      buttons.forEach((b,n)=>b.setAttribute('aria-pressed',String(i===n)));
    }
    const elapsed = time - scene.start;
    const enter = reduced ? 1 : Math.min(1, elapsed / .6);
    const ease = 1 - (1-enter)**3;
    $('visual').style.transform = `translateY(${(1-ease)*16}px)`;
    $('visual').style.opacity = .3 + ease * .7;
    document.querySelectorAll('[data-turn]').forEach((el,n)=>el.classList.toggle('active',n===Math.min(2,Math.floor(elapsed/4))));
    document.querySelectorAll('[data-token]').forEach((el,n)=>{
      const starts = [[14,18],[81,18],[48,81]], end = [48,49];
      const p = reduced ? .6 : Math.max(0,Math.min(1,(elapsed - n*.65 - .8)/2.2));
      el.style.left = `${starts[n][0]+(end[0]-starts[n][0])*p}%`;
      el.style.top = `${starts[n][1]+(end[1]-starts[n][1])*p}%`;
      el.style.opacity = p>=1 ? 0 : 1;
    });
    $('scrub').value = time; $('time').textContent = `${clock(time)} / ${clock(duration)}`;
    $('progress-bar').style.width = `${time/duration*100}%`;
    return {time,scene:i,title:scene.title};
  };
  function pause(){playing=false; $('play').textContent='Play'; $('play').setAttribute('aria-pressed','false');}
  function tick(now){if(!playing)return;const delta=(now-previous)/1000;previous=now;window.setKittyTime(time+delta);if(time>=duration)pause();else requestAnimationFrame(tick);}
  $('play').onclick=()=>{if(playing){pause();return;}if(time>=duration)window.setKittyTime(0);playing=true;previous=performance.now();$('play').textContent='Pause';$('play').setAttribute('aria-pressed','true');requestAnimationFrame(tick);};
  $('scrub').oninput=e=>{pause();window.setKittyTime(e.target.value);};
  $('format').onchange=e=>$('stage').classList.toggle('tall',e.target.value==='tall');
  if(params.has('render'))document.body.classList.add('render');
  const format=params.get('format') || (innerWidth<600?'tall':'wide');$('format').value=format;$('stage').classList.toggle('tall',format==='tall');
  if(reduced)$('motion-note').textContent='Reduced motion is on. Playback changes chapters without moving the illustrations. You can also review still frames with the slider.';
  window.setKittyTime(params.get('t') || 0);
  window.kittyReady=Promise.all([document.fonts.ready,...Array.from(document.images,im=>im.decode().catch(()=>{}))]).then(()=>true);
})();
