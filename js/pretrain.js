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
     to flatten.

     A word of the WRONG class used to be treated better than a word of no
     class at all: `she` is validly tagged a person, so on a blank wanting a
     quality it sailed past at x1 while an untagged word sank to x0.35. It
     ended up on 18 of 33 belts — more than half the belts in the game — and
     "leaves the bank ___ and green" offering `she` is the same clerical
     non-choice the boost above exists to kill. Worse, a belt only holds
     five: every junk tag is a seat the real answer could have had, which is
     why penalising mismatch buys wins as well as sense. At 0.6 it takes
     reachable blanks from 17 to 20 and leaves every loss spike intact. */
  const SAME_CLASS_BOOST = 1.5;
  const WRONG_CLASS_PENALTY = 0.6;
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
  const FLY_MS = 260;                // picked tag's flight into its blank;
                                      // must match the transition in
                                      // .pt-tag-flying
  const READ_PAUSE_MS = 7000;        // hold every finished document up long
                                      // enough that the text after the last
                                      // blank can actually be read. A
                                      // ceiling, not a wait: tap or SKIP
                                      // moves on the moment the player is done.
                                      // Was 15s, which playtested as dead air
                                      // (issue #29) — ten documents of it is
                                      // most of three minutes spent waiting on
                                      // a timer the player didn't know they
                                      // could dismiss. The verdict card's
                                      // sub-line now names the way out, which
                                      // is the half of this that mattered
  const PAUSE_TAP_GUARD_MS = 1200;   // ignore taps this early into that
                                      // hold: the tap that fast-forwarded
                                      // the last of the text must not also
                                      // dismiss the pause it just earned

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
  let pauseTimer = null;    // the wait between documents, skippable
  let pauseStartedAt = 0;   // when that hold began, for the tap guard below
  let streak = 0;           // consecutive correct guesses, across documents
  let bestStreak = 0;       // …and the longest of them, for the report card
  let hits = 0;             // blanks guessed right, across the whole act
  let docHits = 0;          // …and within the current document, for the verdict
  let prevRate = null;      // the previous document's share right, to compare to
  let firstCorrect = false; // has the player ever guessed one right?
  // Whether THIS blank is the very first one asked all act (issue #52), set
  // the moment it's asked and read back when it resolves. Has to be captured
  // at ask-time rather than checked at resolve-time: askBlank() and land()
  // for the same blank are separated by a click or a timeout, and askBlank()
  // for the *next* blank never runs until this one's whole resolve/land/
  // finish cycle is done — so the value read in land() is always the one
  // this blank was asked with, never a later blank's.
  let askingFirstBlank = false;
  let firstBlankAsked = false;
  let resolving = false;    // a miss beat is playing out; don't re-ask
  let fbKind = null;        // what the feedback slot is showing: verdict|ticket|hint
  let fbTimer = null;       // a ticket's dwell timer

  const $ = (id) => document.getElementById(id);
  const normalize = Model.normalize;
  const isContent = Model.isContent;

  /* Below this there's no width for a conveyor — the belt swaps for tags
     that just appear in place and fade out again, same breakpoint as the
     QC desk (#34), same underlying bug shape (#45). Read live rather than
     cached: a phone can rotate mid-round. */
  const MOBILE_QUERY = '(max-width: 620px)';
  function isMobileLayout() { return window.matchMedia(MOBILE_QUERY).matches; }

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
    streak = 0;
    bestStreak = 0;
    hits = 0;
    docHits = 0;
    prevRate = null;
    firstCorrect = false;
    firstBlankAsked = false;
    resolving = false;
    fbClear();
    // a restart mid-run must not inherit the old run's machinery: the
    // previous document's clock interval would keep ticking against the
    // new run's state, and a stale `awaiting` lets belt events from the
    // torn-down round resolve blanks in the new one
    awaiting = false;
    released = false;
    pendingList = null;
    lastVocabN = -1;        // so a restart's opening count isn't a "bump"
    if (clockId) { clearInterval(clockId); clockId = null; }
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
    if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
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
    /* "1 / 10 documents", not "DOCUMENT 1 / 10". The counter sits next to
       this and used to put the two numbers back to back — "…1 / 10  42 words
       known" read as though ten and forty-two were one figure. Ending on the
       word means a word always separates them. */
    $('pt-doc-label').textContent =
      (docIdx + 1) + ' / ' + SNIPPETS.length + ' documents';
    $('pt-image').src = snip.image;
    $('pt-image').alt = snip.title;
    $('pt-title').textContent = snip.title;
    $('pt-source-line').textContent = snip.source;

    tokens = [];
    nodes = [];
    Model.startPassage();
    docBits = [];
    docHits = 0;
    cursor = 0;
    released = false;
    // the verdict belongs to the bar that just landed, so it goes when the
    // next document arrives — left up, it reads as a running commentary on
    // the document the player is now part-way through
    fbClear();

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
    $('pt-stamp').classList.remove('hit');
    // discoverability, once: the fast-forward gesture, worded per platform
    if (docIdx === 0) {
      fbHint(isMobileLayout() ? 'tap the page to read faster'
                              : 'tap the page or press space to read faster');
    }
    setMeter(null);
    updateVocab();
    docActive = true;
    $('pt-skip').disabled = false;

    docEndsAt = performance.now() + DOC_DURATION_MS;
    clockId = setInterval(tick, 250);
    setClock(DOC_DURATION_MS);
    // stored: fastForward in this first beat must cancel it, or readOn
    // fires 700ms later and asks the same blank twice
    revealTimer = setTimeout(readOn, 700);
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

  /* The document clock stops while the tab is hidden (issue #56). Guarded on
     `docActive` so it can't restart a clock for a document that has already
     ended — the hold between documents is a plain timeout and needs no help,
     it just fires late and then moves on. */
  let hiddenAt = 0;
  registerClockPause(
    () => {
      if (!docActive || !clockId) return;
      hiddenAt = performance.now();
      clearInterval(clockId);
      clockId = null;
    },
    () => {
      if (!hiddenAt) return;
      const away = performance.now() - hiddenAt;
      hiddenAt = 0;
      if (!docActive) return;
      docEndsAt += away;
      clockId = setInterval(tick, 250);
      tick();
    }
  );

  /* Walks forward revealing plain words until it reaches a blank. */
  function readOn() {
    if (!docActive) return;
    // A finished document is held up to be read, however it finished. The
    // reveal runs at 55ms a word — around a thousand words a minute — so
    // "the player watched it appear" is not the same as "the player read
    // it", and the text after the last blank can run to a couple of
    // sentences. Every other way out of a document already sets this; this
    // path is the ordinary one, and used to be the only one that didn't.
    if (cursor >= tokens.length) { endDoc(); return; }
    const tok = tokens[cursor];
    if (tok.blank) { askBlank(); return; }
    nodes[cursor].classList.add('shown');
    Model.read(tok.word);
    updateVocab();
    cursor++;
    revealTimer = setTimeout(readOn, REVEAL_MS);
  }

  /* ---------- the belt ---------- */

  function clearBelt() {
    beltItems.forEach(i => { if (i.el) i.el.remove(); });
    beltItems = [];
    const belt = $('pt-belt');
    if (belt) belt.classList.add('paused');
    // belt and options are mutually exclusive per viewport, but clear both
    // unconditionally — a resize/rotation mid-round shouldn't be able to
    // strand a tag in whichever container isn't currently visible
    const opts = $('pt-options');
    if (opts) opts.innerHTML = '';
  }

  function askBlank() {
    awaiting = true;
    askingFirstBlank = !firstBlankAsked;
    firstBlankAsked = true;
    const want = Model.classOf(tokens[cursor].word);
    pendingList = Model.rank(REPEAT_PENALTY)
      .map(([w, score]) => {
        const cls = Model.classOf(w);
        return [w, score * (cls === want ? SAME_CLASS_BOOST
                          : cls ? WRONG_CLASS_PENALTY : UNCLASSED_PENALTY)];
      })
      .sort((a, b) => b[1] - a[1]);
    nodes[cursor].classList.add('active');
    clearBelt();

    const top = pendingList.slice(0, SHOWN);
    if (!top.length) {
      // nothing to offer at all: the belt runs empty, and that silence is
      // the honest output of a model with nothing to retrieve
      fbHint('nothing in the table for this one');
      revealTimer = setTimeout(() => { if (awaiting) resolve(null); }, EMPTY_BELT_MS);
      return;
    }

    fbHint('');
    const max = top[0][1];

    if (isMobileLayout()) {
      // no belt to ride: tags appear where they'll be tapped, staggered for
      // the same "arriving" pacing the belt has, faded rather than slid
      top.forEach(([word, score], i) => {
        const item = { word, el: buildTag(word, score / max, true), state: 'queued' };
        $('pt-options').appendChild(item.el);
        beltItems.push(item);
        setTimeout(() => spawnOption(item), ROLL_IN_DELAY_MS + i * 180);
      });
      return;
    }

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

  /* Fades a tag in where it sits rather than sliding it — the mobile
     equivalent of a tag arriving and coming to rest. */
  function spawnOption(item) {
    if (!awaiting || item.state !== 'queued') return;
    item.state = 'resting';
    void item.el.offsetWidth;
    item.el.classList.add('pt-tag-shown');
  }

  /* The belt's release, without the belt: whatever's still up fades out
     over exactly the time left on the clock, so an option vanishing at the
     same instant the document reaches zero is true here too — a tag that
     fades all the way out was never tapped, same as one that rolled off
     the end. */
  function releaseOptions() {
    beltItems.filter(i => i.state === 'queued').forEach(i => {
      i.state = 'gone';
      i.el.remove();
    });
    const live = beltItems.filter(i => i.state === 'resting');
    if (!live.length) {
      if (awaiting && beltItems.length && beltItems.every(b => b.state === 'gone')) resolve(null);
      return;
    }
    const duration = Math.max(400, docEndsAt - performance.now());
    live.forEach(item => {
      item.state = 'releasing';
      item.el.style.transition = 'opacity ' + duration + 'ms linear';
      void item.el.offsetWidth;
      item.el.classList.remove('pt-tag-shown');
      const onEnd = (ev) => {
        if (ev.propertyName !== 'opacity') return;
        item.el.removeEventListener('transitionend', onEnd);
        item.state = 'gone';
        item.el.remove();
        if (awaiting && beltItems.length && beltItems.every(b => b.state === 'gone')) resolve(null);
      };
      item.el.addEventListener('transitionend', onEnd);
    });
  }

  function buildTag(word, confidence, staticTag) {
    const fleet = Model.fleetCount(word);
    const tag = el('div', 'pt-tag' + (staticTag ? ' pt-tag-static' : '') + (fleet ? ' pt-tag-fleet' : ''));
    tag.appendChild(el('span', 'pt-tag-word', word));
    const track = el('span', 'pt-tag-track');
    const fill = el('span', 'pt-tag-fill');
    fill.style.width = Math.max(8, Math.round(confidence * 100)) + '%';
    track.appendChild(fill);
    tag.appendChild(track);
    // the fleet's tally, in the same ×N language the sorting office used
    if (fleet) tag.appendChild(el('span', 'pt-tag-fleet-count', '×' + fleet));
    tag.addEventListener('click', () => { if (awaiting) resolve(word, tag); });
    return tag;
  }

  /* The picked word travels from the belt into the sentence and lands in
     the line, instead of appearing there (#48). The player chose a word off
     a conveyor; watching it go where they sent it is what makes the choice
     feel like handling something rather than clicking a button.

     A clone does the flying, not the tag itself: the belt is cleared the
     instant a blank resolves, and a real tag would be torn out mid-flight.
     The clone is fixed to the viewport so nothing in the page's layout can
     move it either.

     `done` runs on arrival, and exactly once — transitionend is not
     guaranteed to fire (a backgrounded tab won't, and neither will a zero
     -distance move), so a timer backs it up. Everything the blank does next
     hangs off this callback, which means a dropped event would otherwise
     wedge the document. */
  /* Step one, called while the tag is still on the belt: take a detached
     copy of it and note where it was standing. Returns null when there is
     nothing to fly — no tag (the clock ran out, or skip gave up on the
     blank), or a player who has asked not to be shown motion. */
  function captureFlyer(tagEl) {
    if (!tagEl) return null;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    const rect = tagEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const clone = tagEl.cloneNode(true);
    clone.classList.add('pt-tag-flying');
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    return { clone, rect };
  }

  /* Step two, called once the belt has gone: send the copy to the blank.
     The target is measured here rather than at capture time, so a layout
     that reflows when the tags leave is accounted for.

     `done` runs on arrival, and exactly once. transitionend is not
     guaranteed — a backgrounded tab won't fire it — and everything the
     blank does next hangs off this callback, so a dropped event would
     wedge the document. The timer is the guarantee; the event is just the
     faster of the two. */
  function flyToBlank(flyer, slot, done) {
    if (!flyer) { done(); return; }
    const to = slot.getBoundingClientRect();
    if (!to.width || !to.height) { done(); return; }

    const { clone, rect } = flyer;
    document.body.appendChild(clone);

    /* An unresolved blank is not a box, it is a 2px underline sitting on
       the baseline — so aiming at the centre of its rect drops the tag half
       a line too low. The tag that replaces it straddles that baseline, and
       measuring one puts its centre 0.31em above the underline. Aim there,
       and the clone is standing where its replacement appears. */
    const fontSize = parseFloat(getComputedStyle(slot).fontSize) || 17;
    const toCx = to.left + to.width / 2;
    const toCy = to.bottom - fontSize * 0.31;

    const dx = toCx - (rect.left + rect.width / 2);
    const dy = toCy - (rect.top + rect.height / 2);
    /* Shrink toward the width of the gap being filled, not the height of
       it. A belt tag is tall because of the confidence bar and the fleet
       tally, and both of those fade out on the way over — scaling to match
       heights therefore shrinks the word itself to about a third of the
       prose around it, and what arrives is illegible. Widths compare like
       with like: a tag is mostly its word, and so is the blank. */
    const scale = Math.min(0.95, Math.max(0.55, to.width / rect.width));

    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      clearTimeout(timer);
      clone.removeEventListener('transitionend', onEnd);
      clone.remove();
      done();
    };
    /* transitionend bubbles, and the confidence bar and fleet tally inside
       the tag are fading on their own shorter clock — without this filter
       the first of those to finish would land the word early and snatch it
       out of the air halfway across. Only the clone's own transform counts
       as arriving. */
    const onEnd = (e) => {
      if (e.target === clone && e.propertyName === 'transform') land();
    };
    const timer = setTimeout(land, FLY_MS + 140);
    clone.addEventListener('transitionend', onEnd);

    // force the starting position to be computed before the target is set,
    // or the browser coalesces the two and there is nothing to transition
    // between — the tag would teleport. Same idiom as fbShow().
    void clone.offsetWidth;
    clone.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(' + scale + ')';
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
    if (isMobileLayout()) { releaseOptions(); return; }
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

  function resolve(pick, tagEl) {
    if (!awaiting) return;
    awaiting = false;
    resolving = true;
    const list = pendingList || [];
    fbHint('');
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }

    const tok = tokens[cursor];
    const slot = nodes[cursor];
    const hit = pick === tok.word;

    // captured while the tag is still standing there — clearBelt() is about
    // to remove the original out from under the animation
    const flyer = captureFlyer(tagEl);
    clearBelt();

    const bits = Model.surprisal(list, tok.word);
    docBits.push(bits);

    const finish = () => {
      slot.textContent = tok.text;
      slot.classList.add('shown', hit ? 'pt-hit' : 'pt-corrected');
      Model.read(tok.word);
      updateVocab();
      resolving = false;
      cursor++;
      revealTimer = setTimeout(readOn, SETTLE_MS);
    };

    /* Everything the blank does happens on arrival, not on the click: the
       word is in the air until then, and a verdict that landed first would
       be reacting to something the player can still see travelling. When
       there is no flight (no tag, or reduced motion) this runs immediately
       and the timing is exactly what it was before. */
    const land = () => {
      // the clock can run out while a word is still in the air, and
      // finishDocument() will already have revealed this blank and closed
      // the document — there is nothing left here to resolve
      if (!docActive) return;

      // the blank stays lit until the word reaches it, so the thing the
      // player aimed at is visibly the thing it lands in
      slot.classList.remove('active');
      setMeter(bits);
      if (pick !== null) Audio2.thunk();

      if (hit) {
        streak++;
        hits++;
        docHits++;
        if (streak > bestStreak) bestStreak = streak;
        // the blip climbs a semitone per consecutive correct — a streak is
        // something you can hear coming
        Audio2.yes(streak - 1);
        if (!firstCorrect) { firstCorrect = true; fbTicket('first one right ✓'); }
        else if (streak === 3) fbTicket('3 in a row');
        else if (streak === 6) fbTicket('6 in a row!');
        finish();
      } else if (pick === null) {
        // nothing picked: no sentence to read out, straight to the correction
        streak = 0;
        slot.textContent = '…';
        slot.classList.add('shown', 'pt-miss');
        Audio2.no();
        revealTimer = setTimeout(() => { slot.classList.remove('pt-miss'); finish(); }, 700);
      } else {
        // The wrong sentence gets read as written before the text corrects
        // it: "He wore a gold pond" sits there, deadpan, for a beat. Being
        // wrong is the game's most common event — it should land as a small
        // joke, not a punishment. The buzz waits for the strikethrough.
        streak = 0;
        slot.textContent = pick;
        slot.classList.add('shown');
        revealTimer = setTimeout(() => {
          slot.classList.add('pt-miss');
          Audio2.no();
          // The very first blank of the act carries a fleet chip that
          // dwarfs everything else on it — "crown ×1074", the README's own
          // flagship example of a gold-tinted tag — sitting at the front of
          // an almost-empty belt. It's the single most tempting wrong answer
          // in the whole game, and it's wrong on the very first thing the
          // player ever does. That's worth a line of its own, timed to the
          // strikethrough — the moment the pick is "marked as wrong"
          // (issue #52) — rather than the generic deadpan-and-correct every
          // other miss gets.
          if (askingFirstBlank && pick === 'crown') fbTicket('The Crown isn’t a pub.');
          revealTimer = setTimeout(() => { slot.classList.remove('pt-miss'); finish(); }, 650);
        }, 900);
      }
    };

    flyToBlank(flyer, slot, land);
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
      nodes[cursor].classList.remove('active');
      nodes[cursor].classList.add('shown');
      if (tok.blank) {
        docBits.push(UNSEEN_BITS);
        nodes[cursor].classList.add('pt-unanswered');
        streak = 0;
      }
      Model.read(tok.word);
      cursor++;
    }
    updateVocab();
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
    resolving = false;
    clearBelt();

    // the document gets its stamp — a small physical full-stop on each of
    // the ten, in the same ink as the QC approval
    $('pt-stamp').classList.add('hit');
    Audio2.stamp();

    const avg = docBits.length ? docBits.reduce((a, b) => a + b, 0) / docBits.length : 0;
    curve.push(avg);
    // the bar grows in under the stamp, and says what it means underneath.
    // The share right counts every blank in the document, so a clock run
    // down to nothing costs the player exactly as much as guessing badly.
    const docBlanks = tokens.filter(t => t.blank).length;
    const rate = docBlanks ? docHits / docBlanks : 0;
    renderCurve(true);
    // the verdict and the way out share one card: the sub-line names the
    // gesture, because "next one shortly" described a timer the player was
    // waiting on and this describes a thing they can do
    fbVerdict(curveVerdict(rate),
      isMobileLayout() ? 'finished document — tap to move on'
                       : 'finished document — tap or press space to move on');
    prevRate = rate;

    // However the document ended, the player has not read it: the reveal
    // runs far faster than anyone reads, and the clock-out and skip paths
    // dump the remaining text on screen all at once. So hold it up, and
    // leave both ways out live for anyone already finished with it. The
    // way out itself is named on the verdict card's sub-line above.
    $('pt-skip').disabled = false;
    pauseStartedAt = performance.now();
    pauseTimer = setTimeout(nextDoc, READ_PAUSE_MS);
  }

  function nextDoc() {
    if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
    $('pt-skip').disabled = true;
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

  /* ---------- the feedback slot ----------

     Every transient message the act prints — verdicts, milestone tickets,
     hints — goes through here into the one element under the document.
     They used to be three elements in three places (beside the sparkline,
     floating over the belt, under the belt), each rare enough that no
     player ever learned any of the locations, and playtesting found most
     of them going unread (issue #55). Feedback that belongs to the action
     itself — the deadpan wrong word, the stamp, the meter — never routes
     through this; it happens where the action is.

     The pecking order is verdict > ticket > hint. In practice they barely
     collide: hints are cleared before any blank resolves, so a ticket
     never actually interrupts one, and tickets can't fire during the hold
     a verdict occupies. The guards are for the orderings the code doesn't
     currently produce. */

  function fbShow(kind, main, sub) {
    const box = $('pt-feedback');
    if (!box) return;
    if (fbTimer) { clearTimeout(fbTimer); fbTimer = null; }
    fbKind = kind;
    box.className = 'pt-feedback fb-' + kind;
    $('pt-fb-main').textContent = main;
    $('pt-fb-sub').textContent = sub || '';
    void box.offsetWidth;
    box.classList.add('show');
  }

  function fbClear() {
    const box = $('pt-feedback');
    if (!box) return;
    if (fbTimer) { clearTimeout(fbTimer); fbTimer = null; }
    fbKind = null;
    box.className = 'pt-feedback';
    $('pt-fb-main').textContent = '';
    $('pt-fb-sub').textContent = '';
  }

  /* the read on the document that just finished; owns the slot until the
     next document starts */
  function fbVerdict(text, sub) { fbShow('verdict', text, sub); }

  /* milestones: first-ever correct, streaks. Briefly borrows the slot. */
  function fbTicket(msg) {
    if (fbKind === 'verdict') return;
    fbShow('ticket', msg);
    Audio2.ding();
    fbTimer = setTimeout(fbClear, 2200);
  }

  /* quiet instructions. Never talks over anything; '' retracts only a hint,
     so clearing one can't wipe a verdict that arrived in the meantime */
  function fbHint(text) {
    if (!text) { if (fbKind === 'hint') fbClear(); return; }
    if (fbKind && fbKind !== 'hint') return;
    fbShow('hint', text);
  }

  /* The vocabulary counter ticks up live as the model reads. It starts
     above zero: the fleet's seed pairs are words this node already knows
     before its first document, which is honest. */
  /* The counter is the act's quietest explainer and the one a player who
     skimmed the intro card most needs (issue #55): it is the only thing on
     screen saying the model is *acquiring* something rather than just being
     marked. So it bumps when it changes. Motion is what gets noticed —
     making the number bigger alone did not, because nothing drew the eye to
     it at the moment it meant something.

     Guarded on the value actually changing: updateVocab() runs after every
     word read, and re-triggering the animation on every one would leave it
     permanently mid-bump, which reads as a flicker rather than as an event. */
  let lastVocabN = -1;
  function updateVocab() {
    const n = $('pt-vocab-n');
    if (!n) return;
    const v = Object.keys(Model.stats().freq).length;
    if (v === lastVocabN) return;
    const first = lastVocabN === -1;
    lastVocabN = v;
    n.textContent = v;
    if (first) return;      // the fleet's seed words aren't a thing that just happened
    n.classList.remove('bump');
    void n.offsetWidth;
    n.classList.add('bump');
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

  /* The floor is legibility, not data. The whole chart is 30px tall, so a
     document the model got exactly right — which the last one now is, every
     time — rounded to a bar 1px high and read as an empty slot: the
     strongest result in the act looked like missing data. At this floor it
     reads as what it is, a very short bar in the win colour, since the
     gradient ends green at the bottom. */
  function barHeight(bits) {
    return Math.max(12, Math.round(bits / UNSEEN_BITS * 100)) + '%';
  }

  /* One bar per document: the average surprise across its blanks. This is
     the loss curve, and watching it fall is the point of the act.

     The slots are built once and then only their heights change. Rebuilding
     the row each time — which is what this used to do — meant every bar was
     created already at its final height, so the CSS transition on it never
     had two values to move between and the chart just silently reassembled
     itself. The one bar that matters, the one that just landed, now grows
     from nothing. */
  function renderCurve(landing) {
    const wrap = $('pt-curve');
    if (wrap.childElementCount !== SNIPPETS.length) {
      wrap.innerHTML = '';
      for (let i = 0; i < SNIPPETS.length; i++) {
        const slot = el('span', 'pt-curve-slot');
        slot.appendChild(el('span', 'pt-curve-bar'));
        wrap.appendChild(slot);
      }
    }
    const bars = wrap.querySelectorAll('.pt-curve-bar');
    curve.forEach((bits, i) => {
      const bar = bars[i];
      const height = barHeight(bits);
      bar.classList.add('done');
      if (landing && i === curve.length - 1) {
        bar.style.height = '0%';
        void bar.offsetWidth;   // give the transition a value to start from
      }
      bar.style.height = height;
    });
  }

  /* The one-line read on the bar that just landed. The chart says how far
     off each document was; this says what changed, which is the thing the
     act is actually about and the thing a row of small bars is worst at
     showing. Same plain register as the meter's own labels — no numbers, no
     units, nothing that needs the word "loss". */
  /* A document that opens a subject nothing before it touched. Keyed to an
     absolute score rather than to the drop from the previous document,
     because the drop is a knife edge: the flight manual scores 4.67 against
     the storybook's 3.5, and a threshold tuned on the rounded 4.7 in my head
     missed the real number by three hundredths and stayed silent on exactly
     the document it was written for. Against the score there is real room —
     every ordinary document in the corpus sits at 3.5 or below, and all
     three domain shifts at 4.67 or above. `node check.js` prints the curve
     if it ever needs moving. */
  const NEW_SUBJECT_BITS = 4;

  /* The voice here is the only place in the act that is rude to the player,
     and it can afford to be: nothing it says changes anything, the model is
     a machine, and being told off by the machinery is funnier than being
     congratulated by it. It only ever mocks the score, never the person.

     It reads the player's ANSWERS, not the bar above it. Those are different
     measurements and it matters which one is speaking. The bar is surprisal:
     how far down its own ranked list the model had to go to find the word the
     document actually used. That is computed before the player clicks
     anything and never looks at what they chose — which is correct for a loss
     curve, since the model reads the true word either way and its learning
     does not depend on the human guessing well, but it also means the bar is
     identical for everyone who ever plays. Copy that says "that sucked a
     little less" while measuring that is commenting on nothing the player
     did: answer deliberately wrong and it congratulated you for improving.

     One line stays keyed to the bar, deliberately. A document opening a
     subject nothing before it touched is a fact about the corpus, and on
     those the player mostly could not have done better whatever they picked
     — so that verdict blames the model instead of them. */
  /* Each branch is a small pool rather than one fixed string. The act runs
     ten documents and the flat "no change" branch alone can come up six
     times; a line that good, repeated that often, stops reading as a voice
     and starts reading as a bug. Pools also give a second playthrough
     something the first didn't have.

     `pickVerdict` never returns the line it returned last, so a repeat is
     never back to back — which is the only repetition the player notices. */
  let lastVerdict = null;
  function pickVerdict(lines) {
    const fresh = lines.filter(l => l !== lastVerdict);
    const pool = fresh.length ? fresh : lines;
    lastVerdict = pool[Math.floor(Math.random() * pool.length)];
    return lastVerdict;
  }

  const VERDICTS = {
    first: [
      'Baby’s first book!',
      'One down. Real models do this a billion more times.',
      'You have now read a thing. Congratulations.'
    ],
    // the domain shift: blames the corpus, never the player, because on
    // these they mostly could not have done better whatever they picked
    newSubject: [
      'Blimey, you’re hardly Fable are you?',
      'None of that was in the reading.',
      'New subject. You had nothing, and it showed.',
      'In fairness, nobody told you about any of that.'
    ],
    perfect: [
      'Well done, Robot',
      'All of them. Enjoy it.',
      'Flawless. Suspicious, but flawless.'
    ],
    good: [
      'Look at you, nearly useful',
      'Mostly right. Mostly.',
      'That is very nearly competence.'
    ],
    // nothing right, on a document where something was gettable. Its own
    // branch because otherwise a player having a bad run — or testing whether
    // this thing is listening at all — gets told six times running that
    // nothing has changed, which is true and useless.
    shutout: [
      'Not one. Not a single one.',
      'Nothing. Not a sausage.',
      'A clean sheet, the wrong way round.'
    ],
    better: [
      'That sucked a little less, I guess',
      'Better. Don’t make a thing of it.',
      'Upward. Barely, but upward.'
    ],
    worse: [
      'Worse. Actively worse.',
      'That is a step backwards.',
      'You had it. You have since lost it.'
    ],
    same: [
      'Same as last time. Riveting.',
      'Identical. Riveting.',
      'No change. None whatsoever.'
    ]
  };

  function curveVerdict(rate) {
    const bits = curve[curve.length - 1];
    if (curve.length === 1) return pickVerdict(VERDICTS.first);
    if (curve[curve.length - 2] < bits && bits >= NEW_SUBJECT_BITS) {
      return pickVerdict(VERDICTS.newSubject);
    }
    if (rate >= 1) return pickVerdict(VERDICTS.perfect);
    if (rate >= 0.6) return pickVerdict(VERDICTS.good);
    if (rate === 0) return pickVerdict(VERDICTS.shutout);
    if (prevRate === null) return pickVerdict(VERDICTS.same);
    if (rate > prevRate) return pickVerdict(VERDICTS.better);
    if (rate < prevRate) return pickVerdict(VERDICTS.worse);
    return pickVerdict(VERDICTS.same);
  }

  /* The training report, handed to the phase card that closes the act.
     The sparkline along the bottom of the act is small, unlabelled and
     easy to finish ten documents without ever having looked at; this is
     the same data at a size that admits it is the point.

     The first-to-last line is the whole act in one sentence, and it is
     built from the run rather than written down, so it stays true if the
     corpus changes. Everything else is counted, never estimated: a report
     that flattered the player would undo the honesty the act depends on. */
  function report() {
    const wrap = el('div', 'pt-report');

    const totalBlanks = SNIPPETS.reduce((n, s) =>
      n + s.body.join(' ').split(/\s+/).filter(c => /\[/.test(c)).length, 0);

    const stats = [
      ['documents read', String(curve.length)],
      ['words known', String(Object.keys(Model.stats().freq).length)],
      ['guessed right', hits + ' of ' + totalBlanks],
      ['best run', bestStreak > 1 ? bestStreak + ' in a row' : '—']
    ];
    // the chart leads: it sits directly under the paragraph describing it,
    // and on a phone the card scrolls, so anything below the stats would be
    // the one thing a player never sees
    const chart = el('div', 'pt-report-curve');
    curve.forEach(bits => {
      const slot = el('span', 'pt-curve-slot');
      const bar = el('span', 'pt-curve-bar done');
      bar.style.height = barHeight(bits);
      slot.appendChild(bar);
      chart.appendChild(slot);
    });
    wrap.appendChild(chart);

    const grid = el('div', 'pt-report-stats');
    stats.forEach(([label, value]) => {
      const cell = el('div', 'pt-report-stat');
      cell.appendChild(el('b', '', value));
      cell.appendChild(el('span', '', label));
      grid.appendChild(cell);
    });
    wrap.appendChild(grid);

    if (curve.length > 1) {
      wrap.appendChild(el('p', 'pt-report-line',
        'On your first document you were ' + farOffLabel(curve[0]) +
        '. On your last you were ' + farOffLabel(curve[curve.length - 1]) + '.'));
    }
    return wrap;
  }

  /* Tap the page (or press space) mid-reveal: jump the text straight to
     the next decision instead of waiting out the word-by-word pace. Does
     nothing while a blank is waiting to be answered or a miss beat is
     playing out — those are the moments the pacing exists for. Returns
     whether it acted, so the space handler knows whether to swallow the
     keypress. */
  function fastForward() {
    // During the hold on a finished document the same gesture means "read
    // it, move on" — otherwise the player is taught to tap their way
    // through the act and then hits a wall on all ten documents. The
    // guard window keeps the tap that revealed the last of the text from
    // carrying through and dismissing the pause it just created.
    if (!docActive) {
      if (!pauseTimer) return false;
      if (performance.now() - pauseStartedAt < PAUSE_TAP_GUARD_MS) return true;
      nextDoc();
      return true;
    }
    if (awaiting || resolving) return false;
    if (cursor >= tokens.length) return false;
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
    while (cursor < tokens.length && !tokens[cursor].blank) {
      nodes[cursor].classList.add('shown');
      Model.read(tokens[cursor].word);
      cursor++;
    }
    updateVocab();
    if (cursor >= tokens.length) { endDoc(); return true; }
    askBlank();
    return true;
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
      resolve(null);
      return;
    }
    fastForward();
  }

  function hasBlankAfter(idx) {
    for (let i = idx + 1; i < tokens.length; i++) if (tokens[i].blank) return true;
    return false;
  }

  return { start, skip, fastForward, report,
           model: () => Object.assign(Model.stats(), { curve }) };
})();
