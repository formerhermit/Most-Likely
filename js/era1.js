/* MOST LIKELY — Era 1: Training
   Popup (untimed) → boxes reveal → belt + round clock → drag to file.
   An object can be filed into the same box more than once — each repeat
   stacks that pair's weight higher (shown as a ×N badge on the chip)
   instead of being blocked. Fall-offs are silent.

   Pacing ramps up over the session (issue #3): early rounds send one object
   at a time with a long filing window, later rounds run two then three
   concurrently. The next object is released as soon as the current one has
   been filed at least once (or falls off), so quick filers never wait. */

'use strict';

const Era1 = (() => {
  /* firstRound..lastRound (0-based) → concurrency, per-object fall-off window */
  const PACING = [
    { upTo: 2,  concurrent: 1, traverse: 55000 },
    { upTo: 6,  concurrent: 2, traverse: 32000 },
    { upTo: 10, concurrent: 3, traverse: 18000 }
  ];
  const SPAWN_STAGGER_MS = 1500;
  const FIRST_SPAWN_DELAY_MS = 600;

  /* The round clock is not a padded ceiling — it's the exact time the belt
     needs to fully clear (every object either filed or fallen) if the
     player never touches it at all. Simulating the same spawn/capacity
     rules the live tick() loop uses means a hands-off round always ends
     exactly as the clock hits zero, instead of a fixed cap that runs on
     long after the belt has actually emptied (issue: reported timer
     mismatch, clock read 3:30 but the belt was empty by ~2:30). */
  function simulateRoundDuration(beltLength, p) {
    let time = FIRST_SPAWN_DELAY_MS;
    let lastSpawnTime = -Infinity;
    let fallOffTimes = [];
    let spawned = 0;
    while (spawned < beltLength) {
      fallOffTimes = fallOffTimes.filter(t => t > time);
      if (fallOffTimes.length < p.concurrent && time >= lastSpawnTime + SPAWN_STAGGER_MS) {
        fallOffTimes.push(time + p.traverse);
        lastSpawnTime = time;
        spawned++;
        continue;
      }
      // only the stagger deadline still ahead of `time` can be the
      // limiting event — a stagger already satisfied but blocked purely
      // by capacity must not re-select itself forever
      const nextStagger = lastSpawnTime + SPAWN_STAGGER_MS;
      const nextFallOff = fallOffTimes.length ? Math.min(...fallOffTimes) : Infinity;
      time = nextStagger > time ? Math.min(nextStagger, nextFallOff) : nextFallOff;
    }
    return Math.max(...fallOffTimes);
  }

  let roundIdx = 0;
  let pacing = PACING[0];
  let beltObjects = [];         // {objId, el, progress, state, resolved}
  let queueIndex = 0;
  let nextSpawnAt = 0;
  let rafId = null;
  let lastTs = 0;
  let roundEndsAt = 0;
  let clockId = null;
  let roundActive = false;

  const $ = (id) => document.getElementById(id);

  function pacingFor(i) {
    return PACING.find(p => i <= p.upTo) || PACING[PACING.length - 1];
  }

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
    // leaves two rAF/interval loops sharing the same lastTs/beltObjects
    // state, which corrupts belt timing and can end the round almost
    // instantly (issue #18)
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
    pacing = pacingFor(roundIdx);
    roundActive = true;
    $('era1-skip').disabled = false;
    beltObjects = snip.belt.map(objId =>
      ({ objId, el: null, progress: 0, state: 'queued', resolved: false }));
    queueIndex = 0;
    nextSpawnAt = performance.now() + FIRST_SPAWN_DELAY_MS;
    $('belt-surface').innerHTML = '';
    lastTs = 0;

    roundEndsAt = performance.now() + simulateRoundDuration(snip.belt.length, pacing);
    clockId = setInterval(() => {
      const left = Math.max(0, roundEndsAt - performance.now());
      setClock(left);
      if (left <= 0) endRound();
    }, 250);

    rafId = requestAnimationFrame(tick);
  }

  /* grey-bezel display clock, red digits (issue #3) */
  function setClock(ms) {
    const clock = $('era1-clock');
    if (ms === null) { clock.textContent = '-:--'; return; }
    const s = Math.ceil(ms / 1000);
    clock.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function activeUnresolved() {
    return beltObjects.filter(o =>
      (o.state === 'moving' || o.state === 'held') && !o.resolved).length;
  }

  function trySpawn(now) {
    if (queueIndex >= beltObjects.length) return;
    if (now < nextSpawnAt) return;
    if (activeUnresolved() >= pacing.concurrent) return;
    spawnObject(beltObjects[queueIndex++]);
    nextSpawnAt = now + SPAWN_STAGGER_MS;
  }

  function spawnObject(item) {
    const node = el('div', 'belt-obj', OBJECTS[item.objId].e);
    node.dataset.obj = item.objId;
    $('belt-surface').appendChild(node);
    item.el = node;
    item.state = 'moving';
    attachDrag(item);
  }

  function tick(ts) {
    if (!lastTs) lastTs = ts;
    // cap dt so a throttled/hidden tab pauses the belt instead of
    // teleporting objects forward on the next frame; push the round
    // deadline out by the trimmed amount so the clock pauses too
    const rawDt = ts - lastTs;
    const dt = Math.min(rawDt, 100);
    roundEndsAt += rawDt - dt;
    lastTs = ts;
    trySpawn(performance.now());
    const surface = $('belt-surface');
    const w = surface.clientWidth;
    let anyAlive = queueIndex < beltObjects.length;
    for (const item of beltObjects) {
      if (item.state === 'moving') {
        item.progress += dt / pacing.traverse;
        if (item.progress >= 1) {
          fallOff(item);
        } else {
          item.el.style.left = (item.progress * (w - 20) - 30) + 'px';
          anyAlive = true;
        }
      } else if (item.state === 'held') {
        anyAlive = true;
      }
    }
    if (!anyAlive) { endRound(); return; }
    rafId = requestAnimationFrame(tick);
  }

  /* Silent. No penalty message — the table simply gains nothing. */
  function fallOff(item) {
    item.state = 'gone';
    item.el.classList.add('falling');
    const node = item.el;
    setTimeout(() => node.remove(), 500);
  }

  function endRound() {
    if (!roundActive) return;
    roundActive = false;
    $('era1-skip').disabled = true;
    drag = null;
    // the belt can clear well before roundEndsAt (the untouched-worst-case
    // duration) if the player files everything quickly — force the display
    // to zero right away instead of leaving whatever leftover value the
    // last tick happened to show frozen on screen
    setClock(0);
    if (clockId) { clearInterval(clockId); clockId = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
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
     mid-air. */
  let drag = null;   // { item, lastX, lastY }

  function attachDrag(item) {
    item.el.addEventListener('pointerdown', (ev) => {
      if (item.state !== 'moving' || drag) return;
      ev.preventDefault();
      item.state = 'held';
      item.el.classList.add('dragging');
      drag = { item, lastX: ev.clientX, lastY: ev.clientY };
      moveTo(item.el, ev.clientX, ev.clientY);
    });
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
    if (item.state === 'held') item.state = 'moving';  // resume where it froze
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
    // a filed object stops holding up the queue — the next one can come out
    item.resolved = true;

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
