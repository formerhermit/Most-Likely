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

  /* The opening, as a timeline rather than five loose timeouts.

     Each caption gets a calm stretch after it has finished typing and
     before anything else moves — the typing is slow enough to read along
     with, so what a line needs is the quiet afterwards. The zoom counts as
     something else moving: once the room starts rushing in, nobody is
     reading.

     The last line waits for the zoom to land. It used to start 1.6s into a
     4.6s zoom and finish before the room arrived, which is why it felt
     rushed — it was competing with the biggest movement on screen. */
  const ZOOM_MS = 4600;          // must match .grid-rooms transition in the CSS
  const T_LINE2 = 4600;          // after line 1 has been typed and sat a beat
  const T_ZOOM = 8400;           // …and the same again for line 2
  const T_LINE3 = ZOOM_MS + T_ZOOM + 300;   // 300ms after the room lands
  const T_CAPTION_OUT = 18300;
  const T_SLATE = 19100;

  function opening() {
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
    }, T_LINE2);
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
    }, T_ZOOM);
    // the room has arrived; now it says what the player is (issue #14) —
    // the process, not a sentient machine and not themselves
    setTimeout(() => {
      typeText(caption, 'you are part of a language model in training. welcome, ' + State.nodeId + '.', 30);
    }, T_LINE3);
    setTimeout(() => {
      caption.classList.add('gone');
    }, T_CAPTION_OUT);
    /* The slate runs the last beat and starts Act 1 on its way out. The
       music changes with the slate rather than with the act: "The Last
       Atom" is 19.6s and doesn't loop, so waiting for Act 1 would leave
       the slate playing in silence. `playPhase` is a no-op once that track
       is current, so Pretrain.start()'s own call still covers entering the
       act any other way. */
    setTimeout(() => {
      Audio2.playPhase('era1');
      Cards.phase('pretrain', () => Pretrain.start(afterTraining));
    }, T_SLATE);
  }

  /* Act 1 finishes, the player is told what happened, then Act 2 starts. */
  function afterTraining() {
    Cards.show('afterTraining', () => QC.start(), Pretrain.report());
  }

  document.addEventListener('DOMContentLoaded', () => {
    // read at BEGIN rather than on change, so the checkbox is the setting
    // and nothing has to keep the two in step
    $('btn-begin').addEventListener('click', () => {
      State.relaxed = $('opt-relaxed').checked;
      begin();
    });
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
