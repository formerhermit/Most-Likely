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
    for (let i = 0; i < 96; i++) grid.appendChild(el('div', 'room lit'));
    showScreen('screen-grid');
    // one room among billions — then zoom into it
    const target = grid.children[41];
    setTimeout(() => {
      target.classList.add('you');
      $('grid-caption').textContent = 'one of them is you.';
    }, 3400);
    setTimeout(() => {
      grid.classList.add('zooming');
    }, 6600);
    setTimeout(() => {
      grid.classList.remove('zooming');
      Era1.start();
    }, 10400);
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
