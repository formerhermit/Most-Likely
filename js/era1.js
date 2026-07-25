/* MOST LIKELY — Era 1: Training
   Popup (untimed) → boxes reveal → belt + round clock → drag to file.
   An object can be filed into the same box more than once — each repeat
   stacks that pair's weight higher (shown as a ×N badge on the chip)
   instead of being blocked.

   Belt mechanic: when the popup closes, every belt object for the snippet
   rolls in from the hatch and comes to rest partway across the belt,
   spaced out, and stays put. The round clock counts down from 1:00. At
   0:15 remaining, the belt releases — every object still resting starts
   sliding toward the end at a shared speed, so the one resting furthest
   back takes exactly the full 15 seconds and the ones ahead of it clear
   sooner. The belt is a direct expression of the clock: nothing moves
   until the release window, and everything is gone by the time it hits
   zero. Fall-offs are silent — no penalty message, the table just gains
   nothing from that object this round. */

'use strict';

const Era1 = (() => {
  const ROUND_DURATION_MS = 60000;
  const RELEASE_DURATION_MS = 15000;
  const ROLL_IN_DELAY_MS = 500;      // beat after the popup closes
  const ROLL_IN_STAGGER_MS = 350;    // gap between each object's arrival
  const ROLL_IN_DURATION_MS = 900;   // time for one object to slide to rest
  const REST_START_PCT = 0.46;       // frontmost resting spot — "about halfway"
  const REST_GAP_PCT = 0.11;         // spacing between resting objects

  let roundIdx = 0;
  let beltObjects = [];         // {objId, el, state}  state: queued|resting|held|releasing|gone
  let roundEndsAt = 0;
  let clockId = null;
  let roundActive = false;
  let released = false;        // has the belt started its final release?

  const $ = (id) => document.getElementById(id);

  /* ---------- round flow ---------- */

  function start() {
    roundIdx = 0;
    Audio2.playPhase('era1');
    showScreen('screen-era1');
    $('era1-round-label').textContent = 'ROUND 1 / ' + SNIPPETS.length;
    renderBlankBoxes();
    setClock(null);
    // let the room sit for a beat before the first popup (issue #2)
    setTimeout(showPopup, 2200);
  }

  function showPopup() {
    const snip = SNIPPETS[roundIdx];
    $('era1-round-label').textContent = 'ROUND ' + (roundIdx + 1) + ' / ' + SNIPPETS.length;
    $('popup-title').textContent = snip.title;
    const img = $('popup-image');
    img.src = snip.image;
    img.alt = snip.title;
    const textEl = $('popup-text');
    textEl.innerHTML = '';
    snip.text.forEach(line => textEl.appendChild(el('p', '', line)));
    $('popup-source').textContent = 'Source: ' + snip.source;
    $('popup').classList.remove('hidden');
  }

  function closePopup() {
    // guards against a double-click/double-tap on SORT: without this, a
    // second beginRound() before the first round's loop is torn down
    // leaves two timers sharing the same beltObjects state (issue #18)
    if (roundActive) return;
    $('popup').classList.add('hidden');
    renderBoxes(SNIPPETS[roundIdx]);
    beginRound();
  }

  /* empty label slots — the room before training data arrives */
  function renderBlankBoxes() {
    const grid = $('boxes');
    grid.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const box = el('div', 'box dim');
      const head = el('div', 'box-head');
      head.appendChild(el('span', 'box-slot'));
      box.appendChild(head);
      grid.appendChild(box);
    }
  }

  function renderBoxes(snip) {
    const grid = $('boxes');
    grid.innerHTML = '';
    snip.boxes.forEach(boxId => {
      const b = BOXES[boxId];
      const box = el('div', 'box');
      box.dataset.box = boxId;
      const head = el('div', 'box-head');
      head.appendChild(el('span', 'box-emoji', b.e));
      head.appendChild(el('span', 'box-word', b.w));
      box.appendChild(head);
      const chips = el('div', 'box-chips');
      chips.dataset.chips = boxId;
      box.appendChild(chips);
      // the fleet got here first: its piles sit in the box, heaviest first
      ghostsInBox(boxId).forEach(g => {
        chips.appendChild(makeGhostChip(g.objId, g.count));
      });
      // cross-round persistence: this player's earlier filings — unless
      // they were absorbed into a fleet pile (the +1s are in its counter)
      objectsInBox(boxId).forEach(objId => {
        if (ghostWeight(objId, boxId)) return;
        chips.appendChild(makeChip(objId, boxId));
      });
      grid.appendChild(box);
    });
  }

  function makeChip(objId, boxId) {
    const weight = boxesFor(objId)[boxId] || 1;
    const c = el('span', 'chip');
    c.dataset.obj = objId;
    c.appendChild(el('span', 'chip-e', OBJECTS[objId].e));
    if (weight > 1) c.appendChild(el('span', 'chip-count', '×' + weight));
    return c;
  }

  function makeGhostChip(objId, count) {
    const c = el('span', 'chip ghost');
    c.dataset.obj = objId;
    c.appendChild(el('span', 'chip-e', OBJECTS[objId].e));
    c.appendChild(el('span', 'chip-count', '×' + count));
    return c;
  }

  function bumpChipCount(chip, weight) {
    let badge = chip.querySelector('.chip-count');
    if (!badge) {
      badge = el('span', 'chip-count');
      chip.appendChild(badge);
    }
    badge.textContent = '×' + weight;
    chip.classList.remove('bump');
    void chip.offsetWidth;
    chip.classList.add('bump');
  }

  function beginRound() {
    const snip = SNIPPETS[roundIdx];
    roundActive = true;
    released = false;
    $('era1-skip').disabled = false;
    beltObjects = snip.belt.map(objId => ({ objId, el: null, state: 'queued' }));
    $('belt-surface').innerHTML = '';
    $('belt').classList.remove('paused');

    beltObjects.forEach((item, i) => {
      setTimeout(() => spawnAndRest(item, i), ROLL_IN_DELAY_MS + i * ROLL_IN_STAGGER_MS);
    });
    // the conveyor itself (not just the objects) visibly stops once
    // everything has arrived and rests, then resumes at the release —
    // "the belt stops... the belt starts again", not only the emojis
    const rollInTotal = ROLL_IN_DELAY_MS + (beltObjects.length - 1) * ROLL_IN_STAGGER_MS + ROLL_IN_DURATION_MS;
    setTimeout(() => {
      if (roundActive && !released) $('belt').classList.add('paused');
    }, rollInTotal);

    roundEndsAt = performance.now() + ROUND_DURATION_MS;
    clockId = setInterval(() => {
      const left = Math.max(0, roundEndsAt - performance.now());
      setClock(left);
      if (!released && left <= RELEASE_DURATION_MS) {
        released = true;
        $('belt').classList.remove('paused');
        releaseBelt();
      }
      // don't end the round out from under an active drag — a held item
      // is frozen mid-air and its drop hasn't resolved into a box yet, so
      // wiping beltObjects/boxes now would silently lose that placement
      // with no feedback to the player. Deferring to the next tick (up to
      // 250ms after the drag ends) is imperceptible.
      if (left <= 0 && !drag) endRound();
    }, 250);
  }

  /* grey-bezel display clock, red digits (issue #3) */
  function setClock(ms) {
    const clock = $('era1-clock');
    if (ms === null) { clock.textContent = '-:--'; return; }
    const s = Math.ceil(ms / 1000);
    clock.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* ---------- belt motion (CSS-transition driven, no per-frame loop) ---------- */

  function restLeftPx(index) {
    const surfaceWidth = $('belt-surface').clientWidth;
    const pct = Math.max(REST_START_PCT - index * REST_GAP_PCT, 0.06);
    return pct * surfaceWidth;
  }

  function spawnAndRest(item, index) {
    if (item.state !== 'queued') return;
    const node = el('div', 'belt-obj', OBJECTS[item.objId].e);
    node.dataset.obj = item.objId;
    $('belt-surface').appendChild(node);
    item.el = node;
    item.state = 'resting';
    attachDrag(item);
    // force a synchronous reflow so the browser registers the starting
    // (-60px, from the stylesheet) position before the transition target
    // changes below — without this the style change can get coalesced
    // and the object would just appear at rest with no visible slide-in
    void node.offsetWidth;
    // the release window may already be open if this round is running
    // under heavy delay — skip straight to releasing rather than
    // resting-then-immediately-releasing
    if (released) { startReleaseFor(item); return; }
    node.style.transition = 'left ' + ROLL_IN_DURATION_MS + 'ms cubic-bezier(0.2, 0.7, 0.3, 1)';
    node.style.left = restLeftPx(index) + 'px';
  }

  /* Every object still resting starts sliding at once, sharing one belt
     speed — not one shared duration. A CSS transition's duration is a
     fixed time regardless of distance, so giving every item the same
     duration would make them all arrive together; computing each item's
     duration from a shared px/ms speed instead means the one resting
     furthest back (the most ground to cover) takes the full remaining
     time, while the ones already closer to the end arrive sooner. */
  function releaseBelt() {
    const surface = $('belt-surface');
    const endLeft = surface.clientWidth + 60;
    const totalDuration = Math.max(50, roundEndsAt - performance.now());
    const resting = beltObjects.filter(item => item.state === 'resting');
    if (!resting.length) return;
    const surfaceRect = surface.getBoundingClientRect();
    const distances = resting.map(item => {
      const rect = item.el.getBoundingClientRect();
      return endLeft - (rect.left - surfaceRect.left);
    });
    const speed = Math.max(...distances) / totalDuration;   // px/ms, shared
    resting.forEach((item, i) => startReleaseFor(item, endLeft, distances[i] / speed));
  }

  /* endLeft/duration are omitted when resuming an item dropped mid-release
     (attachDrag/onDragEnd) — that rare case just aims to still clear by
     the round deadline rather than matching the shared belt speed exactly. */
  function startReleaseFor(item, endLeftArg, durationArg) {
    const surface = $('belt-surface');
    const endLeft = endLeftArg !== undefined ? endLeftArg : surface.clientWidth + 60;
    const duration = Math.max(50, durationArg !== undefined ? durationArg : roundEndsAt - performance.now());
    item.state = 'releasing';
    void item.el.offsetWidth;   // flush so the frozen/rest position is committed first
    item.el.style.transition = 'left ' + duration + 'ms linear';
    item.el.style.left = endLeft + 'px';
    const onEnd = (ev) => {
      if (ev.propertyName !== 'left') return;
      item.el.removeEventListener('transitionend', onEnd);
      fallOff(item);
    };
    item.el.addEventListener('transitionend', onEnd);
  }

  /* Silent. No penalty message — the table simply gains nothing. */
  function fallOff(item) {
    if (item.state === 'gone') return;
    item.state = 'gone';
    if (item.el) item.el.remove();
    // safety net: if the belt clears before the timer backstop's next
    // tick, end the round immediately rather than waiting up to 250ms
    if (roundActive && beltObjects.every(o => o.state === 'gone')) endRound();
  }

  function endRound() {
    if (!roundActive) return;
    roundActive = false;
    $('era1-skip').disabled = true;
    drag = null;
    // the belt can clear before the natural timer backstop (skip button,
    // or the safety net above) — force the display to zero right away
    // instead of leaving whatever leftover value was last shown frozen
    setClock(0);
    if (clockId) { clearInterval(clockId); clockId = null; }
    beltObjects.forEach(o => { if (o.el) o.el.remove(); });
    beltObjects = [];
    roundIdx++;
    if (roundIdx < SNIPPETS.length) {
      // clear the floor, breathe, then the next snippet arrives (issue #2)
      setTimeout(() => {
        renderBlankBoxes();
        setClock(null);
        setTimeout(showPopup, 1200);
      }, 700);
    } else {
      setTimeout(() => QC.start(), 900);
    }
  }

  /* ---------- drag & drop (pointer events) ---------- */

  /* One drag at a time, finished by window-level listeners — a pointerup
     anywhere completes it, so a missed capture can never strand an object
     mid-air. Grabbing an object freezes it exactly where it visually is
     (whether mid-roll-in, resting, or mid-release) and cancels its
     transition; dropping it resumes the right thing — back to resting if
     the release window hasn't opened yet, or straight into releasing
     (recomputed from the current moment) if it has. */
  let drag = null;   // { item, lastX, lastY }

  function attachDrag(item) {
    item.el.addEventListener('pointerdown', (ev) => {
      if ((item.state !== 'resting' && item.state !== 'releasing') || drag) return;
      ev.preventDefault();
      freezeAtCurrentPosition(item.el);
      item.state = 'held';
      item.el.classList.add('dragging');
      drag = { item, lastX: ev.clientX, lastY: ev.clientY };
      moveTo(item.el, ev.clientX, ev.clientY);
    });
  }

  function freezeAtCurrentPosition(node) {
    const rect = node.getBoundingClientRect();
    const surfaceRect = $('belt-surface').getBoundingClientRect();
    node.style.transition = 'none';
    node.style.left = (rect.left - surfaceRect.left) + 'px';
  }

  function onDragMove(e) {
    if (!drag) return;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    moveTo(drag.item.el, e.clientX, e.clientY);
  }

  function onDragEnd(e) {
    if (!drag) return;
    const { item } = drag;
    // trust the tracked cursor position over the final event's coordinates
    const x = (typeof e.clientX === 'number' && e.clientX > 0) ? e.clientX : drag.lastX;
    const y = (typeof e.clientY === 'number' && e.clientY > 0) ? e.clientY : drag.lastY;
    drag = null;
    item.el.classList.remove('dragging');
    item.el.style.transform = '';
    const target = dropTarget(x, y);
    if (target) attemptPlace(item, target);
    if (item.state === 'held') {
      if (released) startReleaseFor(item);
      else item.state = 'resting';
    }
  }

  window.addEventListener('pointermove', onDragMove, true);
  window.addEventListener('pointerup', onDragEnd, true);
  window.addEventListener('pointercancel', onDragEnd, true);

  function moveTo(node, x, y) {
    const surface = $('belt-surface').getBoundingClientRect();
    node.style.transform =
      'translate(' + (x - surface.left - node.offsetLeft - 26) + 'px,' +
      (y - surface.top - 26) + 'px) scale(1.15)';
  }

  function dropTarget(x, y) {
    const under = document.elementFromPoint(x, y);
    if (!under) return null;
    const box = under.closest('.box');
    return box ? box.dataset.box : null;
  }

  function attemptPlace(item, boxId) {
    const objId = item.objId;
    const boxEl = document.querySelector('.box[data-box="' + boxId + '"]');
    const chips = boxEl.querySelector('.box-chips');
    const weight = addAssociation(objId, boxId);

    const ghost = chips.querySelector('.chip.ghost[data-obj="' + objId + '"]');
    if (ghost) {
      // the fleet was already here — this placement is one more tally
      bumpChipCount(ghost, bumpGhost(objId, boxId));
    } else {
      const existing = chips.querySelector('.chip[data-obj="' + objId + '"]');
      if (existing) {
        bumpChipCount(existing, weight);
      } else {
        const chip = makeChip(objId, boxId);
        chip.classList.add('pop');
        chips.appendChild(chip);
      }
    }
    boxEl.classList.remove('glow');
    void boxEl.offsetWidth;
    boxEl.classList.add('glow');
    Audio2.blip();

    // soft nudge at the 5th distinct box — non-blocking, no cost
    if (associationCount(objId) === 5 && !State.toastShown[objId]) {
      State.toastShown[objId] = true;
      toast('Filing ' + OBJECTS[objId].e + ' into 5 boxes — are you sure?');
    }
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  /* Ends the current round early, same as a natural timeout — unsorted
     belt objects contribute nothing, silently, exactly like a fall-off. */
  function skip() {
    endRound();
  }

  return { start, closePopup, skip };
})();
