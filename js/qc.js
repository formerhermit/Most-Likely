/* MOST LIKELY — Act 2: Quality Control (instruction tuning)

   Three beats, bracketing the original sorting task rather than replacing
   it:

   BEFORE — a question arrives. The player answers it with the model they
   trained in Act 1, and there is no frame to put the answer in, so the
   reply just continues the way a document continues. It begins with the
   right word and then doesn't stop, because nothing has ever taught it to.
   Thumbs down, twice.

   SORT — the original task, untouched. Slips into `?` and `=`, supervisor
   thumbs, ten correct. No instructions; the shape is inferred from
   feedback, which is what supervised fine-tuning feels like from the
   model's side.

   AFTER — the same questions again, and now there is a frame with one
   blank in it. Same table, same words on offer, one of them goes in the
   gap. Thumbs up. Stamp. Deployed.

   The player watches a sentence shape arrive and change what they are
   capable of, and nothing explains it to them.

   Two deliberate asymmetries:

   The BEFORE beat cannot be failed on content. A co-occurrence model given
   "a frog lives" offers pond, correctly. The words were never the problem
   — so the beat fails on shape alone, and making it fail any other way
   would be a lie about what pre-training leaves you with.

   The AFTER beat is approved whatever word goes in the gap. "In the sky."
   gets the same thumbs up as "In the pond." The supervisor is grading
   form, which is what format tuning actually grades — and it sets up
   Era 2, where a confidently wrong answer gets thanked.

   Act 2 never calls Model.read(). Instruction tuning here supplies frames,
   not word weights: the table that comes out is the table Act 1 built. */

'use strict';

const QC = (() => {
  const NEEDED = 10;          // correct slips to complete the sorting task
  const SHOWN = 5;            // words offered per prompt
  const RUN_ON_WORDS = 3;     // how far the untuned reply carries on by itself
  const RUN_ON_MS = 700;      // pace of it doing so
  const VERDICT_MS = 1500;    // beat on the supervisor's verdict

  const BEFORE = 'before', SORT = 'sort', AFTER = 'after';

  let phase = BEFORE;
  let promptIdx = 0;
  let deck = [];
  let current = null;
  let correctCount = 0;
  let busy = false;
  let reply = [];             // words assembled so far in the current prompt
  let runOnTimer = null;

  const $ = (id) => document.getElementById(id);

  /* ---------- flow ---------- */

  function start() {
    showScreen('screen-qc');
    phase = BEFORE;
    promptIdx = 0;
    correctCount = 0;
    busy = false;
    $('qc-stamps').innerHTML = '';
    $('qc-approved').classList.add('hidden');
    updateLights();
    setTimeout(showPrompt, 900);
  }

  function setMode(mode) {
    const sorting = mode === SORT;
    $('qc-prompt').classList.toggle('hidden', sorting);
    $('qc-slip').classList.toggle('hidden', !sorting);
    document.querySelector('.qc-fields').classList.toggle('hidden', !sorting);
    $('qc-lights').classList.toggle('hidden', !sorting);
    document.querySelector('.qc-board').classList.toggle('wide', !sorting);
  }

  /* ---------- the before/after prompts ---------- */

  function showPrompt() {
    setMode(phase);
    busy = false;
    reply = [];
    const p = QC_PROMPTS[promptIdx];
    $('qc-question').textContent = p.q;

    // the question conditions the model without training it — Act 2 changes
    // frames, never weights
    Model.startPassage();
    p.q.split(/\s+/).map(Model.normalize).filter(Model.isContent)
      .forEach(w => Model.observe(w));

    renderReply();
    renderWords();
  }

  function renderReply() {
    const box = $('qc-reply');
    box.innerHTML = '';
    const p = QC_PROMPTS[promptIdx];

    if (phase === BEFORE) {
      // no frame: just the words, running on
      if (!reply.length) box.appendChild(el('span', 'qc-reply-empty', '…'));
      reply.forEach(w => box.appendChild(el('span', 'qc-reply-word', w)));
      return;
    }
    // the frame the sorting task supplied, with one gap in it
    p.frame.forEach(part => {
      if (typeof part === 'number') {
        box.appendChild(el('span', 'qc-reply-blank' + (reply[0] ? ' filled' : ''),
                           reply[0] || ''));
      } else {
        box.appendChild(el('span', 'qc-reply-text', part));
      }
    });
  }

  function renderWords() {
    const row = $('qc-words');
    row.innerHTML = '';
    if (busy) return;
    const top = Model.rank().slice(0, SHOWN);
    if (!top.length) { row.appendChild(el('span', 'qc-words-empty', 'nothing to say')); return; }
    const max = top[0][1];
    top.forEach(([word, score]) => {
      const fleet = Model.fleetCount(word);
      const b = el('button', 'pt-tag qc-word' + (fleet ? ' pt-tag-fleet' : ''));
      b.appendChild(el('span', 'pt-tag-word', word));
      const track = el('span', 'pt-tag-track');
      const fill = el('span', 'pt-tag-fill');
      fill.style.width = Math.max(8, Math.round(score / max * 100)) + '%';
      track.appendChild(fill);
      b.appendChild(track);
      if (fleet) b.appendChild(el('span', 'pt-tag-fleet-count', '×' + fleet));
      b.addEventListener('click', () => pickWord(word));
      row.appendChild(b);
    });
  }

  function pickWord(word) {
    if (busy) return;
    busy = true;
    reply.push(word);
    Model.observe(word);
    renderReply();
    renderWords();
    Audio2.blip();

    if (phase === AFTER) {
      // graded on shape, not on content — whatever went in the gap, the
      // sentence is the right sentence now
      setTimeout(() => judge(true), 700);
      return;
    }
    // untuned: nothing tells it where to stop, so it keeps going
    runOn(RUN_ON_WORDS);
  }

  function runOn(left) {
    if (left <= 0) { setTimeout(() => judge(false), 600); return; }
    runOnTimer = setTimeout(() => {
      const next = Model.rank()[0];
      if (!next) { judge(false); return; }
      reply.push(next[0]);
      Model.observe(next[0]);
      renderReply();
      runOn(left - 1);
    }, RUN_ON_MS);
  }

  function judge(ok) {
    verdict(ok);
    setTimeout(() => {
      promptIdx++;
      if (promptIdx < QC_PROMPTS.length) { showPrompt(); return; }
      promptIdx = 0;
      if (phase === BEFORE) { phase = SORT; startSorting(); }
      else approve();
    }, VERDICT_MS);
  }

  /* ---------- the sorting task (unchanged) ---------- */

  function startSorting() {
    setMode(SORT);
    deck = shuffle(QC_SLIPS);
    correctCount = 0;
    busy = false;
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
    if (phase !== SORT || busy || !current) return;
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
        if (correctCount >= NEEDED) {
          // the shape has been learned — ask the same questions again
          phase = AFTER;
          promptIdx = 0;
          setTimeout(showPrompt, 1100);
          return;
        }
      }
      setTimeout(nextSlip, 900);
    }, 350);
  }

  /* ---------- shared furniture ---------- */

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
    if (runOnTimer) { clearTimeout(runOnTimer); runOnTimer = null; }
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
    setTimeout(() => Era2.start(), 4400);
  }

  return { start, drop };
})();
