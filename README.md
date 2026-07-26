# MOST LIKELY

A small browser game about how language models learn. One player, no backend,
nothing saved or sent anywhere.

**Play it**: open `index.html` via any static server (or GitHub Pages — the
whole game is static files).

```
python3 -m http.server 8123    # then http://localhost:8123
```

## How it fits together

| File | What it holds |
|---|---|
| `js/data.js` | All content: objects, box labels, the 11 Era 1 snippets, the 9 Era 2 messages, QC slips, the newspaper |
| `js/state.js` | The association table (weights only rise — a repeat filing stacks the pair's weight instead of being blocked), screen manager, helpers |
| `js/era1.js` | Training: popup → rest-then-release belt of **word tags** → drag-to-file, cross-round persistence, 5-box nudge |
| `js/qc.js` | Quality Control interlude (instruction tuning) |
| `js/era2.js` | Inference: assemble-the-reply — sentence frames with blanks, suggestion chips drawn only from the player's table, "…" fallback, replies/retry, the unnoticed hallucination, newspaper gating, strikes |
| `js/ending.js` | Deprecation sequence, lights-out grid, personal end screen |
| `js/audio.js` | SFX synthesized with WebAudio; phase music is three real tracks in `assets/audio/`, crossfaded on phase change |
| `js/main.js` | Bootstrap, title, opening zoom, debug helpers |

Design docs: `most-likely-build-reference.md` (design doc + content spec) and
`most-likely-claude-code-brief.md` (mechanic rules). The build follows the
brief; one addition made during the build is documented below.

## Words rework (issue #25)

The belt carries the snippet's own words as paper tags — the popup shows a
document, the belt shows it tokenized. Emoji survive only where meaning
wobbles: the group chat belt (💀 😭 🙏) and the 🍪 dialect beat. Era 2 is
assemble-the-reply: each message's reply is a fixed sentence frame whose
blanks fill from a suggestion bar, predictive-text style. Candidates come
*only* from the player's table via three sources per slot (`js/data.js`
MESSAGES): `direct` (boxes on the anchor's row), `lateral` (belt words
sharing boxes with the anchor, plus the shared boxes — shared-context
relatedness), and `boxOnly` (words filed into that box — message 7's empty
bar when the fighting box was never touched). Slots filter by word class so
anything offered reads grammatically. Exactly one slot per message is
graded; the rest are expressive ("cake soup — served hot, of course" gets
thanked, and is traceable to the player's own filings). Message 8 (💀) is
deliberately ungraded — the ambiguity is the point, so no reading strikes.
Full design rationale in `most-likely-rework-spec.md`.

A "they're typing…" indicator (`showTyping`/`hideTyping` in `js/era2.js`)
covers every wait for their reply — without it, the ~1–3s gaps between
sending and the next bubble had no feedback at all and read as the game
having frozen.

## No self-pairs on the belt

A round's belt never carries an object whose own identically-worded box sits
in that round (💋 into "kiss", 🥾 into "boots"…). Filing a thing into itself
is a semantically empty picture-match — it teaches shape-sorting instead of
association-building, and it was mechanically inert anyway (Era 2 filters
any option that repeats a prefix emoji). The original spec applied this rule
once (snippet 9's plate→fries swap) but not consistently; the cleanup
removed nine self-pairs across eight rounds and reseeded the five fleet
ghost piles that modeled the same junk move (☂️×1002 sitting in the
umbrella box is now 🌧️×1002 — a real association). Same-emoji boxes with a
*different* word survive on purpose: ☁️ cloud into "sky", 🌳 tree into
"park", and the 🍪 cookie/biscuit dialect trap — there the word carries the
meaning, which is the lesson. One deliberate exception: snippet 3 keeps both
the 🍽️ plate object (plate→hot feeds message 4's right answer) and the 🍽️
plate box (the frog's dining-context coverage gap).

## Phase music

Three tracks in `assets/audio/`, one per phase, crossfaded via
`Audio2.playPhase(name)`:

| Track | Phase |
|---|---|
| `sort-it-out.mp3` | Era 1 training, carries through the QC interlude |
| `best-guess.mp3` | Era 2 inference |
| `thank-you.mp3` | Deprecation sequence through the end screen |

## Testing helpers

Console only, not reachable from the UI:

```js
ML_DEBUG.autoTrain()      // file every primed association
ML_DEBUG.autoTrain(true)  // …plus broad/trap filings (dialect pairs, traps)
ML_DEBUG.toQC()           // jump to Quality Control
ML_DEBUG.toEra2()         // jump to inference
ML_DEBUG.toEnd()          // jump to deprecation + end screen
ML_DEBUG.state()          // inspect the session state
```

## The 🙏 trap (praying vs. thanks)

The group chat snippet's second trap used to be a dialect pair (🍟
fries/chips), but that pair never worked: it had no belt object to test
with (fries/chips were pure decoy boxes nobody would naturally file into)
and, more fundamentally, a food emoji already looks like one specific
region's version of the food — it doesn't create real ambiguity, just a
picture-matching exercise. Cookie/biscuit has the same weakness in a
milder form; fries/chips had it worse, with zero payoff on top.

Replaced it with the 🙏 object already on that snippet's belt: the emoji
is a genuinely documented, real-world split — read as prayer/please by
some, and as thanks or a high-five by others — that has nothing to do
with age (unlike 💀) and needs no textual hint to stay silent. The two
box readings use different symbols from 🙏 itself (🛐 praying, 🙌 thanks),
not a repeated glyph, so the pair doesn't read as a UI duplicate. Revealed
at the end screen the same way the 💀 trap is, and — like every trap in
this game — never seeded in `FLEET_PRIORS`.

## Fleet priors

Boxes don't arrive empty: `FLEET_PRIORS` (`js/data.js`) pre-seeds them with
faded "ghost" chips carrying big counters — the accumulated work of the rest
of the fleet. Filing a matching pair bumps the counter by one. The piles are
purely visual and **never enter the player's association table**, so Era 2
stays generated from this player's own filings. Seeding rules: canonical
pairs as ambience, plus the occupation-gender skew as the payload (🩺 sits
×287 with 👨 vs ×93 with 👩 — skewed, never 100/0), and two snippets carry
one incidental gendered line each ("the captain… his", "the doctor… his
usual"). Coverage gaps, dialect pairs, 💀 boxes, and rescued/fighting are
never seeded — those traps stay pure mirrors of the player. The end screen
then reads the player's gendered filings against the piles: confirming the
skew, going against it, and staying out of it each get an honest line.

(The group chat popup image also carries an incidental "the doctor... he"
mention in its chat text — a byproduct of the image swap, not a seeded
snippet. That snippet's own trap is 💀 laughing-vs-dying, unrelated to the
occupation-gender one above, so it doesn't feed the medical trap, but it is
a third casual "doctor = he" mention worth knowing about if the gendered-line
count ever matters again.)

## Popup images

Each Era 1 snippet shows one real document image (`assets/images/`) instead
of emoji, with an invented `source` line (`js/data.js`) written to read like
plausible training-data provenance — a book, a manual, a menu, a blog, a
newspaper, an app, a chat screenshot. This is deliberate: it reframes the
belt as documents the machine is ingesting, not associations the player is
making. Images were reviewed against the trap set before wiring in — none
show a gendered figure where a snippet carries the occupation trap (medical,
football), and none hint at the dimension a trap is measuring (no visible
mood/generation cue near the group chat, no rescue/fight framing in the
storybook).

## Belt mechanic: rest, then release

Era 1's conveyor is a direct expression of the round clock, not an
independent timer. When the popup closes, every belt object for the snippet
rolls in from the hatch and comes to rest partway across the belt, spaced
out, and stays put — the belt texture itself visibly pauses once everything
has arrived. The round clock counts down from 0:30. At 0:08 remaining, the
belt (and its texture) resumes: every object still resting starts sliding
toward the end at one **shared speed**, not a shared duration — a CSS
transition's duration is fixed regardless of distance, so giving every item
the same duration would make them all arrive together. Computing each item's
duration from a shared px/ms speed instead means the one resting furthest
back (the most ground to cover) takes the full remaining 7.5 seconds, while
closer ones clear sooner. Everything is gone exactly as the clock hits zero.
Fall-offs are silent — no penalty message, the table just gains nothing from
that object.

Movement is entirely CSS-transition-driven (no per-frame loop): a
`transitionend` listener detects arrival or fall-off. `requestAnimationFrame`
was deliberately avoided for the roll-in reflow — it proved unreliable enough
in some environments to delay a single callback by several seconds — in
favor of a synchronous reflow (`void node.offsetWidth`) immediately before
setting the transition target.

Grabbing a belt object freezes it exactly where it visually is, whether
resting or mid-release, and cancels its transition; dropping it resumes the
right thing — back to resting if the release window hasn't opened, or
straight into releasing if it has. If the round's natural deadline is
reached while an object is being actively dragged, the round defers ending
until the drop resolves, rather than wiping the boards out from under an
in-flight placement.

## Reviewing a snippet mid-round

The 🔍 button next to skip (issue #17) reopens the current round's popup
without restarting anything — purely a memory aid, not a mechanic change.
It reuses the same popup markup and `closePopup()` path as the initial
untimed reveal, gated by a `reviewing` flag: closing a review just hides
the popup, while closing the real pre-round popup still kicks off
`beginRound()`. The clock and belt keep running underneath exactly as
before (the popup is just an overlay), so if the round's natural deadline
lands while the player is reviewing, ending the round is deferred until
they close it — the same "don't wipe the boards out from under an active
interaction" guard as the mid-drag case above, just triggered by
`reviewing` instead of `drag`.

## Deliberately not in v1

Per the build brief: no relaxed/untimed mode, no aggregate player stats (and
no faked ones), no snippet shuffling, fixed 11-snippet order.
