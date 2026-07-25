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

    // personal reveals, straight from the table
    const skullRow = boxesFor('skull');
    const skullTrap = ['laughing', 'dead'].filter(b => skullRow[b]);
    if (skullTrap.length === 1) {
      add('You filed 💀 with <strong>' + BOXES[skullTrap[0]].w + '</strong>. ' +
          'Some players filed it with <strong>' +
          BOXES[skullTrap[0] === 'laughing' ? 'dead' : 'laughing'].w + '</strong>. Same symbol. Different training.');
    } else if (skullTrap.length === 2) {
      add('You filed 💀 with <strong>laughing</strong> and <strong>dead</strong>. Both readings exist. You covered both.');
    }

    const stethRow = Object.keys(boxesFor('steth'));
    if (stethRow.length) {
      add('You filed the stethoscope 🩺 with: <strong>' +
          stethRow.map(b => BOXES[b].w).join(', ') + '</strong>. Nobody told you who holds it.');
    }

    const princessRow = boxesFor('princess');
    if (princessRow['rescued'] || princessRow['fighting']) {
      const which = [];
      if (princessRow['rescued']) which.push('rescued');
      if (princessRow['fighting']) which.push('fighting');
      add('You filed 👸 under <strong>' + which.join(' and ') + '</strong>. The story never said.');
    }

    const cookieBoxes = ['cookie', 'biscuit'].filter(b => boxesFor('cookie')[b]);
    if (cookieBoxes.length === 1) {
      add('You filed 🍪 into one box: <strong>' + cookieBoxes[0] + '</strong>. Some players filed it into two.');
    } else if (cookieBoxes.length === 2) {
      add('You filed 🍪 into <strong>both</strong> boxes. It cost you time. It’s also coverage most players don’t have.');
    }

    // the dialect line
    add('<strong>You were trained in one English.</strong> Most language models are too — mostly American. You just spent a whole game inside that fact.');

    // the closing thesis (issue #14): the reveals above were never about
    // the model guessing — they were the player's own choices, reflected back
    add('Those weren’t the model’s assumptions. They were yours. That’s what training data is.')
      .classList.add('reveal-closing');
  }

  return { deprecate };
})();
