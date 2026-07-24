/* MOST LIKELY — session state
   The association table is the whole game. Weights only rise; repeats are
   blocked, never re-counted. Nothing persists, nothing is sent anywhere. */

'use strict';

const State = {
  nodeId: '',
  associations: {},        // { objectId: { boxId: weight } }
  toastShown: {},          // objectId -> true once the 5-box nudge fired
  qcAttempts: 0,
  era2: {
    results: [],           // { n, trainable, correct, picked, unnoticed }
    strikes: 0,
    unnoticedN: null,      // message number of the unnoticed hallucination
    newspaperRead: false,
    peakAccuracy: 0
  }
};

function resetState() {
  State.nodeId = 'NODE-' + String(Math.floor(1e6 + Math.random() * 9e6));
  State.associations = {};
  State.toastShown = {};
  State.qcAttempts = 0;
  State.era2 = { results: [], strikes: 0, unnoticedN: null, newspaperRead: false, peakAccuracy: 0 };
}

/* Returns 'placed' or 'blocked'. Weights never decrease; a repeat of an
   existing pair is blocked outright. */
function addAssociation(objId, boxId) {
  const row = State.associations[objId] || (State.associations[objId] = {});
  if (row[boxId]) return 'blocked';
  row[boxId] = 1;
  return 'placed';
}

function associationCount(objId) {
  return Object.keys(State.associations[objId] || {}).length;
}

function boxesFor(objId) {
  return State.associations[objId] || {};
}

/* All objects currently associated with a given box label (for the
   cross-round persistence display). */
function objectsInBox(boxId) {
  const out = [];
  for (const [obj, row] of Object.entries(State.associations)) {
    if (row[boxId]) out.push(obj);
  }
  return out;
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

function seqText(emojis) {
  return emojis.join(' → ');
}
