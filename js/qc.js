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
  const NEEDED = 10;   // correct rounds to complete the phase

  let deck = [];
  let current = null;
  let correctCount = 0;
  let busy = false;

  const $ = (id) => document.getElementById(id);

  function start() {
    showScreen('screen-qc');
    deck = shuffle(QC_SLIPS);
    correctCount = 0;
    busy = false;
    $('qc-stamps').innerHTML = '';
    $('qc-approved').classList.add('hidden');
    updateLights();
    nextSlip();
  }

  function nextSlip() {
    if (deck.length === 0) deck = shuffle(QC_SLIPS);
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
        updateLights();
        if (correctCount >= NEEDED) { setTimeout(approve, 900); return; }
      }
      setTimeout(nextSlip, 900);
    }, 350);
  }

  function verdict(right) {
    const bubble = $('qc-verdict');
    bubble.textContent = right ? '👍' : '👎';
    bubble.classList.remove('show');
    void bubble.offsetWidth;
    bubble.classList.add('show');
    if (right) Audio2.yes(); else Audio2.no();
  }

  function updateLights() {
    const lights = $('qc-lights');
    lights.innerHTML = '';
    for (let i = 0; i < NEEDED; i++) {
      lights.appendChild(el('span', 'qc-light' + (i < correctCount ? ' on' : '')));
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
