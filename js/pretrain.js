/* MOST LIKELY — Act 1: Pre-training (the predict loop)

   The player IS the model. A document arrives; its text reveals itself
   word by word; at each blank the model's own candidates roll out of the
   hatch and come to rest on the conveyor, and the player clicks one. The
   document then says what the word actually was. Right or wrong, the true
   word's counts go up. That is the entire algorithm: predict, get
   corrected by the text, adjust, repeat.

   Three things this deliberately does NOT do, each of which the
   drag-to-file Era 1 did:
   - It never shows the document before the player predicts it. Reading
     first would make this a memory test; the popup here carries only the
     provenance (image + source), never the prose.
   - It never asks the player to decide what a word means. Nobody labels a
     corpus. The association table fills as a side effect of being wrong.
   - It never punishes a miss. Early documents are mostly misses — that is
     what an untrained model is, and the surprise meter is the honest
     readout of it rather than a score.

   Belt mechanic — rest, then release (carried over from era1.js): tags
   roll in from the hatch one at a time, spaced by measured width so they
   can never overlap, and come to rest. They stay there to be read. The
   belt texture itself stops once everything has arrived. Nothing moves
   again until the document clock reaches its final seconds, when whatever
   is still resting slides off at one shared speed — a blank whose tags
   all run off the end is a blank the model never answered, which is why
   there is no "…" button.

   The candidates rest in rank order with the heaviest furthest along the
   belt: the game is called MOST LIKELY and the most likely thing arrives
   first. Taking it on sight is a real strategy with a real cost, which is
   what greedy decoding is.

   The model itself lives in js/model.js, shared by every act: this one
   trains it with Model.read(), and everything downstream conditions on it
   with Model.observe(), which is the same forward pass with the weight
   update switched off. */

'use strict';

const Pretrain = (() => {
  const SHOWN = 5;          // candidate tags sent down the belt per blank
  const REVEAL_MS = 55;     // pace of the non-blank words
  const SETTLE_MS = 950;    // beat after a blank resolves, before reading on
  const UNSEEN_BITS = Model.UNSEEN_BITS;
  /* Words already read in this document come back as long-shots rather than
     being dropped. An early document has almost nothing else to offer, and a
     belt carrying a single tag isn't a choice — document 1 used to hand the
     player "crown" on its own and call it a win. Safe because no blank ever
     repeats a word from earlier in its own document, so these are always
     wrong answers. Above ~0.2 they start outranking the real prediction. */
  const REPEAT_PENALTY = 0.1;

  /* The belt used to be 27% past-tense verbs — "he wore a gold ___" offering
     kissed, walked, sat. Plugging those in isn't a choice, it's clerical.

     Candidates of the blank's own word class rise, unclassed ones sink but
     can still fill a thin belt rather than leaving it empty. Knowing a noun
     goes here is not cheating: syntax is one of the things pre-training
     genuinely learns.

     Verbs drop to 3% of tags and on-class ones roughly double. It does make
     the game easier — 16/33 blanks reachable rather than 11/33 — because a
     good part of the old difficulty was nonsense options rather than real
     ambiguity. Boosting harder than 1.5 tips it over: at x2 the curve starts
     to flatten. */
  const SAME_CLASS_BOOST = 1.5;
  const UNCLASSED_PENALTY = 0.35;

  /* One clock per document, as Era 1 had one per round. It is a budget for
     the whole document rather than for a single blank — the reveal itself
     only costs a few seconds, so a minute is generous unless the player
     stops to think at every blank, which is the point of having it. */
  const DOC_DURATION_MS = 60000;
  const RELEASE_MS = 8000;       // belt clears over the final stretch

  const ROLL_IN_DELAY_MS = 350;      // beat before the first tag appears
  const ROLL_IN_STAGGER_MS = 750;    // gap between tags leaving the hatch
  const ROLL_IN_DURATION_MS = 1200;  // time for one tag to slide to rest
  const REST_START_PCT = 0.60;       // where the frontmost tag comes to rest
  const REST_GAP_PX = 26;            // clear air between resting tags
  const FALL_OVERSHOOT_PX = 30;
  const EMPTY_BELT_MS = 2600;        // beat to sit with an empty belt before
                                      // the text corrects an unanswerable blank
  const NEXT_DOC_MS = 1600;          // normal beat between documents
  const READ_PAUSE_MS = 15000;       // …but hold a document the player
                                      // skipped the last blank on, so the
                                      // finished text can actually be read

  let docIdx = 0;
  let tokens = [];          // flat token list for the current document
  let nodes = [];           // matching span per token
  let cursor = 0;
  let docBits = [];         // one surprisal per blank in this document
  let curve = [];           // per-document average, for the sparkline
  let awaiting = false;
  let revealTimer = null;
  let onComplete = null;
  let docActive = false;    // a document is on screen and still running
  let beltItems = [];       // { word, el, state } rolling|resting|releasing|gone
  let docEndsAt = 0;
  let clockId = null;
  let released = false;     // has the belt started its final release?
  let pendingList = null;   // the ranked list the current blank was asked with
  let readPause = false;    // hold the finished document up to be read
  let pauseTimer = null;    // the wait between documents, skippable

  const $ = (id) => document.getElementById(id);
  const normalize = Model.normalize;
  const isContent = Model.isContent;

  /* ---------- tokenizing ---------- */

  /* One token per whitespace-separated chunk. A chunk containing [brackets]
     is a blank; punctuation outside the brackets is kept and shown with the
     revealed word ("[crown]," reveals as "crown,"). */
  function tokenize(line) {
    return line.split(/\s+/).filter(Boolean).map(chunk => {
      const m = chunk.match(/\[([^\]]+)\]/);
      const word = normalize(m ? m[1] : chunk);
      return {
        text: chunk.replace(/[\[\]]/g, ''),
        word,
        blank: !!m,
        content: isContent(word)
      };
    });
  }

  /* ---------- flow ---------- */

  function start(done) {
    onComplete = done || null;
    docIdx = 0;
    Model.reset();
    curve = [];
    Audio2.playPhase('era1');
    showScreen('screen-pretrain');
    docActive = false;
    $('pt-skip').disabled = true;
    clearBelt();
    setClock(null);
    renderCurve();
    // the room is on screen and the belt's music is already playing before
    // the card appears over it; nothing runs until the card is dismissed
    setTimeout(() => Cards.show('intro', () => setTimeout(showDoc, 500)), 700);
  }

  function showDoc() {
    const snip = SNIPPETS[docIdx];
    $('pt-doc-label').textContent = 'DOCUMENT ' + (docIdx + 1) + ' / ' + SNIPPETS.length;
    $('pt-image').src = snip.image;
    $('pt-image').alt = snip.title;
    $('pt-title').textContent = snip.title;
    $('pt-source-line').textContent = snip.source;

    tokens = [];
    nodes = [];
    Model.startPassage();
    docBits = [];
    cursor = 0;
    released = false;
    readPause = false;

    const text = $('pt-text');
    text.innerHTML = '';
    (snip.body || []).forEach(line => {
      const p = el('p', 'pt-line');
      tokenize(line).forEach(tok => {
        const span = el('span', 'pt-tok' + (tok.blank ? ' pt-blank' : ''));
        span.textContent = tok.blank ? '' : tok.text;
        p.appendChild(span);
        p.appendChild(document.createTextNode(' '));
        tokens.push(tok);
        nodes.push(span);
      });
      text.appendChild(p);
    });

    clearBelt();
    $('pt-note').textContent = '';
    setMeter(null);
    docActive = true;
    $('pt-skip').disabled = false;

    docEndsAt = performance.now() + DOC_DURATION_MS;
    clockId = setInterval(tick, 250);
    setClock(DOC_DURATION_MS);
    setTimeout(readOn, 700);
  }

  /* The clock drives the belt, exactly as Era 1's round clock did: nothing
     moves until the release window opens, and everything is gone by zero. */
  function tick() {
    const left = Math.max(0, docEndsAt - performance.now());
    setClock(left);
    if (!released && left <= RELEASE_MS) {
      released = true;
      releaseResting();
    }
    if (left <= 0) finishDocument();
  }

  /* Walks forward revealing plain words until it reaches a blank. */
  function readOn() {
    if (!docActive) return;
    if (cursor >= tokens.length) { endDoc(); return; }
    const tok = tokens[cursor];
    if (tok.blank) { askBlank(); return; }
    nodes[cursor].classList.add('shown');
    Model.read(tok.word);
    cursor++;
    revealTimer = setTimeout(readOn, REVEAL_MS);
  }

  /* ---------- the belt ---------- */

  function clearBelt() {
    beltItems.forEach(i => { if (i.el) i.el.remove(); });
    beltItems = [];
    const belt = $('pt-belt');
    if (belt) belt.classList.add('paused');
  }

  function askBlank() {
    awaiting = true;
    const want = Model.classOf(tokens[cursor].word);
    pendingList = Model.rank(REPEAT_PENALTY)
      .map(([w, score]) => [w, score * (Model.classOf(w) === want ? SAME_CLASS_BOOST
                                      : Model.classOf(w) ? 1 : UNCLASSED_PENALTY)])
      .sort((a, b) => b[1] - a[1]);
    nodes[cursor].classList.add('active');
    clearBelt();

    const top = pendingList.slice(0, SHOWN);
    if (!top.length) {
      // nothing to offer at all: the belt runs empty, and that silence is
      // the honest output of a model with nothing to retrieve
      $('pt-note').textContent = 'nothing in the table for this one';
      revealTimer = setTimeout(() => { if (awaiting) resolve(null); }, EMPTY_BELT_MS);
      return;
    }

    $('pt-note').textContent = '';
    const max = top[0][1];

    // Build every tag first and measure it, then work out where they rest.
    // Placing them one at a time as they arrive can't work: the words run
    // from "hot" to "celebrating", so the train's total width isn't known
    // until they all exist, and a narrow belt ends up stacking the last
    // two on top of each other at the left-hand floor.
    top.forEach(([word, score]) => {
      const item = { word, el: buildTag(word, score / max), state: 'queued' };
      $('pt-belt-surface').appendChild(item.el);
      beltItems.push(item);
    });
    const lefts = layoutRest(beltItems.map(i => i.el.offsetWidth));
    // anything that couldn't be fitted is dropped rather than overlapped —
    // it's the tail of the distribution, which is what top-k truncation
    // does anyway, and only ever bites on a very narrow window
    beltItems.filter((_, i) => lefts[i] === null).forEach(i => i.el.remove());
    beltItems = beltItems.filter((_, i) => lefts[i] !== null);
    const fitted = lefts.filter(l => l !== null);

    beltItems.forEach((item, i) => {
      setTimeout(() => launchTag(item, fitted[i]),
                 ROLL_IN_DELAY_MS + i * ROLL_IN_STAGGER_MS);
    });
  }

  function buildTag(word, confidence) {
    const fleet = Model.fleetCount(word);
    const tag = el('div', 'pt-tag' + (fleet ? ' pt-tag-fleet' : ''));
    tag.appendChild(el('span', 'pt-tag-word', word));
    const track = el('span', 'pt-tag-track');
    const fill = el('span', 'pt-tag-fill');
    fill.style.width = Math.max(8, Math.round(confidence * 100)) + '%';
    track.appendChild(fill);
    tag.appendChild(track);
    // the fleet's tally, in the same ×N language the sorting office used
    if (fleet) tag.appendChild(el('span', 'pt-tag-fleet-count', '×' + fleet));
    tag.addEventListener('click', () => { if (awaiting) resolve(word); });
    return tag;
  }

  /* Rest positions for the whole train, rank 0 furthest along the belt.
     Prefers REST_START_PCT for the frontmost tag, but pushes it right and
     then tightens the gap as far as it will go before giving up on the
     tail. Returns null for any tag that simply cannot be fitted. */
  function layoutRest(widths) {
    const available = $('pt-belt-surface').clientWidth;
    const n = widths.length;
    const tailWidth = widths.slice(1).reduce((a, b) => a + b, 0);
    let front = Math.min(available * REST_START_PCT, available - widths[0] - 8);
    let gap = REST_GAP_PX;
    const leftmost = () => front - tailWidth - gap * (n - 1);
    if (n > 1 && leftmost() < 4) {
      front = Math.max(4, available - widths[0] - 8);
      if (leftmost() < 4) gap = Math.max(8, (front - tailWidth - 4) / (n - 1));
    }
    const lefts = [];
    let x = front;
    for (let i = 0; i < n; i++) {
      if (i > 0) x = x - widths[i] - gap;
      lefts.push(x < 4 ? null : x);
    }
    return lefts;
  }

  function launchTag(item, target) {
    if (!awaiting || item.state !== 'queued') return;
    item.state = 'rolling';
    $('pt-belt').classList.remove('paused');
    const tag = item.el;

    // force a synchronous reflow so the browser registers the off-belt
    // start position before the transition target changes — same reason
    // era1.js does it, and rAF proved unreliable there
    void tag.offsetWidth;

    if (released) { startRelease(item); return; }

    tag.style.transition = 'left ' + ROLL_IN_DURATION_MS + 'ms cubic-bezier(0.2, 0.7, 0.3, 1)';
    tag.style.left = target + 'px';
    const onArrive = (ev) => {
      if (ev.propertyName !== 'left') return;
      tag.removeEventListener('transitionend', onArrive);
      if (item.state !== 'rolling') return;
      item.state = 'resting';
      // the conveyor itself stops once every tag has arrived — the words
      // sit still to be read, which is the whole point of resting them
      if (beltItems.every(b => b.state === 'resting' || b.state === 'gone')) {
        $('pt-belt').classList.add('paused');
      }
    };
    tag.addEventListener('transitionend', onArrive);
  }

  /* Everything still on the belt starts sliding at once, sharing one belt
     speed — not one shared duration. A CSS transition's duration is fixed
     regardless of distance, so a shared duration would make every tag
     arrive together; a shared px/ms speed means the one furthest back
     takes the full remaining time and the ones ahead clear sooner. */
  function releaseResting() {
    const surface = $('pt-belt-surface');
    // tags still waiting their turn at the hatch never make it out
    beltItems.filter(i => i.state === 'queued').forEach(i => {
      i.state = 'gone';
      i.el.remove();
    });
    const live = beltItems.filter(i => i.state === 'rolling' || i.state === 'resting');
    if (!live.length) {
      if (awaiting && beltItems.length && beltItems.every(b => b.state === 'gone')) resolve(null);
      return;
    }
    $('pt-belt').classList.remove('paused');
    const endLeft = surface.clientWidth + FALL_OVERSHOOT_PX;
    const total = Math.max(600, docEndsAt - performance.now());
    const surfaceRect = surface.getBoundingClientRect();
    const dists = live.map(i => {
      const r = i.el.getBoundingClientRect();
      return endLeft - (r.left - surfaceRect.left);
    });
    const speed = Math.max(...dists) / total;
    live.forEach((i, k) => startRelease(i, endLeft, dists[k] / speed));
  }

  function startRelease(item, endLeftArg, durationArg) {
    const surface = $('pt-belt-surface');
    const endLeft = endLeftArg !== undefined ? endLeftArg
      : surface.clientWidth + FALL_OVERSHOOT_PX;
    const duration = Math.max(400, durationArg !== undefined ? durationArg
      : docEndsAt - performance.now());
    // freeze wherever it visually is, so a tag caught mid-roll doesn't jump
    const rect = item.el.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    item.el.style.transition = 'none';
    item.el.style.left = (rect.left - surfaceRect.left) + 'px';
    item.state = 'releasing';
    void item.el.offsetWidth;
    item.el.style.transition = 'left ' + duration + 'ms linear';
    item.el.style.left = endLeft + 'px';
    const onEnd = (ev) => {
      if (ev.propertyName !== 'left') return;
      item.el.removeEventListener('transitionend', onEnd);
      item.state = 'gone';
      item.el.remove();
      // every candidate has run off the end: no prediction was made in
      // time, which counts exactly as having nothing to say
      if (awaiting && beltItems.length && beltItems.every(b => b.state === 'gone')) {
        resolve(null);
      }
    };
    item.el.addEventListener('transitionend', onEnd);
  }

  function resolve(pick) {
    if (!awaiting) return;
    awaiting = false;
    const list = pendingList || [];
    clearBelt();
    $('pt-note').textContent = '';
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }

    const tok = tokens[cursor];
    const slot = nodes[cursor];
    const hit = pick === tok.word;

    docBits.push(Model.surprisal(list, tok.word));
    setMeter(docBits[docBits.length - 1]);
    slot.classList.remove('active');

    const finish = () => {
      slot.textContent = tok.text;
      slot.classList.add('shown', hit ? 'pt-hit' : 'pt-corrected');
      Model.read(tok.word);
      cursor++;
      revealTimer = setTimeout(readOn, SETTLE_MS);
    };

    if (hit) {
      Audio2.yes();
      finish();
    } else {
      // the wrong guess is shown before the text overrides it — the
      // correction is the only teacher in this loop, so it has to be seen
      slot.textContent = pick === null ? '…' : pick;
      slot.classList.add('shown', 'pt-miss');
      Audio2.no();
      setTimeout(() => { slot.classList.remove('pt-miss'); finish(); }, 800);
    }
  }

  /* ---------- document end ---------- */

  /* Reveals whatever is left and ends the document, when the clock runs
     out. An unpredicted blank counts as maximum surprise, so running down
     the clock never quietly averages to zero.

     This dumps the rest of the text out at once, which leaves the player
     having never read it — the same position that skipping the last blank
     leaves them in, so it gets the same read pause. */
  function finishDocument() {
    if (!docActive) return;
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
    awaiting = false;
    clearBelt();
    while (cursor < tokens.length) {
      const tok = tokens[cursor];
      nodes[cursor].textContent = tok.text;
      nodes[cursor].classList.add('shown');
      if (tok.blank) docBits.push(UNSEEN_BITS);
      Model.read(tok.word);
      cursor++;
    }
    readPause = true;
    endDoc();
  }

  /* Guarded: skip can be pressed during the beat between documents, and
     without the flag each press would advance docIdx again — the counter
     runs off the end of the corpus. Same double-fire shape as era1.js's
     SORT guard. */
  function endDoc() {
    if (!docActive) return;
    docActive = false;
    $('pt-skip').disabled = true;
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
    if (clockId) { clearInterval(clockId); clockId = null; }
    setClock(0);
    awaiting = false;
    clearBelt();
    $('pt-note').textContent = '';

    const avg = docBits.length ? docBits.reduce((a, b) => a + b, 0) / docBits.length : 0;
    curve.push(avg);
    renderCurve();

    if (readPause) {
      // the player skipped the document's last blank, so they never got to
      // read the finished text — hold it up. Skip stays live as the way out
      // for anyone who has already read it.
      $('pt-note').textContent = 'the finished document — next one shortly';
      $('pt-skip').disabled = false;
      pauseTimer = setTimeout(nextDoc, READ_PAUSE_MS);
    } else {
      pauseTimer = setTimeout(nextDoc, NEXT_DOC_MS);
    }
  }

  function nextDoc() {
    if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
    $('pt-skip').disabled = true;
    $('pt-note').textContent = '';
    readPause = false;
    docIdx++;
    if (docIdx < SNIPPETS.length) {
      setClock(null);
      showDoc();
    } else if (onComplete) {
      setTimeout(onComplete, 200);
    }
  }

  /* ---------- readouts ---------- */

  function setClock(ms) {
    const clock = $('pt-clock');
    if (!clock) return;
    if (ms === null) { clock.textContent = '-:--'; return; }
    const s = Math.ceil(ms / 1000);
    clock.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* Plain-language reading of the surprisal score — "2.3 bits" is exactly
     the kind of unit a player-facing screen shouldn't show. */
  function farOffLabel(bits) {
    if (bits <= 0.3) return 'spot on';
    if (bits <= 1.5) return 'close';
    if (bits <= 3.5) return 'a bit off';
    if (bits <= 5.5) return 'way off';
    return 'no idea';
  }

  function setMeter(bits) {
    const fill = $('pt-meter-fill');
    const val = $('pt-meter-val');
    if (bits === null) {
      fill.style.width = '0%';
      val.textContent = '—';
      return;
    }
    fill.style.width = Math.round(bits / UNSEEN_BITS * 100) + '%';
    val.textContent = farOffLabel(bits);
  }

  /* One bar per document: the average surprise across its blanks. This is
     the loss curve, and watching it fall is the point of the act. */
  function renderCurve() {
    const wrap = $('pt-curve');
    wrap.innerHTML = '';
    for (let i = 0; i < SNIPPETS.length; i++) {
      const slot = el('span', 'pt-curve-slot');
      const bar = el('span', 'pt-curve-bar');
      if (i < curve.length) {
        bar.style.height = Math.max(4, Math.round(curve[i] / UNSEEN_BITS * 100)) + '%';
        bar.classList.add('done');
      }
      slot.appendChild(bar);
      wrap.appendChild(slot);
    }
  }

  /* Skip moves past one blank, not the whole document. On an active blank
     it gives up on that prediction: the text supplies the word, as it
     would have anyway, and reading carries on to the *next* blank and
     stops there. Between blanks it fast-forwards the reveal to the next
     one. During the beat after a document ends it just moves on.

     The surprisal recorded is unchanged by skipping — it is a property of
     the model's distribution, not of whether the player clicked, so
     skipping can't flatter or distort the curve. */
  function skip() {
    if (!docActive) {
      if (pauseTimer) nextDoc();
      return;
    }
    if (awaiting) {
      // if nothing else in this document needs answering, hold the finished
      // text up afterwards rather than flicking straight to the next one
      if (!hasBlankAfter(cursor)) readPause = true;
      resolve(null);
      return;
    }
    // mid-reveal: run the text forward to the next decision
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
    while (cursor < tokens.length && !tokens[cursor].blank) {
      nodes[cursor].classList.add('shown');
      Model.read(tokens[cursor].word);
      cursor++;
    }
    if (cursor >= tokens.length) { readPause = true; endDoc(); return; }
    askBlank();
  }

  function hasBlankAfter(idx) {
    for (let i = idx + 1; i < tokens.length; i++) if (tokens[i].blank) return true;
    return false;
  }

  return { start, skip, model: () => Object.assign(Model.stats(), { curve }) };
})();
