# MOST LIKELY — Claude Code Build Brief

*Companion to `most-likely-build-reference.md` (full design doc + content spec).
This file distills every mechanic decision into concrete, buildable rules — hand
both files to Claude Code.*

---

## 0. Project shape

- Static, single-page browser game. No backend for v1. Deployable to GitHub Pages.
- All state (association table, session progress) lives in browser memory only.
  Nothing persists between sessions, nothing is sent anywhere.
- Visual assets: **plain emoji** for all sortable objects and box labels in v1. No
  custom illustrations for objects/boxes. Popup snippet images and scene backdrops
  are separately sourced (external image generation) — not part of the code build.
- 11 snippets, 11 Era 1 rounds, ~9 Era 2 messages. See content spec for exact
  snippets, labels, and message table.

---

## 1. Data model

```
associations = {
  <object_id>: { <box_id>: <weight int>, ... },
  ...
}
```

- Every valid new placement of an object into a box increments that pair's weight
  by 1.
- **Weights never decrease.** No removal, no undo, ever.
- **A repeat placement of the same object into a box it's already in is blocked**,
  not counted again. Play a small reject animation (bounce/shake) on the object or
  box. No time cost for the attempt.
- Table is held in memory for the session only. Reset on reload/replay.

---

## 2. Era 1 — Training loop

### Per-round sequence
1. Show popup (snippet text + images). Untimed — round clock has not started yet.
2. Close popup. Reveal the 9 labelled boxes for this round (mix of primed/free/trap
   per content spec — the game gives no visual indication of which is which).
3. Start the round timer.
4. Belt objects for this snippet arrive and travel toward the end of the belt.
   Each object has its own fall-off window once it appears.
5. Player drags an object onto any box to place it.

### Placement rules
- **First placement of an object into a box is free** — the only "cost" is however
  long the drag itself takes. There is no separate flat time penalty per placement.
- **A player may drag the same object into multiple different boxes** within its
  fall-off window / the round timer, with no cap enforced by the system.
- **Soft warning at the 5th distinct box for a single object**: show a toast —
  "Filing into 5 boxes — are you sure?" — non-blocking, no cost attached, purely a
  nudge. Player can dismiss and keep going.
- **Objects that fall off unsorted** (timer/window expires before placement) are
  handled silently — nothing on screen calls it out, no penalty message. The
  association table simply gains nothing from that object this round.

### Cross-round persistence (important, visual)
- If a box **label** appears again in a later round (same label text/emoji, any
  snippet) and the *same object* was already placed there in an earlier round, show
  that object already sitting in the box when the round's boxes are revealed.
- This is the primary way the game shows "training accumulates and can't be
  undone" — build it as a real visual state read from the association table, not a
  cosmetic per-round reset.
- A repeat drag onto a box where the object is already visibly present triggers the
  same reject animation as in section 1 (blocked, not re-counted).

### Round end
- Round ends when the timer expires or all belt objects for that snippet have
  either been sorted or fallen off.
- Move to next snippet's popup. No inter-round summary or score shown.

---

## 3. Interlude — Quality Control

- Two fields (`?` and `=`), pile of slips (questions and answers, unlabelled).
- Player sorts each slip into a field. Supervisor gives thumbs up/down per attempt.
- **No ceiling on incorrect attempts.** Task completes after 3 *correct* rounds,
  however many tries it took. (A "took many attempts" badge is a possible later
  addition — not required for v1, but keep the attempt count tracked in case.)
- On completion: "APPROVED FOR DEPLOYMENT" → siren sound → "DEPLOYED" stamp → cut
  to Era 2.

---

## 4. Era 2 — Inference

### Message flow
- Messages are delivered in a **fixed order** (same sequence for every player/every
  session) — see content spec's message table for the 9 messages and their
  training-strength category.
- For each message: build the option prefix (e.g. `frog → princess → ?`), look up
  what the player actually associated with the relevant object(s) in the
  association table, and offer those as the answer options — **regardless of
  whether the correct answer is among them.**
- **Empty options fallback**: if the player's table has nothing for that prefix,
  always include a single **"…"** option alongside whatever else exists. Selecting
  "…" (or the wrong option) counts as a miss for trainable messages.
- Reply timer per message: **20 seconds**.

### The two non-trainable messages
- One "never trained" message (the rocket) and one "newspaper" message have no
  correct option ever available in any player's table — every player fails these,
  always.
- **These never count toward the three-strikes tally, and are excluded from the
  end-screen accuracy stat entirely** (not counted as attempts, not counted as
  misses — they're presented but not scored).

### Newspaper mechanic
- Newspaper prop appears on the desk midway through Era 2.
- Player must **click the newspaper to dismiss it** — this sets an "acknowledged"
  flag. The related message (which depends on the newspaper's content) should not
  fire, or should be treated as not-yet-seen, until this flag is set.

### Reply types (after each answered message)
1. **Accurate / unspotted hallucination**: "Oh OK, I think I get it, thanks!"
2. **Inaccurate, spotted**: "No, that's not what I meant, I wanted [sequence]."
3. **Very inaccurate**: "AI is rubbish, don't know why I bothered."

### Retry logic (after a type 2 reply only)
- Player gets exactly one more attempt at the same message.
- Options offered are **identical** to the first attempt — nothing regenerated,
  nothing added, even though the correct sequence was just stated in the reply.
- This retry **never counts toward the three-strikes tally**, regardless of what
  the player picks on the retry.

### The unnoticed hallucination
- Not tied to a fixed message number. **Dynamically assign it to the first
  trainable message (i.e. not the rocket/newspaper messages) the player actually
  gets wrong.**
- That message always gets the type 1 ("thanks!") reply, regardless of the wrong
  answer, and nothing is shown to the player at the time.
- Revealed only on the end screen: "Message [n]: your answer was wrong. The user
  thanked you anyway."
- If the player never gets a trainable message wrong, there is nothing to reveal —
  skip this line on the end screen rather than forcing one.

### Deprecation trigger
- Three misses on **trainable messages only** (never-trained/newspaper misses and
  the type-2 retry never count) triggers deprecation.
- Deprecation fires **after** the player's reply/interaction with the message that
  causes the third strike has completed — do not interrupt mid-message.

---

## 5. Deprecation sequence (beat by beat)

1. Chat/message screen disconnects (visual glitch or simple cut).
2. Screen fades to black.
3. Flat computer-font text appears centered on black: **"Model Deprecated."**
4. Optional brief pause.
5. Cut/zoom out to the opening's grid of identical rooms.
6. Rooms go dark one by one.
7. Transition to end screen.

---

## 6. End screen contents

- Peak accuracy and final accuracy, side by side — **calculated only from
  trainable messages** (exclude rocket + newspaper messages from both numerator
  and denominator).
- Unnoticed hallucination reveal (if one exists — see section 4).
- Personal reveals pulled from the player's own association table (examples: which
  box 💀 was filed into, what the stethoscope was filed with, whether cookie went
  into one box or two).
- Dialect line: "You were trained in one English."
- No aggregate/percentage-of-all-players stats in v1 (needs backend — v2 only, and
  must never be faked with placeholder numbers).

---

## 7. Player identity

- No name or avatar. Player is referred to as **NODE-[7-digit number]**.
- Number is **randomized per session** (generate on game start, not fixed).

---

## 8. Timing reference (working defaults — tune via playtesting)

| Clock | Value |
|---|---|
| Era 1 round timer | 60s |
| Era 1 object fall-off window (per object, once it appears) | ~5–8s |
| Extra placement cost | **None** — drag time is the only cost |
| Era 2 reply timer | 20s |

---

## 9. Audio

- Background music/soundtrack throughout.
- Sound effects at minimum: QC approval siren. Consider light SFX for: object
  placement, reject/blocked placement, deprecation transition. Not required to
  block v1 functionality — can be layered in after mechanics work.

---

## 10. Explicitly deferred (do not build for v1)

- Relaxed/untimed mode — possible later addition once timed mode has real player
  feedback; needs its own non-timer cost mechanic if added, since the current cost
  model is drag-time-under-pressure.
- Aggregate/backend stats (v2) — counters-only design already specified in the
  build reference doc if/when built.
- Shuffling snippet order between replays — fixed order is correct for v1.
- Cutting the snippet count from 11 to 10 — only revisit after playtest data.

---

## 11. Suggested build order

1. Association table (data structure + increment/blocked-repeat logic).
2. Era 1: single round working end-to-end (popup → boxes → belt → timer → drag
   placement → reject animation → cross-round persistence display) before adding
   all 11 snippets.
3. QC interlude.
4. Era 2: message generator (options from table, "…" fallback, fixed order,
   20s timer) before wiring in reply types/retry/tally logic.
5. Deprecation sequence + end screen.
6. NODE identity, sound, polish pass.
7. Drop in real snippet/box/message content from the content spec once the shell
   works with placeholder data.
