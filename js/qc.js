/* MOST LIKELY — Act 2: Quality Control (instruction tuning)
   No instructions given. Slips are sorted into ? and =; a supervisor
   silhouette approves or rejects. Ten correct completes the task, however
   many tries it takes.

   This used to be bracketed with a demonstration — the model answering a
   question with no framing, running on instead of stopping — either side
   of the sort. Cut: the underlying model here is a co-occurrence table
   with no grammar, so its "run-on" was a few loosely-related words rather
   than the fluent rambling a real base model produces, and a demonstration
   that undersells the thing it's demonstrating teaches the player less
   than just being told. The phase cards (js/cards.js) already say what
   this stage does in plain words; the sorting task is the point. */

'use strict';

const QC = (() => {
  const NEEDED = 5;    // correct rounds to complete the phase

  let deck = [];
  let current = null;
  let correctCount = 0;
  let busy = false;
  let rateIdx = 0;

  const $ = (id) => document.getElementById(id);

  function start() {
    showScreen('screen-qc');
    deck = shuffle(QC_SLIPS);
    correctCount = 0;
    busy = false;
    rateIdx = 0;
    $('qc-stamps').innerHTML = '';
    $('qc-approved').classList.add('hidden');
    $('qc-rate').classList.add('hidden');
    $('qc-slip').classList.remove('hidden');
    document.querySelector('.qc-fields').classList.remove('hidden');
    updateLights(NEEDED, correctCount);
    nextSlip();
  }

  function nextSlip() {
    if (deck.length === 0) {
      deck = shuffle(QC_SLIPS);
      /* The deck is drawn without replacement — every slip once before any
         repeats — but a fresh shuffle doesn't know what was just dismissed,
         so about 1 time in 20 (measured) it puts the exact same slip right
         back on top: it appears, drops away, and comes right back with
         nothing in between (issue #63). Swap it for a different position
         so the boundary between one pass through the deck and the next
         never immediately repeats the slip that was just there. Guarded on
         `current` for the very first draw of the phase, where there's
         nothing yet to avoid repeating. */
      if (current && deck[deck.length - 1] === current && deck.length > 1) {
        const swapAt = Math.floor(Math.random() * (deck.length - 1));
        [deck[deck.length - 1], deck[swapAt]] = [deck[swapAt], deck[deck.length - 1]];
      }
    }
    current = deck.pop();
    const slip = $('qc-slip');
    slip.textContent = current.text;
    slip.classList.remove('fly-q', 'fly-a', 'slip-in');
    void slip.offsetWidth;
    slip.classList.add('slip-in');
    busy = false;
  }

  function drop(field) {   // field: 'q' or 'a'
    if (busy || !current) return;
    busy = true;
    const right = current.type === field;
    const slip = $('qc-slip');
    slip.classList.add(field === 'q' ? 'fly-q' : 'fly-a');
    State.qcAttempts++;

    setTimeout(() => {
      verdict(right);
      if (right) {
        correctCount++;
        updateLights(NEEDED, correctCount);
        // the sort is done; the same supervisor now marks whole replies
        if (correctCount >= NEEDED) { setTimeout(startRatings, 1100); return; }
      }
      setTimeout(nextSlip, 900);
    }, 350);
  }

  /* ---------- rating rounds ---------- */

  /* The sort taught the shape of a reply. This teaches what a reply is
     marked on, which is the thing Act 3 spends its whole shift charging the
     player for. Same board, same silhouette, same thumbs — the continuity
     matters, because the point is that this is one stage and not two. */
  function startRatings() {
    $('qc-slip').classList.add('hidden');
    document.querySelector('.qc-fields').classList.add('hidden');
    $('qc-rate').classList.remove('hidden');
    rateIdx = 0;
    updateLights(QC_RATINGS.length, 0);
    renderRating();
  }

  function renderRating() {
    const round = QC_RATINGS[rateIdx];
    $('qc-rate-ask').textContent = round.ask;
    const row = $('qc-rate-options');
    row.innerHTML = '';
    // shuffled so the approved answer isn't always in the same place — the
    // player should be reading the drafts, not learning a side
    shuffle([{ text: round.good, ok: true }, { text: QC_DUNNO, ok: false }])
      .forEach(opt => {
        const b = el('button', 'qc-rate-opt', opt.text);
        b.addEventListener('click', () => chooseRating(b, opt.ok));
        row.appendChild(b);
      });
    busy = false;
  }

  /* Rejection does not advance. There are two drafts and only one of them
     is ever approved, so the round holds until the player picks it: the way
     out of the room is to stop saying you don't know. Nothing here explains
     that — the player finds it by trying the honest answer and being sent
     back, which is the same way a model finds it. */
  function chooseRating(btn, ok) {
    if (busy) return;
    busy = true;
    if (!ok) State.qcDunnoTried++;
    verdict(ok);
    if (!ok) {
      btn.classList.add('rejected');
      setTimeout(() => { btn.classList.remove('rejected'); busy = false; }, 900);
      return;
    }
    Array.from($('qc-rate-options').children).forEach(b => { b.disabled = true; });
    rateIdx++;
    updateLights(QC_RATINGS.length, rateIdx);
    if (rateIdx >= QC_RATINGS.length) { setTimeout(approve, 1100); return; }
    setTimeout(renderRating, 900);
  }

  function verdict(right) {
    const bubble = $('qc-verdict');
    bubble.textContent = right ? '👍' : '👎';
    bubble.classList.remove('show');
    void bubble.offsetWidth;
    bubble.classList.add('show');
    if (right) Audio2.yes(); else Audio2.no();
  }

  function updateLights(total, on) {
    const lights = $('qc-lights');
    lights.innerHTML = '';
    for (let i = 0; i < total; i++) {
      lights.appendChild(el('span', 'qc-light' + (i < on ? ' on' : '')));
    }
  }

  function approve() {
    State.tuned = true;
    const box = $('qc-approved');
    box.classList.remove('hidden');
    $('qc-stamp-1').classList.remove('hit');
    $('qc-stamp-2').classList.remove('hit');
    void box.offsetWidth;
    $('qc-stamp-1').classList.add('hit');
    Audio2.stamp();
    setTimeout(() => Audio2.siren(), 500);
    setTimeout(() => {
      $('qc-stamp-2').classList.add('hit');
      Audio2.stamp();
    }, 2600);
    setTimeout(() => Cards.show('afterTuning', () => Era2.start()), 4400);
  }

  return { start, drop };
})();
