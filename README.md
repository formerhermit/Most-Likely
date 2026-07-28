# MOST LIKELY

A small browser game about how language models work. One player, no backend,
nothing saved or sent anywhere.

**Play it**: <https://robot.sillygame.studio>, or locally:

```
python3 serve.py               # then http://localhost:8123
```

Use `serve.py`, not `python3 -m http.server`. The stdlib server sends no
`Cache-Control`, so browsers cache `js/*.js` and `css/style.css`
indefinitely and keep serving a stale build after you've edited them —
without even making a conditional request, which is why clearing browsing
data doesn't reliably shift it, and why adding `?v=2` to the page URL
doesn't either (each subresource is cached under its own unchanged URL).
`serve.py` is the same server with `no-store` on every response.

## The idea

**The player is the model, doing the same operation the whole way through.
Only the surroundings change.**

That's the spine. Training and inference are the same forward pass — they
differ only in whether a correction follows — and the game teaches it
through form rather than through a caption. One verb: *a blank, your own
ranked candidates, pick one.*

| Act | What changes | Built? |
|---|---|---|
| **1 — Pre-training** | The text corrects every guess; your table fills | ✅ `js/pretrain.js` |
| **2 — Fine-tuning** | Frames arrive; the same words finally have somewhere to go | ✅ `js/qc.js` |
| **3 — Deployment** | Same verb, corrections switched off | ◻️ `js/era2.js` is the old assemble-the-reply |

Act 3 has not been rebuilt on the new spine yet, and is still wired to an
association table nothing writes to — see **What's left** at the bottom.

## How it fits together

| File | What it holds |
|---|---|
| `js/data.js` | All content: the 11 documents (`body`, with `[blanks]`), `STOPWORDS`, `FLEET_PRIORS`, Era 2 messages, QC slips, the newspaper |
| `js/model.js` | **The model.** One co-occurrence table, shared by every act |
| `js/pretrain.js` | **Act 1** — the predict loop, belt, clock, surprise meter, loss curve |
| `js/qc.js` | **Act 2** — the before/after bracket around the original sorting task |
| `js/era2.js` | Inference: assemble-the-reply, suggestion chips from the player's table, replies/retry, the unnoticed hallucination, newspaper gating, strikes |
| `js/ending.js` | Deprecation sequence, lights-out grid, end screen |
| `js/state.js` | Session flags, screen manager, helpers (the old association table lives here too) |
| `js/era1.js` | **Legacy.** The old drag-to-file Era 1 — still in the build, no longer reachable from the UI |
| `js/audio.js` | SFX synthesized with WebAudio; phase music crossfaded on phase change |
| `js/main.js` | Bootstrap, title, opening zoom, debug helpers |
| `serve.py` | Local dev server with caching disabled |

---

# The model

*`js/model.js`. Act 1 trains it, Act 2 reads it, Act 3 will read it
frozen.*

A distance-weighted co-occurrence table: every content word co-occurs with
the ones just before it, weighted by 1/distance, symmetrically. Candidates
for a blank are ranked by how often they've appeared near the words already
visible.

It's a real, if antique, language model — the same object GloVe factorizes.
Scoring against the **whole document context** rather than the previous token
is closer to how attention works than a bigram would be, and unlike a bigram
it produces signal on a corpus small enough to hand-write.

## read vs. observe

The module's centrepiece is a two-word API:

```js
Model.read(word)      // takes it in AND learns from it   — Act 1 only
Model.observe(word)   // takes it in, changes no weight   — everything after
```

That is the entire difference between training and inference: the same
forward pass, with the update switched off. It's the game's thesis, and
here it's two function names rather than a paragraph of explanation.

Before this module existed, each act kept its own state and nothing flowed
between them — which made the game's central claim, *your training builds
the model you then have to be*, literally untrue of the code.

## Two rules that aren't obvious

Both load-bearing:

**Words already read in this document are dropped from the candidate list.**
Without it the belt fills almost entirely with words from the sentence you're
looking at — they co-occur with everything in the context by construction, so
they outrank anything learned earlier, and the suggestions stop being a
prediction and become an echo. Real decoders suppress repetition for the same
reason. Hit rate went from 2/40 to 7/40 on this change alone. **The corpus is
authored around it: no blank may repeat a word appearing earlier in its own
document.**

**A candidate needs real contextual support to reach the belt.** A word the
model has merely *seen* is not a prediction. Padding the list from the
frequency prior let words land in the top five on a small vocabulary by pure
luck — document 1 was scoring better than document 8. The prior survives only
as a tie-breaker among supported candidates, which is what a unigram fallback
should be.

That second rule produced the best readout in the act, and it wasn't
designed. Belt sizes across a run:

```
1, 1, 1, 5, 1, 5, 5, 5, 5, 5, 1, 0, 5, 5, 5, 5, 5, 5, 5, ...
```

Early blanks send one lonely tag down the belt, or none at all. By the last
documents it's full every time. **The model getting better is something you
watch arrive on a conveyor**, not a number in the corner.

## The fleet

`FLEET_PRIORS` seeds the table before document 1. This node is one of
millions running the same exercise, and the others have been reading their
own shards the whole time — so some of the world is already known, and a few
words on the belt come from documents this node never sees. That isn't a
courtesy to the player; it's what data-parallel training is.

Watch for `umbrella`, `hospital`, `celebrating`, `boots` — fleet words that
appear in **no document you read**. A suggestion you cannot account for.

Fleet-sourced tags are gold-tinted and carry the fleet's tally (`crown
×1074`), the same `×N` language the old sorting office used for its ghost
chips.

Two constraints:

- **Only the single strongest pile per word is loaded.** Loading all of
  `FLEET_PRIORS` made the model far too good far too early — nearly every
  document opened with the answer already on the belt, the player's own
  reading stopped mattering, and the curve flattened into noise.
- **The gendered piles are not loaded.** They exist to bait the old
  occupation trap, and this act isn't running it.

---

# Act 1 — Pre-training

A document arrives. Its text reveals itself word by word. At each blank the
model's own candidates roll out of the hatch onto the conveyor; you click one
before it reaches the end; the document then says what the word actually was.
Right or wrong, the true word's counts go up.

That's the whole algorithm: **predict, get corrected by the text, adjust,
repeat.**

Three things it deliberately does not do, each of which the old Era 1 did:

- **It never shows the document before you predict it.** The card carries
  only the provenance — image and source — never the prose. Reading first
  would make this a memory test.
- **It never asks you to decide what a word means.** Nobody labels a corpus.
  The association table fills as a side effect of being wrong.
- **It never punishes a miss.** Early documents are mostly misses. That is
  what an untrained model is, and the surprise meter is the honest readout
  of it rather than a score.

## Belt mechanic: rest, then release

Carried over from `era1.js`. Tags roll out of the hatch one at a time, come
to rest spaced across the belt, and **stay there to be read** — the conveyor
texture itself stops once everything has arrived. Nothing moves again until
the document clock reaches its final 8 seconds, when whatever is still
resting slides off at one **shared speed**, not a shared duration (a CSS
transition's duration is fixed regardless of distance, so a shared duration
would make every tag arrive together).

A blank whose tags all run off the end is one the model never answered.
That's why there is no "…" button: a model with nothing to say doesn't press
one.

Candidates rest in **rank order, heaviest furthest along the belt**. The game
is called MOST LIKELY and the most likely thing arrives first; taking it on
sight is a real strategy with a real cost, which is what greedy decoding is.

**Spacing is computed from measured widths, not a fixed percentage.** The
words run from "hot" to "celebrating", so the train's total width isn't
knowable until every tag exists — all of them are built and measured before
any of them move, then the layout pushes the frontmost tag right and tightens
the gap until they fit. Anything that still can't fit is dropped rather than
stacked; that's the tail of the distribution, which is what top-k truncation
does anyway.

Movement is entirely CSS-transition-driven, with a synchronous reflow
(`void node.offsetWidth`) before each transition target —
`requestAnimationFrame` proved unreliable enough in some environments to
delay a callback by seconds.

## Clock and skip

**60 seconds per document**, as Era 1 had one per round. It drives the belt
directly. Running it out reveals the rest of the text and ends the document,
with unanswered blanks scored at maximum surprise.

**Skip advances one blank, not the document.** On an active blank the text
supplies the word — as it would have anyway — and reading carries on to the
*next* blank and stops there. Pressed between blanks it fast-forwards the
reveal to the next one.

The recorded surprisal is **unchanged by skipping**: it's a property of the
model's distribution, not of whether the player clicked, so skipping can't
flatter or distort the curve.

Both routes that dump the remaining text out at once — skipping the last
blank, and the clock expiring — leave the player having never read the
finished document, so both hold it up for 15 seconds with skip live as the
way out.

## Surprise

Per blank: how far down its own ranked list the model had to go to find the
word the document actually used, in bits. A top pick is 0. A word it has
never seen is capped at 7 — worse than any word it knows, which is what it
is. The per-document average drives the sparkline.

That sparkline is the loss curve, and watching it fall is the point of the
act:

```
3.5  7.0  3.5  2.2  7.0  3.0  7.0  2.6  3.7  0.8  2.8
```

12 of 32 blanks land in the belt's top five; 8 of the 11 documents contain at
least one win. The spikes are honest — document 5 is a medical textbook and
document 7 a party invitation, each opening a domain nothing before it
touched. **Loss spikes on unfamiliar data**, and that fell out of the corpus
rather than being placed.

## The corpus

11 documents, ~65 words each, in `js/data.js` as `body` arrays. Words in
`[brackets]` are the blanks.

Blanks are hand-placed, never auto-detected, under three rules:

1. At least two content words of context ahead of it in the same document.
2. Never a word appearing earlier in its own document (the repetition
   suppression rule above).
3. Vocabulary recycles deliberately across topic clusters — frog/pond,
   rain/wet/cold, plate/hot, cake/party, ball/park. That recycling is what
   makes an eleven-document corpus produce a felt learning curve.

The one-line `text` field on each snippet is **legacy**, used only by the old
`era1.js` popup.

`STOPWORDS` is the one piece of hand-tuning: function words carry position,
not topic, and on eleven documents "the" would otherwise co-occur with
everything and drown the signal. A real LM learns to downweight them from
data it has far more of.

---

---

# Act 2 — Quality Control

Instruction tuning. The original sorting task is **untouched** — the
supervisor behind the window, the `?` and `=` fields, the ten lights, the
stamp and the siren. It's now bracketed by two beats that use the model
Act 1 built.

**Before.** A question arrives. You answer it with your own table, and
there is no frame to put the answer in, so the reply continues the way a
document continues — and doesn't know where to stop. Thumbs down, twice.

```
"Where does a frog live?"        →  pond walked edge garden      👎
"What do you take in the rain?"  →  umbrella cold day cloud      👎
```

**Sort.** The original task. Slips into `?` and `=`, ten correct. No
instructions; the shape is inferred from feedback, which is what supervised
fine-tuning feels like from the model's side.

**After.** The same two questions, and now there is a frame with one blank
in it. Same table, same words on offer, one of them goes in the gap.

```
"Where does a frog live?"        →  In the pond.                 👍
"What do you take in the rain?"  →  Take your umbrella.          👍
```

The player watches a sentence shape arrive and change what they're capable
of, and nothing explains it to them.

## Why the before beat can't be failed on content

I built this expecting to show the base model producing *wrong words*. It
can't. A co-occurrence model given "a frog lives" offers **pond**, at more
than twice the weight of anything else. There is no honest way to make the
words wrong.

That is the lesson. **The words were never the problem.** The base model has
the knowledge and lacks the shape — so the before beat opens with the right
answer and then runs off a cliff, because nothing has ever taught it to
stop. Base models don't know where to end; that's what the run-on is.

Two asymmetries follow, both deliberate:

- **Before is rejected whatever you pick.** The run-on follows regardless.
- **After is approved whatever goes in the gap.** "In the sky." gets the
  same thumbs up as "In the pond." The supervisor is grading form, which is
  what format tuning grades — and it quietly sets up Era 2, where a
  confidently wrong answer gets thanked.

**Act 2 never calls `Model.read()`.** Tuning here supplies frames, not word
weights, so the table Act 3 inherits is exactly the one Act 1 built.

Frames are article-agnostic (`Take your ___` rather than `An ___`) so any
noun the table offers still reads grammatically.

---

## Popup images

Each document shows one real image (`assets/images/`) with an invented
`source` line written to read like plausible training-data provenance — a
book, a manual, a menu, a blog, a newspaper, a chat screenshot. It reframes
the act as documents being ingested rather than associations being made.

## Phase music

Three tracks in `assets/audio/`, crossfaded via `Audio2.playPhase(name)`:

| Track | Phase |
|---|---|
| `sort-it-out.mp3` | Act 1, carries through the QC interlude |
| `best-guess.mp3` | Era 2 inference |
| `thank-you.mp3` | Deprecation sequence through the end screen |

## Testing helpers

Console only, not reachable from the UI:

```js
ML_DEBUG.toPretrain()     // Act 1 (what BEGIN runs)
ML_DEBUG.ptModel()        // inspect the co-occurrence table, freq, curve
ML_DEBUG.toOldEra1()      // the legacy drag-to-file Era 1
ML_DEBUG.autoTrain()      // file every primed association (legacy table)
ML_DEBUG.autoTrain(true)  // …plus broad/trap filings
ML_DEBUG.toQC()           // jump to Quality Control
ML_DEBUG.toEra2()         // jump to inference
ML_DEBUG.toEnd()          // jump to deprecation + end screen
ML_DEBUG.state()          // inspect the session state
```

## Legacy: the sorting-office Era 1

`js/era1.js` is the original training act — read a snippet, then drag its
words into nine labelled context boxes under a clock. It's still in the
build and still playable via `ML_DEBUG.toOldEra1()`, but nothing in the UI
reaches it.

It was replaced because it modelled the wrong thing. The player *decided*
what each word meant by choosing a box, which is data annotation; real
pre-training has no annotator, and nothing decides — the model predicts and
the text corrects it. The mechanic taught "bias comes from what labellers
chose" when the truer and more unsettling story is "bias comes from
statistical regularities nobody chose."

It carried four deliberate trap families (generational emoji readings,
regional English, occupation × gender, the agency/rescue trope) whose
payoffs fire on the end screen. Those are dormant: nothing populates
`State.associations` any more. Full design rationale for the traps, the
grounding rules, and the fleet-prior seeding constraints is in
`most-likely-build-reference.md`, `most-likely-claude-code-brief.md`,
`most-likely-rework-spec.md`, and this file's git history.

## What's left

- **Act 3 still runs on the old spine — the next real piece of work.**
  `era2.js` builds its suggestions from `State.associations`, which nothing
  writes to any more: that table was populated only by the retired
  drag-to-file mechanic. Era 2 therefore generates every suggestion from an
  **empty table**, regardless of how training went, which breaks the "your
  training built the model you have to be" chain that is the entire point.
  The chain currently runs Act 1 → Act 2 on the shared model and stops
  dead. Mostly a swap of `buildSlotOptions` onto `Model.rank()` — the
  frames already live in `MESSAGES`.
- **Remove the legacy path** once Act 3 no longer needs it: `era1.js`, its
  markup and CSS, the `text` field on every snippet, and
  `ML_DEBUG.toOldEra1()`. Blocked on the item above — Era 2 is the last
  consumer of the old table. The `text`/`body` split will drift otherwise.
- **Pacing is unverified.** Act 1: `DOC_DURATION_MS` (60s),
  `ROLL_IN_STAGGER_MS` (750ms), `ROLL_IN_DURATION_MS` (1200ms),
  `REVEAL_MS` (55ms/word), `SETTLE_MS` (950ms), `READ_PAUSE_MS` (15s).
  Act 2 adds `RUN_ON_MS` (700ms), `RUN_ON_WORDS` (3) and `VERDICT_MS`
  (1500ms). None were tested at real speed — automated browsers throttle
  background timers — so every one is a guess. These are the numbers to
  trust playtesting on, not measurement. Each set sits at the top of its
  own module.
- **The QC desk is a fixed-width flex row.** Widening the board for the
  prompts overflowed the viewport by 37px, patched with
  `calc(94vw - 200px)` to leave room for the supervisor's window. It will
  need real work if narrow screens ever matter.
- **Ideas not yet built**: a temperature dial (sampling vs. argmax, to show
  the model holds a distribution rather than an answer); the context window
  as a mechanic (pasted content usable *while on screen*, gone when it
  scrolls away — in-context learning, prompting, RAG, "it forgot"); player
  choice over the corpus itself (a data-mix budget, which is where bias
  belongs as an emergent consequence rather than a planted trap); and the
  role-flip ending, where you stop being the model and start being the
  person typing at the one you trained.

## Deliberately not in v1

No relaxed/untimed mode, no aggregate player stats (and no faked ones), no
document shuffling, fixed 11-document order.
