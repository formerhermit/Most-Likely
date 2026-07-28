/* MOST LIKELY — Act 1: Pre-training (the predict loop)

   The player IS the model. A document arrives; its text reveals itself
   word by word; at each blank the model's own candidates ride out of the
   hatch on the conveyor, and the player clicks one before it reaches the
   end of the belt. The document then says what the word actually was.
   Right or wrong, the true word's counts go up. That is the entire
   algorithm: predict, get corrected by the text, adjust, repeat.

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

   The belt carries the ranked list in rank order, heaviest first: the
   game is called MOST LIKELY and the most likely thing arrives first.
   Taking it immediately is a real strategy with a real cost, which is
   exactly what greedy decoding is. Letting every tag run off the end is
   how a blank goes unanswered — there is no "…" button, because a model
   with nothing to say doesn't press one.

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

  const BELT_TRAVEL_MS = 7000;   // hatch to the end of the belt
  const BELT_STAGGER_MS = 420;   // gap between tags leaving the hatch
  const EMPTY_BELT_MS = 2600;    // beat to sit with an empty belt before the
                                  // text corrects an unanswerable blank

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
     One canonical association per word leaves plenty unknown.

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
  let beltItems = [];       // { word, el, gone } for the tags in flight

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
    setTimeout(readOn, 700);
  }

  /* Walks forward revealing plain words until it reaches a blank. */
  function readOn() {
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
    const list = ranked();
    nodes[cursor].classList.add('active');
    clearBelt();

    const top = list.slice(0, SHOWN);
    if (!top.length) {
      // nothing to offer at all: the belt runs empty, and that silence is
      // the honest output of a model with nothing to retrieve
      $('pt-note').textContent = 'nothing in the table for this one';
      $('pt-belt').classList.remove('paused');
      revealTimer = setTimeout(() => { if (awaiting) resolve(null, list); }, EMPTY_BELT_MS);
      return;
    }

    $('pt-note').textContent = '';
    $('pt-belt').classList.remove('paused');
    const max = top[0][1];
    top.forEach(([word, score], i) => {
      const item = { word, el: null, gone: false };
      beltItems.push(item);
      setTimeout(() => spawnTag(item, score / max, list), i * BELT_STAGGER_MS);
    });
  }

  function spawnTag(item, confidence, list) {
    if (!awaiting) return;
    const surface = $('pt-belt-surface');
    const fleet = fleetCountFor(item.word);
    const tag = el('div', 'pt-tag' + (fleet ? ' pt-tag-fleet' : ''));
    tag.appendChild(el('span', 'pt-tag-word', item.word));
    const track = el('span', 'pt-tag-track');
    const fill = el('span', 'pt-tag-fill');
    fill.style.width = Math.max(8, Math.round(confidence * 100)) + '%';
    track.appendChild(fill);
    tag.appendChild(track);
    // the fleet's tally, in the same ×N language the sorting office used
    if (fleet) tag.appendChild(el('span', 'pt-tag-fleet-count', '×' + fleet));
    tag.addEventListener('click', () => { if (awaiting) resolve(item.word, list); });
    surface.appendChild(tag);
    item.el = tag;

    // force a synchronous reflow so the browser registers the off-belt
    // start position before the transition target changes — same reason
    // era1.js does it, and rAF proved unreliable there
    void tag.offsetWidth;
    tag.style.transition = 'left ' + BELT_TRAVEL_MS + 'ms linear';
    tag.style.left = (surface.clientWidth + 30) + 'px';

    tag.addEventListener('transitionend', (ev) => {
      if (ev.propertyName !== 'left') return;
      item.gone = true;
      tag.remove();
      // every candidate has run off the end: no prediction was made in
      // time, which counts exactly as having nothing to say
      if (awaiting && beltItems.length && beltItems.every(b => b.gone)) resolve(null, list);
    });
  }

  function resolve(pick, list) {
    if (!awaiting) return;
    awaiting = false;
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

  /* Guarded: skip can be pressed during the beat between documents, and
     without the flag each press would advance docIdx again — the counter
     runs off the end of the corpus. Same double-fire shape as era1.js's
     SORT guard. */
  function endDoc() {
    if (!docActive) return;
    docActive = false;
    $('pt-skip').disabled = true;
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
    awaiting = false;
    clearBelt();
    $('pt-note').textContent = '';

    const avg = docBits.length ? docBits.reduce((a, b) => a + b, 0) / docBits.length : 0;
    curve.push(avg);
    renderCurve();
    docIdx++;
    if (docIdx < SNIPPETS.length) {
      setTimeout(showDoc, 1600);
    } else {
      setTimeout(() => { if (onComplete) onComplete(); }, 1800);
    }
  }

  /* ---------- readouts ---------- */

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

  function skip() {
    if (!docActive) return;
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
    awaiting = false;
    clearBelt();
    while (cursor < tokens.length) {
      const tok = tokens[cursor];
      nodes[cursor].textContent = tok.text;
      nodes[cursor].classList.add('shown');
      // a blank that was never predicted counts as maximum surprise — the
      // model made no guess at all, so skipping ahead has to show on the
      // curve rather than quietly averaging to zero
      if (tok.blank) docBits.push(UNSEEN_BITS);
      learn(tok.word);
      cursor++;
    }
    endDoc();
  }

  return { start, skip, model: () => ({ cooc, freq, curve }) };
})();
