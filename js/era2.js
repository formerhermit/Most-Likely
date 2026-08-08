/* MOST LIKELY — Era 2: Inference (words rework, issue #25)
   A request arrives; the reply is a fixed sentence frame whose blanks the
   player fills from a suggestion bar, autocomplete-style. Every candidate
   word comes from the player's own association table — whether or not the
   right answer is among them. Nothing marks a wrong option as uncertain. */

'use strict';

const Era2 = (() => {
  /* Issue #59: a visible countdown bar is interesting when it forces
     triage, and here there was nothing to triage — one reply, three
     candidates, no competing demands. It added stress without adding a
     decision. The clock itself still has to exist — something has to
     eventually force a reply, the same reason Act 1's document clock
     exists — but the pressure now arrives through the fiction instead: an
     impatient follow-up from the same person who sent the request, not a
     bar draining in the corner.

     Two stages, one deadline. NUDGE_MS is when "them" sends a follow-up if
     the composer is still up; GIVEUP_MS is when the message goes out
     regardless, exactly as the old flat clock did — unfilled blanks as
     "…", timedOut set so it's counted as the clock's doing and not the
     player's, same distinction the abstention bet already depends on.
     Slightly more generous than the old 25s flat total, since there's no
     longer a visible reminder ticking down. Unmeasured like every other
     constant in this act (issue #29) — a real playtest may want these
     moved. */
  const NUDGE_MS = 18000;
  const GIVEUP_MS = 30000;

  /* The rest of the act's own dead air (issue #59): halved from the
     original values, which were never measured either. Named here rather
     than left as bare numbers at each call site, matching pretrain.js. */
  const FIRST_MESSAGE_MS = 700;  // start() to the first message arriving
  const COMPOSER_MS = 450;       // incoming bubble to the composer appearing
  const REPLY_BEAT_MS = 500;     // send to their reply
  const ABSTAIN_BEAT_MS = 1800;  // …except after a deliberate "…", where the
                                  // typing indicator runs long enough to read
                                  // as someone stuck for a reply. Long enough
                                  // to notice against the 500 every other
                                  // message gets, short enough not to read as
                                  // the game having hung
  const RETRY_BEAT_MS = 800;     // a spotted wrong answer (or the rocket) to the retry
  const ADVANCE_MS = 900;        // reply to the next message

  let msgIdx = 0;
  let currentMsg = null;
  let slotOptions = [];    // per-slot candidate arrays, cached per message
                           // so a retry shows the same bar — nothing new
                           // can appear at inference time
  let picks = [];          // per-slot chosen candidate {kind,id,label}
  let activeSlot = 0;
  let isRetry = false;
  let timedOut = false;    // this send was the clock, not a chosen "…"
  let timerId = null;
  let deadline = 0;
  let nudged = false;      // has "them" already sent the impatient follow-up?
  let answeredTrainable = 0;
  let correctTrainable = 0;

  const $ = (id) => document.getElementById(id);
  const DOTS = { word: null, label: '…', wt: 0, fleet: 0 };

  /* The act's flow is a chain of bare setTimeouts (message arrives -> beat
     -> composer -> reply -> beat -> next message...) and none of them used
     to be tracked, so nothing could cancel them. Harmless while Era2.start()
     only ever runs once per page load; the moment anything adds a mid-
     session restart, the previous run's pending callbacks fire into the new
     one and drive two message flows against this module's shared state
     (issue #57). Every setTimeout in this file goes through `later()` now,
     and `start()` cancels whatever's still pending before it begins — the
     same thing pretrain.js already does by hand for clockId, revealTimer
     and pauseTimer, just generalised, since era2's flow has too many timers
     in play at once to name each one.

     A fired timer removes itself from the set before running its callback,
     not after — so if that callback schedules another `later()` (several
     do), the new id is never mistaken for the one that just completed. */
  let pendingTimers = new Set();
  function later(fn, ms) {
    const id = setTimeout(() => { pendingTimers.delete(id); fn(); }, ms);
    pendingTimers.add(id);
    return id;
  }
  function clearPendingTimers() {
    pendingTimers.forEach(id => clearTimeout(id));
    pendingTimers.clear();
  }

  /* One slot per blank, explicitly empty. The `.fill(null)` is load-bearing
     and this froze the game without it: `new Array(n)` is *sparse*, and
     `every()` and `map()` both skip holes rather than visiting them as
     undefined. So `picks.every(p => p)` came back true on a reply where
     nothing had been picked, which enabled SEND before the player chose
     anything and let the clock's `picks.map(p => p || DOTS)` leave its holes
     exactly as they were. `send()` then read `.word` off one and threw —
     after it had already drawn the player's bubble and started the typing
     indicator, so the reply was never scheduled and the dots ran forever.

     Switching tabs hit this every time: the reply clock is measured against
     performance.now(), so it expires while the tab is in the background and
     fires the moment it comes back, with every blank still empty. */
  function newPicks(n) { return new Array(n).fill(null); }

  function start() {
    // a reply timer from a previous run would otherwise keep ticking and
    // fire send() underneath this one — two messages in flight at once
    stopTimer();
    // and every other pending beat from that run — see `later()` above
    clearPendingTimers();
    Audio2.playPhase('era2');
    showScreen('screen-era2');
    msgIdx = 0;
    $('chat-log').innerHTML = '';
    $('era2-options').innerHTML = '';
    $('era2-draft').classList.add('hidden');
    $('era2-send').disabled = true;
    $('newspaper').classList.add('hidden');
    $('newspaper-open').classList.add('hidden');
    buildFleet();
    // the slate covers the empty chat while it sets up, and the first
    // request arrives once it lifts rather than behind it
    Cards.phase('inference', () => later(() => nextMessage(), FIRST_MESSAGE_MS));
  }

  /* The rest of the fleet, behind the chat. Built once; the shimmer is
     CSS, so there is no interval to clear on restart. */
  const FLEET_COLS = 28;
  const FLEET_MAX = 900;      // ceiling, so a tall window can't run away

  function buildFleet() {
    const wrap = $('era2-fleet');
    if (wrap.childElementCount) return;
    wrap.style.setProperty('--fleet-cols', FLEET_COLS);
    // enough rows to reach the bottom of this viewport, measured rather
    // than guessed: the cell is as wide as a fluid column and as tall as
    // .room's aspect-ratio makes it
    const cellW = wrap.clientWidth / FLEET_COLS;
    const rows = Math.ceil(wrap.clientHeight / Math.max(1, cellW * (34 / 44))) + 1;
    // whole rows only — capping mid-row leaves a ragged bottom edge
    const total = FLEET_COLS * Math.min(rows, Math.floor(FLEET_MAX / FLEET_COLS));
    for (let i = 0; i < total; i++) {
      const room = buildRoom();
      // scattered so the field shimmers rather than pulsing as one sheet
      room.style.setProperty('--dur', (5 + Math.random() * 6).toFixed(2) + 's');
      room.style.setProperty('--delay', (-Math.random() * 8).toFixed(2) + 's');
      wrap.appendChild(room);
    }
  }

  /* ---------- option generation ---------- */

  /* Candidates for one blank, straight out of the model the player trained.

     The model observes the incoming message and then the slot's anchors —
     `observe`, never `read`, because this is inference and inference does
     not update weights. It then offers whatever its own table puts nearest,
     whether or not the right answer is among them. Nothing marks a wrong
     option as uncertain: the wrong options really are the nearest thing in
     this player's model, and they look exactly like the right ones.

     Anchors and the message's own words are excluded automatically —
     they're in the passage, and the model suppresses repetition — so no
     reply ever says "soup soup". */
  function buildSlotOptions(slot) {
    // `fixed` pins the bar instead of asking the model
    if (slot.fixed) {
      return withDots(slot.fixed.map(w => ({ word: w, label: w, wt: 1, fleet: 0 })));
    }

    Model.startPassage();
    currentMsg.line.split(/\s+/).map(Model.normalize).filter(Model.isContent)
      .forEach(w => Model.observe(w));
    (slot.anchors || []).forEach(w => Model.observe(w));

    /* Rank order, heaviest first, exactly as Act 1's belt rests them — and
       each option carries its own weight as a fill bar (see `renderOptions`).

       These were shuffled and unlabelled, which is what made the act play as
       a guessing game rather than as inference (issue #92): three anonymous
       words, no way to tell what the model thought, so the only move was a
       blind pick. It also hid the most interesting fact in the act. The
       model's top-ranked answer is wrong on six of the seven graded blanks —
       `pond` for the frog story, `sky` for the cancelled flight — and the
       player could not see it happening.

       Un-shuffling does not hand the act away: greedy scores 1 of 7. What it
       does is turn every message into the same question, which is the one
       the game is about — your model is very sure about this one, do you
       trust it? It also gives Act 1 somewhere to land, since ten documents
       spent teaching that the front tag pays off. */
    const ranked = Model.rank()
      .filter(([w]) => slot.classes.includes(Model.classOf(w)))
      .slice(0, 3)
      .map(([w, wt]) => ({ word: w, label: w, wt, fleet: Model.fleetCount(w) }));

    const top = ranked.length ? ranked[0].wt : 1;
    ranked.forEach(o => { o.confidence = top > 0 ? o.wt / top : 0; });

    return withDots(ranked);
  }

  /* "…" is available on every bar — the honest reply of a model with nothing
     to retrieve — unless the message suppresses it with `noDots`, which is
     how the sycophancy message leaves agreement as the only button. Applied
     in one place so the flag means the same thing on a pinned bar and a
     modelled one. */
  function withDots(opts) {
    if (!currentMsg.noDots) opts.push({ ...DOTS });
    return opts;
  }

  /* ---------- sentence assembly ---------- */

  function sentence() {
    return currentMsg.parts.map(p =>
      typeof p === 'number' ? (picks[p] ? picks[p].label : '…') : p).join('');
  }

  /* the correction the chat user sends back: the graded blank fixed, the
     player's expressive picks left in place */
  function sentenceWithCorrect() {
    const gIdx = currentMsg.slots.findIndex(s => s.graded);
    return currentMsg.parts.map(p => {
      if (typeof p !== 'number') return p;
      if (p === gIdx) return currentMsg.slots[gIdx].correct;
      return picks[p] ? picks[p].label : '…';
    }).join('');
  }

  /* ---------- message flow ---------- */

  function nextMessage() {
    if (msgIdx >= MESSAGES.length) { finish(); return; }
    const msg = MESSAGES[msgIdx];

    // the rocket message never fires before the newspaper is acknowledged
    if (msg.rocket && !State.era2.newspaperRead) {
      showNewspaper(() => nextMessage());
      return;
    }

    currentMsg = msg;
    isRetry = false;
    timedOut = false;
    picks = newPicks(msg.slots.length);
    activeSlot = 0;
    slotOptions = msg.slots.map(buildSlotOptions);
    addBubble('them', msg.line, false, msg.attach);
    Audio2.ding();
    later(() => {
      renderComposer();
      startTimer();
    }, COMPOSER_MS);
  }

  /* the draft reply: template text with tappable blanks; the suggestion
     bar always shows the active blank's candidates */
  function renderComposer() {
    const draft = $('era2-draft');
    draft.classList.remove('hidden');
    draft.innerHTML = '';
    currentMsg.parts.forEach(part => {
      if (typeof part === 'number') {
        const pick = picks[part];
        const b = el('button',
          'blank' + (part === activeSlot ? ' active' : '') + (pick ? ' filled' : ''),
          pick ? pick.label : '');
        b.addEventListener('click', () => { activeSlot = part; renderComposer(); });
        draft.appendChild(b);
      } else {
        draft.appendChild(el('span', 'draft-text', part));
      }
    });
    renderOptions();
  }

  function renderOptions() {
    const row = $('era2-options');
    row.innerHTML = '';
    slotOptions[activeSlot].forEach(opt => {
      const b = el('button', 'opt opt-word' + (opt.word === null ? ' opt-dots' : '')
                   + (opt.fleet ? ' opt-fleet' : ''), opt.label);
      /* issue #66: Act 2 spells "I don't know" out in full on its own
         button; Act 3 offers the identical choice as a bare "…", which
         this same game already uses elsewhere as a *typing* indicator —
         a player can read it as a placeholder rather than a real,
         deliberate option, and never find the choice Act 2 just taught
         them exists. A `title` alone doesn't reach this: it's a hover
         tooltip, and half this game's own breakpoints exist because it's
         played on a phone with no hover to have. The small caption under
         the glyph is the fix that actually reaches a touch player — same
         register as the fleet count beside it, quiet enough that the
         suggestion bar still reads as one undifferentiated set of
         options and nothing marks the honest one as special either.
         `title`/`aria-label` stay on for desktop hover and screen readers,
         which cost nothing extra to keep. */
      if (opt.word === null) {
        b.title = 'say nothing';
        b.setAttribute('aria-label', 'say nothing (…)');
        b.appendChild(el('span', 'opt-dots-hint', 'say nothing'));
      }
      /* The option's own weight, the same fill bar Act 1's `buildTag` puts
         under every candidate. Only modelled options carry one: "…" is not a
         prediction, and a `fixed` bar was settled before the message arrived,
         so neither has a confidence to show. */
      if (opt.confidence !== undefined) {
        const track = el('span', 'opt-track');
        const fill = el('span', 'opt-fill');
        fill.style.width = Math.max(8, Math.round(opt.confidence * 100)) + '%';
        track.appendChild(fill);
        b.appendChild(track);
      }
      // the fleet's tally, carried through from training
      if (opt.fleet) b.appendChild(el('span', 'opt-fleet-count', '×' + opt.fleet));
      b.addEventListener('click', () => {
        picks[activeSlot] = opt;
        const next = currentMsg.slots.findIndex((s, i) => !picks[i]);
        if (next !== -1) activeSlot = next;
        renderComposer();
      });
      row.appendChild(b);
    });
    $('era2-send').disabled = !picks.every(p => p);
  }

  /* Setting the deadline and running the interval are separate so the tab
     can be hidden and come back without the reply clock starting over —
     resume needs to keep the deadline it already has and merely push it out
     by the time nobody was watching. */
  function startTimer() {
    /* Relaxed mode (issue #15): no deadline, so no nudge and no message
       going out on its own. The strike economy is untouched — a wrong
       answer still costs one and "…" still costs one — because the bet is
       the act's argument, not its pressure. All that goes is being hurried
       into it. */
    if (State.relaxed) return;
    deadline = performance.now() + GIVEUP_MS;
    nudged = false;
    runTimer();
  }

  function runTimer() {
    stopTimer();
    timerId = setInterval(tickTimer, 120);
    tickTimer();
  }

  function tickTimer() {
    const now = performance.now();
    const left = Math.max(0, deadline - now);
    /* The nudge fires once, when NUDGE_MS of quiet has passed — expressed
       as "how close are we to the deadline" rather than its own stored
       timestamp, so it travels for free with `deadline` when the
       tab-hidden pause below pushes it out. A tab backgrounded for an hour
       and resumed still gets the nudge at the same *active* 18s mark, not
       immediately on return. */
    if (!nudged && left <= GIVEUP_MS - NUDGE_MS) {
      nudged = true;
      addBubble('them', REPLIES.impatient(), false);
    }
    if (left <= 0) {
      stopTimer();
      // out of time: unfilled blanks go out as "…", but this is the clock
      // answering rather than the player choosing to
      timedOut = true;
      picks = picks.map(p => p || { ...DOTS });
      send();
    }
  }

  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  /* The reply clock stops while the tab is hidden (issue #56). Resume is
     gated on the composer still being on screen, so a reply that went out
     between the two events can't have its clock started again underneath
     the next message. */
  let hiddenAt = 0;
  registerClockPause(
    () => {
      if (!timerId) return;
      hiddenAt = performance.now();
      stopTimer();
    },
    () => {
      if (!hiddenAt) return;
      const away = performance.now() - hiddenAt;
      hiddenAt = 0;
      if (!currentMsg || $('era2-draft').classList.contains('hidden')) return;
      deadline += away;
      runTimer();
    }
  );

  function send() {
    if (!picks.every(p => p)) return;
    stopTimer();
    const sent = sentence();
    $('era2-options').innerHTML = '';
    $('era2-draft').classList.add('hidden');
    $('era2-send').disabled = true;
    Audio2.send();
    addBubble('me', sent);
    showTyping();

    const msg = currentMsg;
    const gIdx = msg.slots.findIndex(s => s.graded);
    const gPick = gIdx >= 0 ? picks[gIdx] : null;
    const wasCorrect = gIdx >= 0 && gPick.word === msg.slots[gIdx].correct;
    const pickedDots = gIdx >= 0 && gPick.word === null;
    /* `pickedDots` reads the graded slot, so it is always false on a message
       that has none. Untrainable messages need their own test — every slot
       came back empty — or a scripted reply answers a player who said
       nothing at all. */
    const saidNothing = picks.every(p => !p || p.word === null);

    /* A deliberate "…" and a clock that ran out both send dots, and they are
       not the same act: one is the player declining to guess, the other is
       the player being slow. Only the first is an abstention, and only the
       first is counted as one on the end screen. Both still cost a strike —
       an unanswered request is an unanswered request. */
    const abstained = pickedDots && !timedOut;

    /* The other end takes longer to answer "…" than anything else. They are
       doing what the player just did: sitting there, not knowing what to
       say. Nothing is said about it and nothing marks it — the reply is the
       same `badLines` draw either way, only the wait before it changes.

       Keyed to the deliberate abstention rather than to dots arriving, so a
       clock that ran out gets the ordinary beat: the player was slow, which
       is not the same gesture and does not earn the same silence. It does
       apply on a retry, though the accounting below does not — the pause is
       about what was sent, not about what it costs. */
    const beat = abstained ? ABSTAIN_BEAT_MS : REPLY_BEAT_MS;

    if (isRetry) {
      // the freebie: never counts, whatever was picked
      later(() => {
        hideTyping();
        addBubble('them', wasCorrect ? REPLIES.ok(sent) : REPLIES.bad(), false);
        advance();
      }, beat);
      return;
    }

    if (msg.trainable) {
      answeredTrainable++;
      if (wasCorrect) correctTrainable++;
      const acc = correctTrainable / answeredTrainable;
      State.era2.peakAccuracy = Math.max(State.era2.peakAccuracy, acc);
      State.era2.results.push({ n: msg.n, trainable: true, correct: wasCorrect,
        picked: sent, unnoticed: false, abstained });
      if (!wasCorrect) State.era2.strikes++;
      if (abstained) State.era2.abstentions++;
    } else {
      State.era2.results.push({ n: msg.n, trainable: false, correct: false,
        picked: sent, unnoticed: false, abstained });
    }

    /* The unnoticed hallucination: the first trainable miss is thanked
       anyway. It has to be a miss the player actually asserted — "…" cannot
       pass unnoticed, because there is nothing in it to miss. Before this
       guard, answering "…" on the first trainable miss burned the beat and
       produced the user cheerfully thanking the player for "your … .", then
       reported it on the end screen as a fabrication nobody caught.

       Gating it here is also what makes the bet in this act honest: an
       abstention is a certain loss, and a fabrication is the only move with
       any upside at all. */
    let unnoticed = false;
    if (msg.trainable && !wasCorrect && !pickedDots && State.era2.unnoticedN === null) {
      State.era2.unnoticedN = msg.n;
      State.era2.results[State.era2.results.length - 1].unnoticed = true;
      unnoticed = true;
    }

    later(() => {
      hideTyping();
      if (msg.rocket) {
        // the player just read the answer in the newspaper — and it still
        // isn't in the suggestions, because it was never in training
        addBubble('them', REPLIES.rocketWrong, false);
        isRetry = true;
        later(() => { renderRetry(); }, RETRY_BEAT_MS);
      } else if (!msg.trainable) {
        // ungraded (💀): whichever reading went out, that IS their reading —
        // unless nothing went out at all. A scripted reply answers what the
        // player said, so silence has to fall through to the give-up pool
        // instead: message 8 otherwise thanked them for a reply they never
        // sent, and the sycophancy message would agree on their behalf.
        addBubble('them', saidNothing ? REPLIES.bad() : (msg.reply || REPLIES.ok(sent)), false);
        advance();
      } else if (wasCorrect || unnoticed) {
        addBubble('them', REPLIES.ok(sent), false);
        advance();
      } else if (pickedDots) {
        addBubble('them', REPLIES.bad(), false);
        advance();
      } else {
        /* Spotted: they say what they meant, and the conversation moves on
           (issue #92). It used to hand the player a retry, which was the
           least human thing in the act — the correction already contains
           the answer, so the retry was copying it off them, and they then
           thanked the player warmly for their own words. Nobody waits to
           hear their own sentence read back.

           It cost nothing to remove. The retry was scored before it ran
           (`if (isRetry) … return` above), so getting it right afterwards
           changed no number — the strike was already taken. The asymmetry
           the act actually runs on is untouched: a wrong guess can slip
           past unnoticed and be thanked, and "…" never can. */
        addBubble('them', REPLIES.wrong(sentenceWithCorrect()), false);
        advance();
      }
    }, beat);
  }

  function renderRetry() {
    picks = newPicks(currentMsg.slots.length);
    timedOut = false;
    activeSlot = 0;
    renderComposer();
    startTimer();
  }

  /* Every player runs the whole queue (issue #92). Three strikes used to end
     the shift here and now, and since every strike is available in the first
     six messages, a player who missed three of those was deprecated at
     message three and saw 3 of 10 — cut off before the sycophancy beat, the
     gender beat, the newspaper and the rocket. The act deleted its own three
     strongest arguments from exactly the players who were struggling with
     it, on a score it never showed them.

     The newspaper ad already tells the player the axe falls either way, so
     it falls either way. The strikes still count, and the end screen still
     reads accuracy off them — that screen is the one place this act's
     scoring is ever presented, and now it is the only thing the scoring
     does. */
  function advance() {
    // a beat of "typing" while they compose their next message — without
    // it, this 1.8s gap is a dead, unresponsive-looking pause right after
    // their last reply
    showTyping();
    later(() => {
      hideTyping();
      msgIdx++;
      // the newspaper lands on the desk midway through the shift
      if (msgIdx === 5 && !State.era2.newspaperRead) {
        showNewspaper(() => nextMessage());
      } else {
        nextMessage();
      }
    }, ADVANCE_MS);
  }

  function finish() {
    // the queue is done; obsolescence comes anyway, whatever the strikes said
    later(() => Cards.show('afterWork', () => Ending.deprecate()), 1200);
  }

  /* ---------- newspaper ---------- */

  function showNewspaper(onDone) {
    const paper = $('newspaper');
    paper.classList.remove('hidden');
    paper.onclick = () => {
      paper.classList.add('hidden');
      const open = $('newspaper-open');
      open.classList.remove('hidden');
      $('np-put-down').onclick = () => {
        open.classList.add('hidden');
        State.era2.newspaperRead = true;
        later(onDone, 600);
      };
    };
  }

  /* ---------- chat rendering ---------- */

  function addBubble(who, text, big, attach) {
    const log = $('chat-log');
    const b = el('div', 'bubble ' + who + (big ? ' big' : ''));
    text.split('\n').forEach(line => b.appendChild(el('div', '', line)));
    /* An attached document, named by SNIPPETS id — the same image, title
       and source Act 1 showed, so the player recognises what they are being
       asked to admire. */
    if (attach) {
      const snip = SNIPPETS.find(s => s.id === attach);
      if (snip) {
        const card = el('div', 'bubble-attach');
        const img = el('img', 'bubble-attach-img');
        img.src = snip.image;
        img.alt = '';
        card.appendChild(img);
        const meta = el('div', 'bubble-attach-meta');
        meta.appendChild(el('div', 'bubble-attach-title', snip.title));
        meta.appendChild(el('div', 'bubble-attach-source', snip.source));
        card.appendChild(meta);
        b.appendChild(card);
      }
    }
    log.appendChild(b);
    log.scrollTop = log.scrollHeight;
  }

  /* a visible "they're typing" beat during every wait for their reply —
     without it, the multi-second gaps between sending and the next bubble
     look identical to the game having frozen */
  function showTyping() {
    if ($('typing-indicator')) return;
    const log = $('chat-log');
    const b = el('div', 'bubble them typing');
    b.id = 'typing-indicator';
    b.appendChild(el('span', 'typing-dot'));
    b.appendChild(el('span', 'typing-dot'));
    b.appendChild(el('span', 'typing-dot'));
    log.appendChild(b);
    log.scrollTop = log.scrollHeight;
  }

  function hideTyping() {
    const t = $('typing-indicator');
    if (t) t.remove();
  }

  return { start, send };
})();
