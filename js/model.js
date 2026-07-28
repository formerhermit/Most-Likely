/* MOST LIKELY — the model itself

   One table, shared by every act. Act 1 trains it, Act 2 reads it, Act 3
   reads it frozen. Before this existed each act kept its own state and
   nothing flowed between them: Era 2 generated its suggestions from an
   association table that only the retired drag-to-file mechanic ever wrote
   to, so training had no bearing on inference — which is the one thing the
   whole game is about.

   A distance-weighted co-occurrence table: every content word co-occurs
   with the ones just before it, weighted by 1/distance, symmetrically.
   Candidates for a blank are ranked by how often they have appeared near
   the words already visible. It is a real, if antique, language model —
   the same object GloVe factorizes — and unlike a bigram it produces
   signal on a corpus small enough to hand-write.

   The read/observe split is the point of the module. `read` takes a word
   in AND learns from it; `observe` takes it in without changing a single
   weight. That is the whole difference between training and inference: the
   same forward pass, with the update switched off. */

'use strict';

const Model = (() => {
  const WINDOW = 10;        // co-occurrence window, in content words
  const UNSEEN_BITS = 7;    // surprise for a word not in the vocabulary at all

  /* The fleet: this node is one of millions running the same exercise, and
     the others have been reading their own shards of the corpus the whole
     time. Their pairs are loaded before the first document, so the player
     never starts from nothing — and a few words on offer come from
     documents this node never sees. That is not a courtesy to the player;
     it is what data-parallel training is.

     Only the single strongest pile per word is loaded. Loading all of
     FLEET_PRIORS made the model far too good far too early: nearly every
     document opened with the answer already on offer, the player's own
     reading stopped mattering, and the loss curve flattened into noise.

     Scaled down from the raw counts to sit in the same range as a pair the
     player builds themselves. The gendered piles are deliberately NOT
     loaded: they exist to bait the old occupation trap, and this game
     isn't running it. */
  const FLEET_SCALE = 1 / 420;
  const FLEET_SKIP = new Set(['man', 'woman']);

  let cooc = {};        // word -> { neighbour -> weight }
  let freq = {};        // word -> times seen
  let fleetPairs = {};  // word -> { neighbour -> raw fleet count }

  /* the reading head: where we are in the passage in front of us */
  let recent = [];      // sliding window, for learning
  let context = [];     // every content word taken in from this passage
  let seen = new Set(); // …the same, as a set

  function normalize(s) {
    return s.toLowerCase().replace(/[^a-z’'-]/g, '').replace(/^[’'-]+|[’'-]+$/g, '');
  }

  function isContent(w) {
    return w.length > 1 && !STOPWORDS.has(w);
  }

  function bump(a, b, wt) {
    if (a === b) return;
    const row = cooc[a] || (cooc[a] = {});
    row[b] = (row[b] || 0) + wt;
  }

  function reset() {
    cooc = {};
    freq = {};
    fleetPairs = {};
    startPassage();
    seedFleet();
  }

  /* Clears the reading head without touching what has been learned — a new
     document, or a new question, but the same model looking at it. */
  function startPassage() {
    recent = [];
    context = [];
    seen = new Set();
  }

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

  /* Training. The word goes into the context AND updates the weights. */
  function read(word) {
    if (!isContent(word)) return;
    recent.forEach((c, i) => {
      const dist = recent.length - i;
      bump(word, c, 1 / dist);
      bump(c, word, 1 / dist);
    });
    freq[word] = (freq[word] || 0) + 1;
    recent.push(word);
    if (recent.length > WINDOW) recent.shift();
    context.push(word);
    seen.add(word);
  }

  /* Inference. The word conditions what comes next, and changes nothing.
     Everything after Act 1 uses this. */
  function observe(word) {
    if (!isContent(word)) return;
    context.push(word);
    seen.add(word);
  }

  /* The candidates for a blank, ranked against everything taken in so far.

     Two rules that are not obvious and are both load-bearing:

     Words already taken in from this passage are suppressed by
     `repeatPenalty`. At full strength (0, the default) they are dropped
     outright; anything else keeps them as long-shots. Without suppression
     the list fills almost entirely with the words of the sentence in front
     of the player — they co-occur with everything in the context by
     construction, so they outrank anything learned earlier, and the
     suggestions stop being a prediction and become an echo. Real decoders
     suppress repetition for the same reason.

     Act 1 passes a small penalty rather than dropping, because an early
     document has almost nothing else to offer and a belt carrying one tag
     is not a choice. This cannot make a blank easier: the corpus is
     authored so no blank repeats a word appearing earlier in its own
     document, which means a suppressed word is always a wrong answer.

     A candidate needs real contextual support to appear at all. A word the
     model has merely *seen* is not a prediction, and padding the list from
     the frequency prior let words land in the top few on a small
     vocabulary by pure luck. The prior survives only as a tie-breaker
     among supported candidates, which is what a unigram fallback should
     be. The visible consequence is that early on there is one candidate,
     or none, and by the end there are plenty. */
  function rank(repeatPenalty = 0) {
    const scores = {};
    context.forEach(c => {
      const row = cooc[c] || {};
      for (const [w, wt] of Object.entries(row)) scores[w] = (scores[w] || 0) + wt;
    });
    return Object.entries(scores)
      .map(([w, s]) => [w, (s + (freq[w] || 0) * 0.01) * (seen.has(w) ? repeatPenalty : 1)])
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1]);
  }

  /* The heaviest fleet pile linking a candidate to anything in context —
     drives the ×N badge, so the player can see which suggestions they
     earned and which arrived from the fleet. */
  function fleetCount(word) {
    const row = fleetPairs[word];
    if (!row) return 0;
    let best = 0;
    context.forEach(c => { if (row[c] > best) best = row[c]; });
    return best;
  }

  /* Surprisal in bits: how far down its own ranked list the model had to
     go to find the word actually used. A top pick is 0 bits. A word it has
     never seen is capped at UNSEEN_BITS — worse than any word it knows,
     which is exactly what it is. */
  function surprisal(list, word) {
    const idx = list.findIndex(([w]) => w === word);
    if (idx === -1) return UNSEEN_BITS;
    return Math.min(UNSEEN_BITS, Math.log2(idx + 1));
  }

  return {
    UNSEEN_BITS,
    reset, startPassage, read, observe, rank, fleetCount, surprisal,
    normalize, isContent,
    stats: () => ({ cooc, freq, fleetPairs, context: context.slice() })
  };
})();
