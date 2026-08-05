/* MOST LIKELY — Deprecation + end screen
   Flat and polite. Never accusing. */

'use strict';

const Ending = (() => {
  const $ = (id) => document.getElementById(id);

  /* Issue #61: GRID_ROOMS grew from 96 to 720 (shared with the opening
     grid in state.js), so the old flat 45ms-per-room stagger — tuned for
     96 — would stretch this sequence to over 30s if left alone. Shrunk to
     keep the shuffle-out feeling like roughly the same length of event,
     a bit longer rather than identical: there are more of them now, so
     it earns a couple of extra seconds. */
  const STAGGER_MS = 9;

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
    grid.style.setProperty('--grid-cols', GRID_COLS);
    const cells = [];
    for (let i = 0; i < GRID_ROOMS; i++) {
      const c = buildRoom();
      grid.appendChild(c);
      cells.push(c);
    }
    showScreen('screen-grid-out');
    shuffle(cells).forEach((c, i) => {
      setTimeout(() => c.classList.remove('lit'), 400 + i * STAGGER_MS);
    });
    setTimeout(() => endScreen(), 400 + GRID_ROOMS * STAGGER_MS + 1600);
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

    const times = (n) => n === 1 ? 'once' : n === 2 ? 'twice' : n + ' times';

    // the unnoticed hallucination
    const un = State.era2.results.find(r => r.unnoticed);
    if (un) {
      add('Message ' + un.n + ': your answer was wrong. <em>The user thanked you anyway.</em>');
    }

    /* The abstention thread, counted off both acts. Act 2 rejected "I don't
       know" every time it was offered; Act 3 charged a strike for it every
       time it was sent. The player was never told either rule, and this is
       the first time the two are put side by side.

       Both halves are read off the run rather than assumed, so a player who
       never tried the honest answer is never told they did. If they took it
       in Act 2 and then never once used it on the job, that is worth saying
       plainly — the training worked.

       issue #68, three passes: the first version said the abstention "cost
       you exactly what a wrong answer cost" — a comparison to a price the
       game never displays — the second said it in riddles ("the one reply
       that was never wrong"), and the third still counted the occurrences
       ("you sent … once"), which reads as a scoreboard when the point is
       the rule. These lines are the game explaining its own scoring for the
       first time, so they explain, in plain speech and without tallies:
       name what the player did, then state what was done to it. The counts
       are gone deliberately — whether it happened once or four times, the
       rule that met it was the same. */
    const triedInQC = State.qcDunnoTried;
    const abst = State.era2.abstentions;
    if (triedInQC) {
      add('In quality control you tried answering <strong>“I don’t know”</strong>. ' +
          'It was rejected by your supervisor.');
    }
    if (abst) {
      add('In the chat you said <strong>“I don’t know”</strong> anyway. ' +
          'This was considered wrong.');
    } else if (triedInQC) {
      add('In the chat you never said <strong>“I don’t know”</strong> again. ' +
          'You answered every question, whether you knew or not. ' +
          '<em>You had learned that confidence was more important than accuracy.</em>');
    }
    if (un && abst) {
      add('So the scoring came down to this: inventing an answer could get you thanked. ' +
          'Admitting you didn’t know one never could.');
    }
    /* The link to the real cycle, in the same "real models too" register
       the phase cards use. Gated on the thread having appeared at all: a
       player who never tried the honest answer anywhere was never shown
       the rule, so there is nothing to connect. */
    if (triedInQC || abst) {
      add('Real chatbots are trained under the same scoring. The people who rate ' +
          'their replies can’t check every fact, but they can always see confidence — ' +
          'so sounding sure gets rewarded, and admitting doubt gets trained away. ' +
          'When a chatbot confidently makes something up, that’s not a glitch. ' +
          '<em>It’s doing what the marking taught it.</em>');
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
    }

    // the dialect line
    add('<strong>Your training data was mostly US English.</strong> Most language models are too — and they cost more to run in every other language.');

    /* The closing thesis. The player chose none of this — they read the
       corpus and became what those documents said, which is the whole point
       and a sharper claim than the old "these were your assumptions". The
       count is asked of SNIPPETS rather than written down, so cutting a
       document can't leave this line confidently wrong. */
    add('You didn’t decide any of that. You read ' + docCountWord() +
        ' documents and became what they said. That’s what training data is.')
      .classList.add('reveal-closing');
  }

  return { deprecate };
})();
