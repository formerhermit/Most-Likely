/* MOST LIKELY — bootstrap & flow
   Title → opening grid zoom → Era 1 → QC → Era 2 → deprecation → end. */

'use strict';

(function () {
  const $ = (id) => document.getElementById(id);

  // typeText lives in state.js — the phase slate types too, from cards.js

  function begin() {
    resetState();
    document.querySelectorAll('.node-id').forEach(n => n.textContent = State.nodeId);
    Audio2.start();
    opening();
  }

  function opening() {
    // "The Last Atom" runs 19.7s; the phase change at 17.4s crossfades out
    // of it, so it lands almost exactly on the end of the track
    Audio2.playPhase('intro');
    const grid = $('grid-rooms');
    grid.innerHTML = '';
    grid.style.transform = '';
    grid.style.setProperty('--grid-cols', GRID_COLS);
    for (let i = 0; i < GRID_ROOMS; i++) grid.appendChild(buildRoom());
    const caption = $('grid-caption');
    caption.classList.remove('gone', 'over-room');
    showScreen('screen-grid');
    typeText(caption, 'millions of nodes, all running the same exercise.');
    // one room among millions, then zoom into it — near-centre rather than
    // dead-centre, the same slight offset the old fixed index (41 of 96)
    // happened to land on, computed now instead of hardcoded so it can't
    // point at the wrong cell the next time GRID_COLS/GRID_ROWS changes
    const targetIndex = (Math.floor(GRID_ROWS / 2) - 1) * GRID_COLS + (Math.floor(GRID_COLS / 2) - 1);
    const target = grid.children[targetIndex];
    setTimeout(() => {
      target.classList.add('you');
      typeText(caption, 'one of them is you.');
    }, 3400);
    setTimeout(() => {
      // zoom keeps the target room dead center: scale about the room's
      // own center, then translate that point to the viewport center
      const g = grid.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      const tx = t.left + t.width / 2, ty = t.top + t.height / 2;
      grid.style.transformOrigin = (tx - g.left) + 'px ' + (ty - g.top) + 'px';
      const scale = Math.max(window.innerWidth / t.width, window.innerHeight / t.height) * 1.15;
      grid.style.transform =
        'translate(' + (window.innerWidth / 2 - tx) + 'px,' +
        (window.innerHeight / 2 - ty) + 'px) scale(' + scale + ')';
      caption.classList.add('over-room');
    }, 6600);
    // mid-zoom: name the mechanism directly — the player is the process,
    // not a sentient machine and not themselves (issue #14)
    setTimeout(() => {
      typeText(caption, 'you are part of a language model in training. welcome, ' + State.nodeId + '.', 30);
    }, 8200);
    // zoom lands with the room filling the screen; the caption is the last
    // thing left — swap it for the phase card, then start training
    setTimeout(() => {
      caption.classList.add('gone');
    }, 13600);
    /* The slate now runs the last beat of the opening and starts Act 1 on
       its way out, instead of the title and the act being two timers that
       happened to be 3s apart. "The Last Atom" runs 19.7s; the slate lands
       at 14.4s and hands over around 17.5s, so the crossfade still leaves
       the track close to its own ending. */
    setTimeout(() => {
      Cards.phase('pretrain', () => Pretrain.start(afterTraining));
    }, 14400);
  }

  /* Act 1 finishes, the player is told what happened, then Act 2 starts. */
  function afterTraining() {
    Cards.show('afterTraining', () => QC.start(), Pretrain.report());
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('btn-begin').addEventListener('click', begin);
    $('pt-skip').addEventListener('click', () => Pretrain.skip());
    // fast-forward the reveal: tap the document card, or space on desktop.
    // fastForward() guards itself (only acts mid-reveal), so a click while
    // a blank is open, or on another screen entirely, is a no-op — and the
    // keypress is only swallowed when it actually did something, so space
    // still activates a focused button everywhere else.
    document.querySelector('.pt-stage').addEventListener('click', () => Pretrain.fastForward());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && Pretrain.fastForward()) e.preventDefault();
    });
    $('era2-send').addEventListener('click', () => Era2.send());
    $('qc-field-q').addEventListener('click', () => QC.drop('q'));
    $('qc-field-a').addEventListener('click', () => QC.drop('a'));
    $('btn-replay').addEventListener('click', () => location.reload());

    /* Music and effects toggle separately (issue #70). The glyph stays put
       and `aria-pressed` carries the state, which the stylesheet dims on
       and a screen reader announces. */
    const toggle = (id, isMuted, setMuted, label) => {
      const btn = $(id);
      btn.addEventListener('click', () => {
        setMuted(!isMuted());
        const on = !isMuted();
        btn.setAttribute('aria-pressed', String(on));
        btn.title = label + (on ? '' : ' (off)');
      });
    };
    toggle('btn-music', Audio2.isMusicMuted, Audio2.setMusicMuted, 'music');
    toggle('btn-sfx', Audio2.isSfxMuted, Audio2.setSfxMuted, 'sound effects');

    showScreen('screen-title');
  });

  /* ---- debug helpers (console only; not part of the game) ---- */
  window.ML_DEBUG = {
    toPretrain() { Audio2.start(); resetState(); Pretrain.start(afterTraining); },
    ptModel() { return Pretrain.model(); },
    toQC() { Audio2.start(); QC.start(); },
    toEra2() { Audio2.start(); Era2.start(); },
    toEnd() { Audio2.start(); Ending.deprecate(); },
    state: () => State
  };
})();
