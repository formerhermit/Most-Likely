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
      if (onDone) onDone();
    };
  }

  return { show };
})();
