/* MOST LIKELY — bootstrap & flow
   Title → opening grid zoom → Era 1 → QC → Era 2 → deprecation → end. */

'use strict';

(function () {
  const $ = (id) => document.getElementById(id);

  /* typewriter: types text into a node letter by letter; safe to call
     again on the same node (cancels the previous run) */
  function typeText(node, text, cps = 34) {
    if (node.__typeTimer) clearInterval(node.__typeTimer);
    node.textContent = '';
    node.classList.add('typing');
    let i = 0;
    node.__typeTimer = setInterval(() => {
      i++;
      node.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(node.__typeTimer);
        node.__typeTimer = null;
        node.classList.remove('typing');
      }
    }, Math.round(1000 / cps));
  }

  function begin() {
    resetState();
    document.querySelectorAll('.node-id').forEach(n => n.textContent = State.nodeId);
    Audio2.start();
    opening();
  }

  function opening() {
    const grid = $('grid-rooms');
    grid.innerHTML = '';
    grid.style.transform = '';
    for (let i = 0; i < 96; i++) grid.appendChild(el('div', 'room lit'));
    const caption = $('grid-caption');
    caption.classList.remove('gone', 'over-room');
    const phase = $('phase-title');
    phase.classList.remove('show');
    phase.textContent = '';
    showScreen('screen-grid');
    typeText(caption, 'millions of nodes, all running the same exercise.');
    // one room among millions — then zoom into it
    const target = grid.children[41];
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
    setTimeout(() => {
      phase.classList.add('show');
      typeText(phase, 'PHASE 1: PRE-TRAINING', 22);
    }, 14400);
    setTimeout(() => {
      // Act 1 is the predict loop (js/pretrain.js). The old drag-to-file
      // Era 1 is still in the build for comparison — ML_DEBUG.toOldEra1().
      Pretrain.start(() => QC.start());
    }, 17400);
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('btn-begin').addEventListener('click', begin);
    $('btn-popup-close').addEventListener('click', () => Era1.closePopup());
    $('era1-review').addEventListener('click', () => Era1.reviewSnippet());
    $('era1-skip').addEventListener('click', () => Era1.skip());
    $('pt-skip').addEventListener('click', () => Pretrain.skip());
    $('era2-send').addEventListener('click', () => Era2.send());
    $('qc-field-q').addEventListener('click', () => QC.drop('q'));
    $('qc-field-a').addEventListener('click', () => QC.drop('a'));
    $('btn-replay').addEventListener('click', () => location.reload());

    const mute = $('btn-mute');
    mute.addEventListener('click', () => {
      Audio2.setMuted(!Audio2.isMuted());
      mute.textContent = Audio2.isMuted() ? '🔇' : '🔊';
    });

    showScreen('screen-title');
  });

  /* ---- debug helpers (console only; not part of the game) ---- */
  window.ML_DEBUG = {
    autoTrain(broad = false) {
      resetState();
      document.querySelectorAll('.node-id').forEach(n => n.textContent = State.nodeId);
      // file every primed association, the way an attentive player would
      const primed = {
        frog: ['pond', 'kiss', 'fly'], princess: ['crown', 'kiss'],
        lilypad: ['pond', 'wet'],
        plane: ['sky', 'engine'], cloud: ['sky'],
        captain: ['morning', 'sky'],
        plate: ['hot'], soup: ['bowl', 'hot'],
        rain: ['wet', 'umbrella', 'sky'],
        steth: ['hospital', 'book'], gradcap: ['school', 'book'],
        cake: ['celebrating', 'gift', 'hot'],
        party: ['celebrating', 'house', 'balloon'],
        ball: ['park', 'running'],
        boots: ['park', 'running'], dog: ['park', 'running', 'boots'],
        coffee: ['morning', 'hot'], skull: ['laughing', 'phone'],
        sob: ['message', 'phone'], pray: ['message', 'thanks'],
        clipboard: ['school'], tree: ['park']
      };
      for (const [obj, boxes] of Object.entries(primed)) {
        boxes.forEach(b => addAssociation(obj, b));
      }
      if (broad) {
        addAssociation('skull', 'message');
        addAssociation('pray', 'praying');
        addAssociation('frog', 'plate');
        addAssociation('frog', 'hot');
        addAssociation('princess', 'fighting');
        addAssociation('plane', 'house');
        addAssociation('rain', 'house');
      }
      return State.associations;
    },
    // Act 1 — what BEGIN now runs; here too for jumping straight in
    toPretrain() { Audio2.start(); resetState(); Pretrain.start(() => QC.start()); },
    // the old drag-to-file Era 1, kept playable for comparison
    toOldEra1() { Audio2.start(); resetState(); Era1.start(); },
    ptModel() { return Pretrain.model(); },
    toQC() { Audio2.start(); QC.start(); },
    toEra2() { Audio2.start(); Era2.start(); },
    toEnd() { Audio2.start(); Ending.deprecate(); },
    state: () => State
  };
})();
