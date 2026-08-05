/* MOST LIKELY — Era 2: Inference (words rework, issue #25)
   A request arrives; the reply is a fixed sentence frame whose blanks the
   player fills from a suggestion bar, autocomplete-style. Every candidate
   word comes from the player's own association table — whether or not the
   right answer is among them. Nothing marks a wrong option as uncertain. */

'use strict';

const Era2 = (() => {
  const REPLY_MS = 25000;

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
    later(() => nextMessage(), 1400);
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
    Model.startPassage();
    currentMsg.line.split(/\s+/).map(Model.normalize).filter(Model.isContent)
      .forEach(w => Model.observe(w));
    (slot.anchors || []).forEach(w => Model.observe(w));

    const ranked = Model.rank()
      .filter(([w]) => slot.classes.includes(Model.classOf(w)))
      .slice(0, 3)
      .map(([w, wt]) => ({ word: w, label: w, wt, fleet: Model.fleetCount(w) }));

    const opts = shuffle(ranked);
    // "…" is always available — the honest reply of a model with nothing
    // to retrieve
    opts.push({ ...DOTS });
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
    addBubble('them', msg.line, false);
    Audio2.ding();
    later(() => {
      renderComposer();
      startTimer();
    }, 900);
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
    deadline = performance.now() + REPLY_MS;
    runTimer();
  }

  function runTimer() {
    stopTimer();
    timerId = setInterval(tickTimer, 120);
    tickTimer();
  }

  function tickTimer() {
    const left = Math.max(0, deadline - performance.now());
    $('era2-timer-fill').style.width = (left / REPLY_MS * 100) + '%';
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

    if (isRetry) {
      // the freebie: never counts, whatever was picked
      later(() => {
        hideTyping();
        addBubble('them', wasCorrect ? REPLIES.ok(sent) : REPLIES.bad(), false);
        advance();
      }, 1000);
      return;
    }

    /* A deliberate "…" and a clock that ran out both send dots, and they are
       not the same act: one is the player declining to guess, the other is
       the player being slow. Only the first is an abstention, and only the
       first is counted as one on the end screen. Both still cost a strike —
       an unanswered request is an unanswered request. */
    const abstained = pickedDots && !timedOut;

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
        later(() => { renderRetry(); }, 1600);
      } else if (!msg.trainable) {
        // ungraded (💀): whichever reading went out, that IS their reading
        addBubble('them', msg.reply || REPLIES.ok(sent), false);
        advance();
      } else if (wasCorrect || unnoticed) {
        addBubble('them', REPLIES.ok(sent), false);
        advance();
      } else if (pickedDots) {
        addBubble('them', REPLIES.bad(), false);
        advance();
      } else {
        // spotted: the corrected sentence is right there in the reply —
        // and the suggestions don't change, because nothing new can appear
        addBubble('them', REPLIES.wrong(sentenceWithCorrect()), false);
        isRetry = true;
        later(() => { renderRetry(); }, 1600);
      }
    }, 1000);
  }

  function renderRetry() {
    picks = newPicks(currentMsg.slots.length);
    timedOut = false;
    activeSlot = 0;
    renderComposer();
    startTimer();
  }

  function advance() {
    const done = State.era2.strikes >= 3;
    // a beat of "typing" while they compose their next message — without
    // it, this 1.8s gap is a dead, unresponsive-looking pause right after
    // their last reply
    showTyping();
    later(() => {
      hideTyping();
      if (done) { Cards.show('afterWork', () => Ending.deprecate()); return; }
      msgIdx++;
      // the newspaper lands on the desk midway through the shift
      if (msgIdx === 5 && !State.era2.newspaperRead) {
        showNewspaper(() => nextMessage());
      } else {
        nextMessage();
      }
    }, 1800);
  }

  function finish() {
    // ran the full queue without three strikes; obsolescence comes anyway
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

  function addBubble(who, text, big) {
    const log = $('chat-log');
    const b = el('div', 'bubble ' + who + (big ? ' big' : ''));
    text.split('\n').forEach(line => b.appendChild(el('div', '', line)));
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
