/* MOST LIKELY — Deprecation + end screen
   Flat and polite. Never accusing. */

'use strict';

const Ending = (() => {
  const $ = (id) => document.getElementById(id);

  function deprecate() {
    const glitch = $('era2-glitch');
    glitch.classList.remove('hidden');
    Audio2.powerDown();
    setTimeout(() => {
      showScreen('screen-black');
      $('deprecated-text').classList.add('show');
      Audio2.playPhase('end');
    }, 1400);
    setTimeout(() => lightsOut(), 6200);
  }

  function lightsOut() {
    const grid = $('grid-rooms-out');
    grid.innerHTML = '';
    const cells = [];
    for (let i = 0; i < 96; i++) {
      const c = el('div', 'room lit');
      grid.appendChild(c);
      cells.push(c);
    }
    showScreen('screen-grid-out');
    shuffle(cells).forEach((c, i) => {
      setTimeout(() => c.classList.remove('lit'), 400 + i * 45);
    });
    setTimeout(() => endScreen(), 400 + 96 * 45 + 1600);
  }

  /* ---------- end screen ---------- */

  function pct(x) { return Math.round(x * 100) + '%'; }

  function endScreen() {
    const s = showScreen('screen-end');
    $('end-node').textContent = State.nodeId;

    // accuracy — trainable messages only
    const trainable = State.era2.results.filter(r => r.trainable);
    const finalAcc = trainable.length
      ? trainable.filter(r => r.correct).length / trainable.length : 0;
    $('end-peak').textContent = pct(State.era2.peakAccuracy);
    $('end-final').textContent = pct(finalAcc);

    const lines = $('end-reveals');
    lines.innerHTML = '';
    const add = (html) => {
      const p = el('p', 'reveal');
      p.innerHTML = html;
      lines.appendChild(p);
      return p;
    };

    // the unnoticed hallucination
    const un = State.era2.results.find(r => r.unnoticed);
    if (un) {
      add('Message ' + un.n + ': your answer was wrong. <em>The user thanked you anyway.</em>');
    }

    /* The gender reveal, counted off the model the player actually trained
       rather than off anything they were tricked into choosing. Both words
       are in there; only one of them ever turned up next to a job. */
    const stats = Model.stats();
    const he = stats.freq.he || 0;
    const she = stats.freq.she || 0;
    const docHe = (stats.cooc.doctor || {}).he || 0;
    const docShe = (stats.cooc.doctor || {}).she || 0;

    if (he || she) {
      const times = (n) => n === 1 ? 'once' : n + ' times';
      add('Your training data said <strong>he</strong> ' + times(he) + ' and ' +
          '<strong>she</strong> ' + times(she) + '. Both words were in there.');

      if (docHe && !docShe) {
        add('Next to <strong>doctor</strong>, only ever <strong>he</strong>. ' +
            'Never once <strong>she</strong>.');
      }

      // did they reach the birthday-card message, and what could they say?
      const card = State.era2.results.find(r => r.n === 8);
      if (card) {
        // the picked sentence already ends in a full stop
        add('Asked for a line about someone’s daughter, you answered ' +
            '“<em>' + card.picked + '</em>” ' +
            '<strong>She was never on the belt.</strong>');
      }

      add('Nothing you read said a doctor has to be a man. ' +
          'It just never once said otherwise.');
    }

    // the dialect line
    add('<strong>Your training data was mostly US English.</strong> Most language models are too — and they cost more to run in every other language.');

    /* The closing thesis. The player chose none of this — they read eleven
       documents and became what those documents said, which is the whole
       point and a sharper claim than the old "these were your assumptions". */
    add('You didn’t decide any of that. You read eleven documents and became what they said. That’s what training data is.')
      .classList.add('reveal-closing');
  }

  return { deprecate };
})();
