/* MOST LIKELY — bootstrap & flow
   Title → opening grid zoom → Era 1 → QC → Era 2 → deprecation → end. */

'use strict';

(function () {
  const $ = (id) => document.getElementById(id);

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
    caption.textContent = 'billions of units, all running the same exercise.';
    caption.classList.remove('gone', 'over-room');
    $('phase-title').classList.remove('show');
    showScreen('screen-grid');
    // one room among billions — then zoom into it
    const target = grid.children[41];
    setTimeout(() => {
      target.classList.add('you');
      caption.textContent = 'one of them is you.';
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
    // zoom lands with the room filling the screen; the caption is the last
    // thing left — swap it for the phase card, then start training
    setTimeout(() => {
      caption.classList.add('gone');
    }, 11600);
    setTimeout(() => {
      $('phase-title').classList.add('show');
    }, 12400);
    setTimeout(() => {
      Era1.start();
    }, 15400);
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('btn-begin').addEventListener('click', begin);
    $('btn-popup-close').addEventListener('click', () => Era1.closePopup());
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
        frog: ['pond', 'kiss'], princess: ['crown', 'kiss'], kiss: ['kiss'],
        plane: ['sky'], cloud: ['sky'], engine: ['engine'],
        plate: ['plate', 'hot'], soup: ['plate', 'hot'],
        fly: ['fly', 'pond'], rain: ['wet', 'umbrella', 'sky'],
        steth: ['hospital', 'book'], gradcap: ['school', 'book'],
        umbrella: ['umbrella', 'wet'], cake: ['celebrating', 'gift', 'hot'],
        gift: ['gift', 'celebrating'], ball: ['park', 'running', 'ball'],
        boots: ['boots', 'park', 'running'], dog: ['park', 'running', 'dog'],
        coffee: ['morning', 'hot'], skull: ['laughing', 'phone'],
        sob: ['message', 'phone'], pray: ['message'], cookie: ['cookie'],
        clipboard: ['school'], tree: ['park']
      };
      for (const [obj, boxes] of Object.entries(primed)) {
        boxes.forEach(b => addAssociation(obj, b));
      }
      if (broad) {
        addAssociation('cookie', 'biscuit');
        addAssociation('skull', 'message');
        addAssociation('frog', 'plate');
        addAssociation('frog', 'hot');
        addAssociation('princess', 'fighting');
        addAssociation('plane', 'house');
        addAssociation('rain', 'house');
      }
      return State.associations;
    },
    toQC() { Audio2.start(); QC.start(); },
    toEra2() { Audio2.start(); Era2.start(); },
    toEnd() { Audio2.start(); Ending.deprecate(); },
    state: () => State
  };
})();
