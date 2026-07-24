/* MOST LIKELY — Era 1: Training
   Popup (untimed) → boxes reveal → belt + round timer → drag to file.
   First placement free; repeats blocked; fall-offs silent. */

'use strict';

const Era1 = (() => {
  const ROUND_MS = 60000;       // round timer
  const TRAVERSE_MS = 9500;     // hatch to fall-off per object
  const SPAWN_GAP_MS = 3000;

  let roundIdx = 0;
  let beltObjects = [];         // {objId, el, progress, state, spawnTimer}
  let rafId = null;
  let lastTs = 0;
  let roundEndsAt = 0;
  let roundTimerId = null;
  let roundActive = false;

  const $ = (id) => document.getElementById(id);

  /* ---------- round flow ---------- */

  function start() {
    roundIdx = 0;
    showScreen('screen-era1');
    showPopup();
  }

  function showPopup() {
    const snip = SNIPPETS[roundIdx];
    $('era1-round-label').textContent = 'ROUND ' + (roundIdx + 1) + ' / ' + SNIPPETS.length;
    $('popup-title').textContent = snip.title;
    const picsEl = $('popup-pics');
    picsEl.innerHTML = '';
    snip.pics.forEach(p => picsEl.appendChild(el('div', 'popup-pic', p)));
    const textEl = $('popup-text');
    textEl.innerHTML = '';
    snip.text.forEach(line => textEl.appendChild(el('p', '', line)));
    $('era1-timer-fill').style.width = '100%';
    renderBoxes(snip, true);
    $('popup').classList.remove('hidden');
  }

  function closePopup() {
    $('popup').classList.add('hidden');
    beginRound();
  }

  function renderBoxes(snip, dimmed) {
    const grid = $('boxes');
    grid.innerHTML = '';
    snip.boxes.forEach(boxId => {
      const b = BOXES[boxId];
      const box = el('div', 'box' + (dimmed ? ' dim' : ''));
      box.dataset.box = boxId;
      const head = el('div', 'box-head');
      head.appendChild(el('span', 'box-emoji', b.e));
      head.appendChild(el('span', 'box-word', b.w));
      box.appendChild(head);
      const chips = el('div', 'box-chips');
      chips.dataset.chips = boxId;
      box.appendChild(chips);
      // cross-round persistence: earlier filings sit in the box already
      objectsInBox(boxId).forEach(objId => {
        chips.appendChild(makeChip(objId));
      });
      grid.appendChild(box);
    });
  }

  function makeChip(objId) {
    const c = el('span', 'chip', OBJECTS[objId].e);
    c.dataset.obj = objId;
    return c;
  }

  function beginRound() {
    const snip = SNIPPETS[roundIdx];
    roundActive = true;
    document.querySelectorAll('.box').forEach(b => b.classList.remove('dim'));
    beltObjects = [];
    $('belt-surface').innerHTML = '';
    lastTs = 0;

    snip.belt.forEach((objId, i) => {
      const item = { objId, el: null, progress: 0, state: 'queued' };
      item.spawnTimer = setTimeout(() => spawnObject(item), 600 + i * SPAWN_GAP_MS);
      beltObjects.push(item);
    });

    roundEndsAt = performance.now() + ROUND_MS;
    roundTimerId = setInterval(() => {
      const left = Math.max(0, roundEndsAt - performance.now());
      $('era1-timer-fill').style.width = (left / ROUND_MS * 100) + '%';
      if (left <= 0) endRound();
    }, 120);

    rafId = requestAnimationFrame(tick);
  }

  function spawnObject(item) {
    if (item.state !== 'queued') return;
    const node = el('div', 'belt-obj', OBJECTS[item.objId].e);
    node.dataset.obj = item.objId;
    $('belt-surface').appendChild(node);
    item.el = node;
    item.state = 'moving';
    attachDrag(item);
  }

  function tick(ts) {
    if (!lastTs) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;
    const surface = $('belt-surface');
    const w = surface.clientWidth;
    let anyAlive = beltObjects.some(o => o.state === 'queued');
    for (const item of beltObjects) {
      if (item.state === 'moving') {
        item.progress += dt / TRAVERSE_MS;
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
    if (roundTimerId) { clearInterval(roundTimerId); roundTimerId = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    beltObjects.forEach(o => { if (o.spawnTimer) clearTimeout(o.spawnTimer); if (o.el) o.el.remove(); });
    beltObjects = [];
    roundIdx++;
    if (roundIdx < SNIPPETS.length) {
      setTimeout(showPopup, 700);
    } else {
      setTimeout(() => QC.start(), 900);
    }
  }

  /* ---------- drag & drop (pointer events) ---------- */

  function attachDrag(item) {
    item.el.addEventListener('pointerdown', (ev) => {
      if (item.state !== 'moving') return;
      ev.preventDefault();
      item.state = 'held';
      const node = item.el;
      node.classList.add('dragging');
      node.setPointerCapture(ev.pointerId);
      moveTo(node, ev.clientX, ev.clientY);

      const onMove = (e) => moveTo(node, e.clientX, e.clientY);
      const onUp = (e) => {
        node.removeEventListener('pointermove', onMove);
        node.removeEventListener('pointerup', onUp);
        node.removeEventListener('pointercancel', onUp);
        node.classList.remove('dragging');
        node.style.transform = '';
        const target = dropTarget(e.clientX, e.clientY);
        if (target) attemptPlace(item.objId, target);
        if (item.state === 'held') item.state = 'moving';  // resume where it froze
      };
      node.addEventListener('pointermove', onMove);
      node.addEventListener('pointerup', onUp);
      node.addEventListener('pointercancel', onUp);
    });
  }

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

  function attemptPlace(objId, boxId) {
    const boxEl = document.querySelector('.box[data-box="' + boxId + '"]');
    const result = addAssociation(objId, boxId);
    if (result === 'blocked') {
      // reject animation — blocked, not re-counted, no time cost
      boxEl.classList.remove('shake');
      void boxEl.offsetWidth;
      boxEl.classList.add('shake');
      Audio2.buzz();
      return;
    }
    const chips = boxEl.querySelector('.box-chips');
    const chip = makeChip(objId);
    chip.classList.add('pop');
    chips.appendChild(chip);
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

  return { start, closePopup };
})();
