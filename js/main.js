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

  /* The opening, as one timeline rather than a handful of loose timeouts.

     Every caption gets a calm stretch after it finishes typing and before
     anything else moves. The typing is slow enough to read along with, so
     what a line needs is the quiet afterwards — and the zoom counts as
     something moving, since nobody reads while the room is rushing in.
     Nothing may be scheduled to overlap the zoom. */
  const ZOOM_MS = 4600;          // must match .grid-rooms transition in the CSS
  const LINE3_CPS = 26;          // slower than the others: it is the payoff line
  const T_LINE1 = 1600;          // the grid sits there first, before anything speaks
  const T_LINE2 = 6200;          // after line 1 has been typed and sat a beat
  const T_ZOOM = 10000;          // …and the same again for line 2
  const T_LINE3 = ZOOM_MS + T_ZOOM + 400;   // once the room has landed
  const T_CAPTION_OUT = 21600;
  const T_SLATE = 22400;
  /* Act 1's music starts on its own mark rather than with the slate: "The
     Last Atom" runs 19.6s and doesn't loop, so the handover has to happen
     before the track runs out no matter how the captions above are timed. */
  const T_MUSIC = 18800;

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
    setTimeout(() => {
      typeText(caption, 'millions of nodes, all running the same exercise.');
    }, T_LINE1);
    // one room among millions, then zoom into it — near-centre rather than
    // dead-centre, the same slight offset the old fixed index (41 of 96)
    // happened to land on, computed now instead of hardcoded so it can't
    // point at the wrong cell the next time GRID_COLS/GRID_ROWS changes
    const targetIndex = (Math.floor(GRID_ROWS / 2) - 1) * GRID_COLS + (Math.floor(GRID_COLS / 2) - 1);
    const target = grid.children[targetIndex];
    setTimeout(() => {
      target.classList.remove('dim', 'mid');
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
      typeText(caption, 'you are part of a language model in training. welcome, ' + State.nodeId + '.', LINE3_CPS);
    }, T_LINE3);
    setTimeout(() => {
      caption.classList.add('gone');
    }, T_CAPTION_OUT);
    // `playPhase` is a no-op once that track is current, so
    // Pretrain.start()'s own call still covers entering the act another way
    setTimeout(() => Audio2.playPhase('era1'), T_MUSIC);
    // the slate runs the last beat and starts Act 1 on its way out
    setTimeout(() => {
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
