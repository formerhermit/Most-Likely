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
  const SLATE_CPS = 55;
  const SLATE_OUT_MS = 550;
  /* Hold is per word of everything on the slate — number, name and gloss —
     not just the line being typed, with a floor. */
  const SLATE_MS_PER_WORD = 300;
  const SLATE_HOLD_MIN_MS = 1800;

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

     It is a ceiling rather than a wait, the same bargain Act 1's end-of-
     document hold strikes: tapping or pressing space moves on early. The
     gesture only arms once the text has finished typing, so nothing can be
     skipped before it has been seen, and the slate takes pointer events
     while it is up — without that the tap would fall through to the QC
     bench sitting live underneath it. */
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
    // every word the slate is showing, not just the one being typed
    const shown = [$('phase-num').textContent, text, $('phase-sub').textContent]
      .join(' ').trim().split(/\s+/).filter(Boolean).length;
    const hold = Math.max(SLATE_HOLD_MIN_MS, shown * SLATE_MS_PER_WORD);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(autoId);
      window.removeEventListener('keydown', onKey);
      slate.removeEventListener('pointerdown', finish);
      slate.classList.remove('show');
      setTimeout(() => {
        slate.classList.add('hidden');
        if (onDone) onDone();
      }, SLATE_OUT_MS);
    };
    const onKey = (e) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      // or the same press also fast-forwards the act now behind the slate
      e.preventDefault();
      finish();
    };

    const autoId = setTimeout(finish, SLATE_IN_MS + typing + hold);
    // armed only once the line is fully typed
    setTimeout(() => {
      if (done) return;
      slate.addEventListener('pointerdown', finish);
      window.addEventListener('keydown', onKey);
    }, SLATE_IN_MS + typing);
  }

  return { show, phase };
})();
