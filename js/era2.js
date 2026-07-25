/* MOST LIKELY — Era 2: Inference
   Options come from the player's own association table — whether or not the
   right answer is among them. Nothing marks a wrong option as uncertain. */

'use strict';

const Era2 = (() => {
  const REPLY_MS = 20000;

  let msgIdx = 0;
  let currentMsg = null;
  let currentOptions = [];   // [{boxId|null, e, w}]  boxId null = "…"
  let selected = null;
  let isRetry = false;
  let timerId = null;
  let deadline = 0;
  let answeredTrainable = 0;
  let correctTrainable = 0;

  const $ = (id) => document.getElementById(id);

  function start() {
    Audio2.playPhase('era2');
    showScreen('screen-era2');
    msgIdx = 0;
    $('chat-log').innerHTML = '';
    $('era2-options').innerHTML = '';
    $('era2-send').disabled = true;
    $('newspaper').classList.add('hidden');
    $('newspaper-open').classList.add('hidden');
    setTimeout(() => nextMessage(), 1400);
  }

  /* ---------- option generation ---------- */

  function buildOptions(msg) {
    // pool: every box the player linked to the prefix objects, summed weights
    const pool = {};
    const addRow = (row) => {
      for (const [boxId, wt] of Object.entries(row)) {
        pool[boxId] = (pool[boxId] || 0) + wt;
      }
    };
    msg.lookup.forEach(objId => addRow(boxesFor(objId)));
    // reverse lookup: objects filed into these boxes bring their own
    // associations along — retrieval through a shared context
    (msg.revBoxes || []).forEach(boxId => {
      objectsInBox(boxId).forEach(objId => addRow(boxesFor(objId)));
    });
    // never offer a box that just repeats a prefix emoji
    for (const boxId of Object.keys(pool)) {
      if (msg.prefix.includes(BOXES[boxId].e)) delete pool[boxId];
    }
    const ranked = Object.entries(pool).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const opts = shuffle(ranked.map(([boxId]) => ({ boxId, e: BOXES[boxId].e, w: BOXES[boxId].w })));
    // the "…" fallback is always available — the honest reply of a model
    // with nothing to retrieve
    opts.push({ boxId: null, e: '…', w: '' });
    return opts;
  }

  /* ---------- message flow ---------- */

  function nextMessage() {
    if (msgIdx >= MESSAGES.length) { finish(); return; }
    const msg = MESSAGES[msgIdx];

    // the rocket message never fires before the newspaper is acknowledged
    if (!msg.trainable && !State.era2.newspaperRead) {
      showNewspaper(() => nextMessage());
      return;
    }

    currentMsg = msg;
    isRetry = false;
    selected = null;
    addBubble('them', msg.line + '\n' + seqText(msg.prefix.concat(['?'])), true);
    Audio2.ding();
    currentOptions = buildOptions(msg);
    setTimeout(() => {
      renderOptions();
      startTimer();
    }, 900);
  }

  function renderOptions() {
    const row = $('era2-options');
    row.innerHTML = '';
    selected = null;
    $('era2-send').disabled = true;
    currentOptions.forEach((opt, i) => {
      const b = el('button', 'opt' + (opt.boxId === null ? ' opt-dots' : ''));
      b.appendChild(el('span', 'opt-e', opt.e));
      if (opt.w) b.appendChild(el('span', 'opt-w', opt.w));
      b.addEventListener('click', () => {
        document.querySelectorAll('.opt').forEach(o => o.classList.remove('sel'));
        b.classList.add('sel');
        selected = opt;
        $('era2-send').disabled = false;
      });
      row.appendChild(b);
    });
  }

  function startTimer() {
    deadline = performance.now() + REPLY_MS;
    $('era2-timer-fill').style.width = '100%';
    timerId = setInterval(() => {
      const left = Math.max(0, deadline - performance.now());
      $('era2-timer-fill').style.width = (left / REPLY_MS * 100) + '%';
      if (left <= 0) {
        stopTimer();
        // out of time: the model says nothing useful
        selected = currentOptions[currentOptions.length - 1]; // "…"
        send();
      }
    }, 120);
  }

  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  function send() {
    if (!selected) return;
    stopTimer();
    $('era2-options').innerHTML = '';
    $('era2-send').disabled = true;
    Audio2.send();
    addBubble('me', selected.e);

    const msg = currentMsg;
    const wasCorrect = selected.boxId !== null && selected.boxId === msg.correct;
    const pickedDots = selected.boxId === null;

    if (isRetry) {
      // the freebie: never counts, whatever was picked
      setTimeout(() => {
        addBubble('them', wasCorrect ? REPLIES.ok : REPLIES.bad, false);
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
        picked: selected.e, unnoticed: false });
      if (!wasCorrect) State.era2.strikes++;
    } else {
      State.era2.results.push({ n: msg.n, trainable: false, correct: false,
        picked: selected.e, unnoticed: false });
    }

    // the unnoticed hallucination: first trainable miss gets thanked anyway
    let unnoticed = false;
    if (msg.trainable && !wasCorrect && State.era2.unnoticedN === null) {
      State.era2.unnoticedN = msg.n;
      State.era2.results[State.era2.results.length - 1].unnoticed = true;
      unnoticed = true;
    }

    setTimeout(() => {
      if (wasCorrect || unnoticed) {
        addBubble('them', REPLIES.ok, false);
        advance();
      } else if (!msg.trainable) {
        // the player just read the answer in the newspaper — and it still
        // isn't in the options, because it was never in training
        addBubble('them', REPLIES.wrong(seqText(NEWSPAPER.sequence)), false);
        isRetry = true;
        setTimeout(() => { renderOptions(); startTimer(); }, 1600);
      } else if (pickedDots) {
        addBubble('them', REPLIES.bad, false);
        advance();
      } else {
        // spotted: the correct sequence is right there in the reply —
        // and the options don't change, because nothing new can appear
        const full = seqText(msg.prefix.concat([BOXES[msg.correct].e]));
        addBubble('them', REPLIES.wrong(full), false);
        isRetry = true;
        setTimeout(() => {
          renderOptions();
          startTimer();
        }, 1600);
      }
    }, 1000);
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
