/* MOST LIKELY — phase cards

   A plain-language note before and after each act, so the player knows what
   they are doing and what just happened. One card sits between each pair of
   acts and does both jobs at once, which reads better than two in a row.

   Copy lives in PHASE_CARDS (js/data.js). It is deliberately jargon-free:
   no tokens, no weights, no inference. */

'use strict';

const Cards = (() => {
  const $ = (id) => document.getElementById(id);

  /* `extra` is an optional element dropped in after the copy — the training
     report at the end of Act 1 is the only user, and it lives here rather
     than in PHASE_CARDS because it is numbers off the run, not prose. */
  function show(key, onDone, extra) {
    const card = PHASE_CARDS[key];
    if (!card) { if (onDone) onDone(); return; }

    $('phase-card-title').textContent = card.title;
    const body = $('phase-card-body');
    body.innerHTML = '';
    // {DOCS} is the corpus size, spelled out — see docCountWord() in state.js
    card.body.forEach(line =>
      body.appendChild(el('p', '', line.replace(/\{DOCS\}/g, docCountWord()))));
    if (extra) body.appendChild(extra);

    const btn = $('phase-card-btn');
    btn.textContent = card.button;
    const wrap = $('phase-card');
    wrap.classList.remove('hidden');

    btn.onclick = () => {
      wrap.classList.add('hidden');
      btn.onclick = null;
      // the card's last line gets the screen to itself before the next
      // stage begins — see `handoff` in PHASE_CARDS
      if (card.handoff) handoff(card.handoff, onDone);
      else if (onDone) onDone();
    };
  }

  /* The stage slate (issue #69). Fades a wash over whatever is on screen,
     types a line, holds, and fades back out — `onDone` runs at the far
     side, so callers read as "slate, then the stage". */
  const SLATE_IN_MS = 550;
  const SLATE_CPS = 45;
  const SLATE_HOLD_MS = 1250;

  /* The handoff line, on the same slate the stage titles use but without
     the number or the gloss — one sentence, sentence case, in the reading
     face rather than the mono one, so it doesn't read as a second title. */
  function handoff(text, onDone) {
    $('phase-slate').classList.add('plain');
    $('phase-num').textContent = '';
    $('phase-sub').textContent = '';
    runSlate(text, () => {
      $('phase-slate').classList.remove('plain');
      if (onDone) onDone();
    });
  }

  function phase(key, onDone) {
    const t = PHASE_TITLES[key];
    if (!t) { if (onDone) onDone(); return; }

    $('phase-slate').classList.remove('plain');
    $('phase-num').textContent = 'PHASE ' + t.n;
    $('phase-sub').textContent = t.sub || '';
    runSlate(t.name, onDone);
  }

  /* Fade the slate in, type `text` into it, hold, fade out, then `onDone`.
     The hold is measured from the text's own length: the shortest thing
     this shows is INFERENCE and the longest is four times that, and one
     fixed duration leaves the short one loitering or cuts the long one off
     mid-word. */
  function runSlate(text, onDone) {
    const slate = $('phase-slate');
    $('phase-title').textContent = '';
    slate.classList.remove('hidden');
    /* Force a reflow so the opacity transition has a start value to travel
       from, then add the class synchronously. requestAnimationFrame would
       read better here and was what this did first, but a backgrounded tab
       never runs one: the slate stayed invisible while its timers carried
       on, so switching away during a phase change meant the stage title
       simply never appeared. Same reason the flying tag in pretrain.js
       backs `transitionend` with a timer. */
    void slate.offsetWidth;
    slate.classList.add('show');

    setTimeout(() => typeText($('phase-title'), text, SLATE_CPS), SLATE_IN_MS);

    const typing = (text.length / SLATE_CPS) * 1000;
    setTimeout(() => {
      slate.classList.remove('show');
      setTimeout(() => {
        slate.classList.add('hidden');
        if (onDone) onDone();
      }, 550);
    }, SLATE_IN_MS + typing + SLATE_HOLD_MS);
  }

  return { show, phase };
})();
