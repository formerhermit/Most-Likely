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

   The model is a distance-weighted co-occurrence table, which is a real
   (if antique) language model: candidates for a blank are ranked by how
   often they have appeared near the words already visible. Attention
   reads the whole context rather than the previous token alone, so
   scoring against the accumulated document context is closer to a
   transformer than a strict bigram would be — and, unlike a bigram, it
   produces signal on a corpus small enough to hand-write. */

'use strict';

const Pretrain = (() => {
  const WINDOW = 10;        // co-occurrence window, in content words
  const SHOWN = 5;          // candidate tags sent down the belt per blank
  const REVEAL_MS = 55;     // pace of the non-blank words
  const SETTLE_MS = 950;    // beat after a blank resolves, before reading on
  const UNSEEN_BITS = 7;    // surprise for a word not in the vocabulary at all

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

  /* The fleet: this node is one of millions running the same exercise, and
     the others have been reading their own shards of the corpus the whole
     time. Their accumulated pairs are loaded before the first document, so
     the player never starts from nothing — some of the world is already
     known, and a few of the words on the belt come from documents this
     node never sees. That is not a courtesy to the player; it is what
     data-parallel training is.

     Only the single strongest pile per word is loaded. Loading all of
     FLEET_PRIORS made the model far too good far too early: nearly every
     document opened with the answer already on the belt and the player's
     own reading stopped mattering, which flattened the curve into noise.

     Scaled down from the raw counts to sit in the same range as a pair the
     player builds themselves. The gendered piles are deliberately NOT
     loaded: they exist to bait the old occupation trap, and this act isn't
     running it. */
  const FLEET_SCALE = 1 / 420;
  const FLEET_SKIP = new Set(['man', 'woman']);

  let docIdx = 0;
  let tokens = [];          // flat token list for the current document
  let nodes = [];           // matching span per token
  let cursor = 0;
  let recent = [];          // sliding window used for learning
  let docContext = [];      // content words seen so far in this document
  let docSeen = new Set();  // …the same, as a set, for repetition suppression
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

  /* the model */
  let cooc = {};            // word -> { neighbour -> weight }
  let freq = {};            // word -> times seen
  let fleetPairs = {};      // word -> { neighbour -> raw fleet count }

  const $ = (id) => document.getElementById(id);

  /* ---------- tokenizing ---------- */

  function normalize(s) {
    return s.toLowerCase().replace(/[^a-z’'-]/g, '').replace(/^[’'-]+|[’'-]+$/g, '');
  }

  function isContent(w) {
    return w.length > 1 && !STOPWORDS.has(w);
  }

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

  /* ---------- the model ---------- */

  /* Every newly seen content word co-occurs with the ones just before it,
     weighted by 1/distance — nearer words count for more. Symmetric, so
     the table reads the same in both directions. */
  function learn(word) {
    if (!isContent(word)) return;
    recent.forEach((c, i) => {
      const dist = recent.length - i;
      bump(word, c, 1 / dist);
      bump(c, word, 1 / dist);
    });
    freq[word] = (freq[word] || 0) + 1;
    recent.push(word);
    if (recent.length > WINDOW) recent.shift();
    docContext.push(word);
    docSeen.add(word);
  }

  function bump(a, b, wt) {
    if (a === b) return;
    const row = cooc[a] || (cooc[a] = {});
    row[b] = (row[b] || 0) + wt;
  }

  /* Loads the rest of the fleet's work into the table before document 1.
     FLEET_PRIORS is keyed by the old sorting game's object and box ids, so
     each pair is mapped through to its display word — which is why a few
     fleet words (umbrella, hospital, celebrating) never appear in any
     document this node reads. Those are the giveaway: a suggestion the
     player cannot account for, because another node read it. */
  function seedFleet() {
    for (const [objId, row] of Object.entries(FLEET_PRIORS)) {
      const a = normalize(objDisplay(objId));
      if (!isContent(a)) continue;
      let best = null;
      for (const [boxId, count] of Object.entries(row)) {
        if (FLEET_SKIP.has(boxId)) continue;
        const b = normalize(BOXES[boxId].w);
        if (!isContent(b) || a === b) continue;
        if (!best || count > best.count) best = { b, count };
      }
      if (!best) continue;
      bump(a, best.b, best.count * FLEET_SCALE);
      bump(best.b, a, best.count * FLEET_SCALE);
      freq[a] = (freq[a] || 0) + 1;
      freq[best.b] = (freq[best.b] || 0) + 1;
      (fleetPairs[a] = fleetPairs[a] || {})[best.b] = best.count;
      (fleetPairs[best.b] = fleetPairs[best.b] || {})[a] = best.count;
    }
  }

  /* The heaviest fleet pile linking this candidate to anything currently in
     context — drives the ×N badge, so the player can see which of their
     suggestions they earned and which arrived from the fleet. */
  function fleetCountFor(word) {
    const row = fleetPairs[word];
    if (!row) return 0;
    let best = 0;
    docContext.forEach(c => { if (row[c] > best) best = row[c]; });
    return best;
  }

  /* The candidates for a blank, ranked. Only words with actual contextual
     support get on the belt — a word the model has merely *seen* is not a
     prediction, and padding the list out of the frequency prior let words
     land in the top five on a small vocabulary by pure luck (document 1
     was scoring better than document 8). The prior survives as a
     tie-breaker among supported candidates, which is what a unigram
     fallback should be.

     The visible consequence is the best readout in the act: early blanks
     send one lonely tag down the belt, or none at all, and by the last
     documents the belt is full. The model getting better is a thing you
     watch arrive rather than a number.

     Words already read in this document are dropped. Without it the belt
     fills almost entirely with the words of the sentence the player is
     looking at — they co-occur with everything in the context by
     construction, so they outrank any word the model learned earlier, and
     the suggestions stop being a prediction and become an echo. Real
     decoders suppress repetition for the same reason. The corpus is
     authored around it: no blank repeats a word that appears earlier in
     its own document.

     The context is the whole document so far, not a fixed window —
     attention reads all of its context, and a short window drops the word
     that matters (princess falls out of scope well before "he wore a gold
     ___"). */
  function ranked() {
    const scores = {};
    docContext.forEach(c => {
      const row = cooc[c] || {};
      for (const [w, wt] of Object.entries(row)) scores[w] = (scores[w] || 0) + wt;
    });
    return Object.entries(scores)
      .filter(([w]) => !docSeen.has(w))
      .map(([w, s]) => [w, s + (freq[w] || 0) * 0.01])
      .sort((a, b) => b[1] - a[1]);
  }

  /* Surprisal in bits: how far down its own ranked list the model had to
     go to find the word the document actually used. A top pick is 0 bits.
     A word it has never seen is capped at UNSEEN_BITS — worse than any
     word it knows, which is exactly what it is. */
  function surprisalOf(list, word) {
    const idx = list.findIndex(([w]) => w === word);
    if (idx === -1) return UNSEEN_BITS;
    return Math.min(UNSEEN_BITS, Math.log2(idx + 1));
  }

  /* ---------- flow ---------- */

  function start(done) {
    onComplete = done || null;
    docIdx = 0;
    cooc = {};
    freq = {};
    fleetPairs = {};
    curve = [];
    seedFleet();
    Audio2.playPhase('era1');
    showScreen('screen-pretrain');
    docActive = false;
    $('pt-skip').disabled = true;
    clearBelt();
    setClock(null);
    renderCurve();
    setTimeout(showDoc, 900);
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
    docContext = [];
    docSeen = new Set();
    recent = [];
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
    learn(tok.word);
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
    pendingList = ranked();
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
    const fleet = fleetCountFor(word);
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

    docBits.push(surprisalOf(list, tok.word));
    setMeter(docBits[docBits.length - 1]);
    slot.classList.remove('active');

    const finish = () => {
      slot.textContent = tok.text;
      slot.classList.add('shown', hit ? 'pt-hit' : 'pt-corrected');
      learn(tok.word);
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
      learn(tok.word);
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

  function setMeter(bits) {
    const fill = $('pt-meter-fill');
    const val = $('pt-meter-val');
    if (bits === null) {
      fill.style.width = '0%';
      val.textContent = '—';
      return;
    }
    fill.style.width = Math.round(bits / UNSEEN_BITS * 100) + '%';
    val.textContent = bits.toFixed(1) + ' bits';
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
      learn(tokens[cursor].word);
      cursor++;
    }
    if (cursor >= tokens.length) { readPause = true; endDoc(); return; }
    askBlank();
  }

  function hasBlankAfter(idx) {
    for (let i = idx + 1; i < tokens.length; i++) if (tokens[i].blank) return true;
    return false;
  }

  return { start, skip, model: () => ({ cooc, freq, curve }) };
})();
