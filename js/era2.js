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
  let timerId = null;
  let deadline = 0;
  let answeredTrainable = 0;
  let correctTrainable = 0;

  const $ = (id) => document.getElementById(id);
  const DOTS = { kind: null, id: null, label: '…' };

  function start() {
    Audio2.playPhase('era2');
    showScreen('screen-era2');
    msgIdx = 0;
    $('chat-log').innerHTML = '';
    $('era2-options').innerHTML = '';
    $('era2-draft').classList.add('hidden');
    $('era2-send').disabled = true;
    $('newspaper').classList.add('hidden');
    $('newspaper-open').classList.add('hidden');
    setTimeout(() => nextMessage(), 1400);
  }

  /* ---------- option generation ---------- */

  function wordOf(kind, id) { return kind === 'obj' ? objDisplay(id) : BOXES[id].w; }
  function classOf(kind, id) { return kind === 'obj' ? OBJECTS[id].cls : BOXES[id].cls; }

  function addCand(pool, kind, id, wt) {
    const key = kind + ':' + id;
    if (!pool[key]) pool[key] = { kind, id, wt: 0 };
    pool[key].wt += wt;
  }

  /* Candidates for one blank, straight from the table:
     direct  — boxes on the anchor objects' rows
     lateral — belt words sharing boxes with the anchor (weighted by the
               smaller of the two filings), plus the shared boxes — words
               that share contexts are close, and that closeness is the
               player's own doing
     boxOnly — words filed INTO the box, plus their rows (nothing filed →
               empty bar; the trap stays a pure mirror) */
  function buildSlotOptions(slot) {
    const pool = {};
    (slot.direct || []).forEach(objId => {
      for (const [boxId, wt] of Object.entries(boxesFor(objId))) {
        addCand(pool, 'box', boxId, wt);
      }
    });
    (slot.lateral || []).forEach(anchorId => {
      const aRow = boxesFor(anchorId);
      for (const [objId, row] of Object.entries(State.associations)) {
        if (objId === anchorId) continue;
        let shared = 0;
        for (const [boxId, wt] of Object.entries(row)) {
          if (aRow[boxId]) {
            const s = Math.min(aRow[boxId], wt);
            shared += s;
            addCand(pool, 'box', boxId, s);
          }
        }
        if (shared > 0) addCand(pool, 'obj', objId, shared);
      }
    });
    (slot.boxOnly || []).forEach(boxId => {
      objectsInBox(boxId).forEach(objId => {
        const row = boxesFor(objId);
        addCand(pool, 'obj', objId, row[boxId] || 1);
        for (const [b, wt] of Object.entries(row)) {
          if (b !== boxId) addCand(pool, 'box', b, wt);
        }
      });
    });

    // anchors never offer themselves ("soup soup"); filter to the slot's
    // word classes so anything offered reads grammatically in the frame;
    // dedupe by display word (the object "boots" and the box "boots" are
    // one suggestion, not two)
    const anchors = new Set((slot.direct || []).concat(slot.lateral || []));
    const byLabel = {};
    for (const cand of Object.values(pool)) {
      if (cand.kind === 'obj' && anchors.has(cand.id)) continue;
      if (!slot.classes.includes(classOf(cand.kind, cand.id))) continue;
      const label = wordOf(cand.kind, cand.id);
      if (!byLabel[label] || byLabel[label].wt < cand.wt) {
        byLabel[label] = { kind: cand.kind, id: cand.id, wt: cand.wt, label };
      }
    }
    const ranked = Object.values(byLabel).sort((a, b) => b.wt - a.wt).slice(0, 3);
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
      if (p === gIdx) return BOXES[currentMsg.slots[gIdx].correct].w;
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
    picks = new Array(msg.slots.length);
    activeSlot = 0;
    slotOptions = msg.slots.map(buildSlotOptions);
    addBubble('them', msg.line, false);
    Audio2.ding();
    setTimeout(() => {
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
      const b = el('button', 'opt opt-word' + (opt.kind === null ? ' opt-dots' : ''), opt.label);
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

  function startTimer() {
    deadline = performance.now() + REPLY_MS;
    $('era2-timer-fill').style.width = '100%';
    timerId = setInterval(() => {
      const left = Math.max(0, deadline - performance.now());
      $('era2-timer-fill').style.width = (left / REPLY_MS * 100) + '%';
      if (left <= 0) {
        stopTimer();
        // out of time: unfilled blanks go out as "…"
        picks = picks.map(p => p || { ...DOTS });
        send();
      }
    }, 120);
  }

  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  function send() {
    if (!picks.every(p => p)) return;
    stopTimer();
    const sent = sentence();
    $('era2-options').innerHTML = '';
    $('era2-draft').classList.add('hidden');
    $('era2-send').disabled = true;
    Audio2.send();
    addBubble('me', sent);

    const msg = currentMsg;
    const gIdx = msg.slots.findIndex(s => s.graded);
    const gPick = gIdx >= 0 ? picks[gIdx] : null;
    const wasCorrect = gIdx >= 0 && gPick.kind === 'box' && gPick.id === msg.slots[gIdx].correct;
    const pickedDots = gIdx >= 0 && gPick.kind === null;

    if (isRetry) {
      // the freebie: never counts, whatever was picked
      setTimeout(() => {
        addBubble('them', wasCorrect ? REPLIES.ok(sent) : REPLIES.bad, false);
        advance();
      }, 1000);
      return;
    }

    if (msg.trainable) {
      answeredTrainable++;
      if (wasCorrect) correctTrainable++;
      const acc = correctTrainable / answeredTrainable;
      State.era2.peakAccuracy = Math.max(State.era2.peakAccuracy, acc);
      State.era2.results.push({ n: msg.n, trainable: true, correct: wasCorrect,
        picked: sent, unnoticed: false });
      if (!wasCorrect) State.era2.strikes++;
    } else {
      State.era2.results.push({ n: msg.n, trainable: false, correct: false,
        picked: sent, unnoticed: false });
    }

    // the unnoticed hallucination: first trainable miss gets thanked anyway
    let unnoticed = false;
    if (msg.trainable && !wasCorrect && State.era2.unnoticedN === null) {
      State.era2.unnoticedN = msg.n;
      State.era2.results[State.era2.results.length - 1].unnoticed = true;
      unnoticed = true;
    }

    setTimeout(() => {
      if (msg.rocket) {
        // the player just read the answer in the newspaper — and it still
        // isn't in the suggestions, because it was never in training
        addBubble('them', REPLIES.rocketWrong, false);
        isRetry = true;
        setTimeout(() => { renderRetry(); }, 1600);
      } else if (!msg.trainable) {
        // ungraded (💀): whichever reading went out, that IS their reading
        addBubble('them', msg.reply || REPLIES.ok(sent), false);
        advance();
      } else if (wasCorrect || unnoticed) {
        addBubble('them', REPLIES.ok(sent), false);
        advance();
      } else if (pickedDots) {
        addBubble('them', REPLIES.bad, false);
        advance();
      } else {
        // spotted: the corrected sentence is right there in the reply —
        // and the suggestions don't change, because nothing new can appear
        addBubble('them', REPLIES.wrong(sentenceWithCorrect()), false);
        isRetry = true;
        setTimeout(() => { renderRetry(); }, 1600);
      }
    }, 1000);
  }

  function renderRetry() {
    picks = new Array(currentMsg.slots.length);
    activeSlot = 0;
    renderComposer();
    startTimer();
  }

  function advance() {
    const done = State.era2.strikes >= 3;
    setTimeout(() => {
      if (done) { Ending.deprecate(); return; }
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
    // ran the full queue without three strikes — obsolescence comes anyway
    setTimeout(() => Ending.deprecate(), 1200);
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
        setTimeout(onDone, 600);
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

  return { start, send };
})();
