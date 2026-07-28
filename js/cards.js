/* MOST LIKELY — phase cards

   A plain-language note before and after each act, so the player knows what
   they are doing and what just happened. One card sits between each pair of
   acts and does both jobs at once, which reads better than two in a row.

   Copy lives in PHASE_CARDS (js/data.js). It is deliberately jargon-free:
   no tokens, no weights, no inference. */

'use strict';

const Cards = (() => {
  const $ = (id) => document.getElementById(id);

  function show(key, onDone) {
    const card = PHASE_CARDS[key];
    if (!card) { if (onDone) onDone(); return; }

    $('phase-card-title').textContent = card.title;
    const body = $('phase-card-body');
    body.innerHTML = '';
    card.body.forEach(line => body.appendChild(el('p', '', line)));

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
