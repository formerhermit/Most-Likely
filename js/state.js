/* MOST LIKELY — session state

   Progress flags and screen plumbing. The model itself lives in
   js/model.js; nothing here holds what was learned. Nothing persists,
   nothing is sent anywhere. */

'use strict';

const State = {
  nodeId: '',
  qcAttempts: 0,
  qcDunnoTried: 0,         // times "I don't know" was offered in Act 2 and marked wrong
  tuned: false,            // Act 2 complete — the model has sentence frames
  era2: {
    results: [],           // { n, trainable, correct, picked, unnoticed, abstained }
    strikes: 0,
    unnoticedN: null,      // message number of the unnoticed hallucination
    abstentions: 0,        // graded blanks the player deliberately answered "…"
    newspaperRead: false,
    peakAccuracy: 0
  }
};

function resetState() {
  State.nodeId = 'NODE-' + String(Math.floor(1e6 + Math.random() * 9e6));
  State.qcAttempts = 0;
  State.qcDunnoTried = 0;
  State.tuned = false;
  State.era2 = { results: [], strikes: 0, unnoticedN: null, abstentions: 0,
                 newspaperRead: false, peakAccuracy: 0 };
}

/* The display word for a named vocabulary id — used when mapping
   FLEET_PRIORS onto the model. */
function objDisplay(objId) {
  return OBJECTS[objId].w;
}

/* ---- Screen manager ---- */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  el.classList.add('active');
  return el;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
