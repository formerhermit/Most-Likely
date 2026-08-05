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

/* ---- Clocks and the tab being hidden (issue #56) ----

   Both act clocks are deadlines measured against performance.now(), which
   keeps running while the tab is in the background. Switching tabs used to
   cost the player whatever they were on: Act 1's document expired, or Act 3's
   request went out as "…" and took a strike, for reasons entirely outside the
   fiction. Browsers also throttle the timers that would have advanced the
   reveal, so how much was lost depended on how hard the browser throttled —
   inconsistent as well as unkind.

   Each act registers a pair. `pause` banks the moment and stops its interval,
   so nothing expires while nobody is watching; `resume` pushes the deadline
   out by however long the tab was away and starts ticking again. Shifting the
   deadline rather than storing a remainder is what keeps the derived readings
   correct — the belt's release window and its slide durations are all read as
   `docEndsAt - performance.now()`, and they stay right for free.

   These clocks are pacing devices for attention. With nobody there to pace,
   there is nothing for them to do. */
const CLOCK_PAUSERS = [];
function registerClockPause(pause, resume) { CLOCK_PAUSERS.push({ pause, resume }); }
document.addEventListener('visibilitychange', () => {
  CLOCK_PAUSERS.forEach(p => (document.hidden ? p.pause() : p.resume()));
});

/* How many documents the player read, spelled out. Player-facing copy in two
   places used to say "eleven" in prose, which went stale the moment a
   document was cut from the corpus — and stale by being confidently wrong to
   the player, in an act about a machine that says confidently wrong things.
   Both now ask the corpus. Cards.show() substitutes {DOCS} for this. */
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'];
function docCountWord() {
  const n = SNIPPETS.length;
  return NUMBER_WORDS[n] || String(n);
}

/* ---- The grid (issue #61) ----

   The opening zoom and the ending's "lights out" sequence are the same
   population, seen twice — the fleet arriving, then leaving. One shared
   count is what keeps them from drifting apart the way 96 nearly did on
   both ends at once: raising it in one file and not the other silently
   breaks the bookend without either screen visibly failing on its own.

   96 (12x8) read as countable rather than vast — a caption claiming
   "millions of nodes" sitting over a grid a player could tally in a
   couple of seconds. 720 (36x20) is not literally millions either — that
   many real DOM nodes animated through a transform would stutter or hang
   the tab — but it reads as a population rather than a checkerboard, and
   it makes the zoom itself more dramatic: the scale factor from one cell
   to a full screen grows with the grid. */
const GRID_COLS = 36;
const GRID_ROWS = 20;
const GRID_ROOMS = GRID_COLS * GRID_ROWS;

/* One room, for both grids. A flat, identical brightness on every cell
   was part of what made 96 identical boxes read as manufactured rather
   than populated — three brightness tiers, randomly assigned, doesn't
   change what a room *is* (still a box, still the same metaphor the
   ending's lights-out sequence depends on), just stops every one of them
   looking machine-stamped. */
function buildRoom() {
  const roll = Math.random();
  const tier = roll < 0.34 ? ' dim' : roll < 0.67 ? ' mid' : '';
  return el('div', 'room lit' + tier);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
