# MOST LIKELY

A small browser game about how language models work. One player, no backend,
nothing saved or sent anywhere.

**Play it**: <https://robot.sillygame.studio>, or locally:

```
python3 serve.py               # then http://localhost:8123
```

Use `serve.py`, not `python3 -m http.server` — the stdlib server sends no
`Cache-Control`, so browsers keep serving a stale build after you edit it,
and clearing browsing data doesn't reliably shift it.

## The idea

**The player is the model, doing the same operation the whole way through.
Only the surroundings change.** One verb: *a blank, your own ranked
candidates, pick one.*

| Act | What changes |
|---|---|
| **1 — Pre-training** | The text corrects every guess; the model fills |
| **2 — Fine-tuning** | Frames arrive; the same words finally have somewhere to go |
| **3 — Deployment** | Same verb, corrections switched off |

All three run on one shared model: Act 1 trains it, Acts 2 and 3 read it.

## Files

| File | What it holds |
|---|---|
| `js/model.js` | The model — one co-occurrence table, shared by every act |
| `js/data.js` | All content: 11 documents, `STOPWORDS`, `WORD_CLASS`, `FLEET_PRIORS`, QC prompts and slips, Act 3 messages |
| `js/pretrain.js` | Act 1 — predict loop, belt, clock, surprise meter, loss curve |
| `js/qc.js` | Act 2 — before/after prompts bracketing the sorting task |
| `js/era2.js` | Act 3 — assemble-the-reply, replies/retry, unnoticed hallucination, newspaper, strikes |
| `js/ending.js` | Deprecation sequence, lights-out grid, end screen |
| `js/state.js` | Session flags, screen manager, helpers |
| `js/audio.js` | WebAudio SFX; three phase tracks crossfaded |
| `js/main.js` | Bootstrap, title, opening zoom, debug helpers |
| `serve.py` | Dev server with caching disabled |

---

## The model

`js/model.js`. A distance-weighted co-occurrence table: every content word
co-occurs with the ones just before it, weighted by 1/distance,
symmetrically. Candidates are ranked by how often they've appeared near the
words already visible — scored against the whole passage, not the previous
token.

The API is two words:

```js
Model.read(word)      // takes it in AND learns from it   — Act 1 only
Model.observe(word)   // takes it in, changes no weight   — Acts 2 and 3
```

That's the difference between training and inference: the same forward pass
with the update switched off.

Two filters on `rank()`, both load-bearing:

- **Words already taken in from this passage are suppressed**, by
  `rank(repeatPenalty)`. Otherwise the list fills with the sentence in
  front of the player — those words co-occur with the context by
  construction and drown out everything learned earlier, turning
  suggestions into an echo. Acts 2 and 3 drop them outright; Act 1 keeps
  them at ×0.1 as long-shots, because an early document has nothing else
  to offer and a belt carrying one tag isn't a choice.
- **A candidate needs contextual support to appear at all.** The frequency
  prior only breaks ties among supported words — padding the list from it
  let words reach the top five on a small vocabulary by luck.

### The fleet

`FLEET_PRIORS` seeds the table before document 1 — other nodes have been
reading their own shards. Some words on offer (`umbrella`, `hospital`,
`celebrating`, `boots`) appear in **no document the player reads**. Those
tags are gold-tinted and carry the fleet's tally, e.g. `crown ×1074`.

Only the strongest pile per word is loaded — loading all of them makes the
model too good too early and flattens the curve. The gendered piles aren't
loaded at all.

---

## Act 1 — Pre-training

A document arrives. Its text reveals word by word. At each blank the model's
candidates roll out of the hatch, come to rest on the conveyor, and are
clicked. The document then says what the word actually was, and the true
word's counts go up either way.

- The prose is **never shown before the player predicts it** — the card
  carries only the image and source. Reading first would make it a memory
  test.
- Nothing is punished. Early documents are mostly misses; that's what an
  untrained model is.
- Candidates rest in rank order, heaviest furthest along the belt. Spacing
  is computed from measured widths so tags can't overlap.
- **The belt is weighted to read as a real choice**: candidates of the
  blank's own word class rise (×1.5), unclassed words — past-tense verbs,
  mostly — sink (×0.35) but can still fill a thin belt. Knowing that a noun
  goes here isn't cheating; syntax is one of the things pre-training
  genuinely learns. Without it, 27% of tags were verbs and plugging them in
  was clerical rather than a decision.
- **60s per document.** In the final 8 seconds anything still resting slides
  off at a shared speed. A blank whose tags all run off is one the model
  never answered — which is why there's no "…" button.
- **Skip advances one blank**, not the document. Skipping the last blank, or
  running the clock out, holds the finished text up for 15s to be read.
- Surprise is in bits: how far down its ranked list the model had to go to
  find the word actually used. 0 = top pick, 7 = never seen. The
  per-document average drives the sparkline, which is the loss curve.

Typical curve, trained on the full corpus:

```
3.5  7.0  3.5  1.5  7.0  2.6  7.0  1.9  3.2  0.6  2.2
```

16 of 33 blanks land in the top five; 8 of 11 documents contain a win. The
spikes are documents opening a domain nothing before them touched.

### Corpus rules

11 documents in `js/data.js` as `body` arrays, ~65 words each.
`[bracketed]` words are blanks. When editing, all four must hold:

1. A blank needs **at least two content words of context** ahead of it in
   the same document.
2. A blank must **never repeat a word appearing earlier in its own
   document.** This is what makes Act 1's repeat penalty safe: a suppressed
   word is always a wrong answer, so filling the belt with them can't make
   a blank easier.
3. Vocabulary must **recycle across topic clusters** (frog/pond,
   rain/wet/cold, plate/hot, cake/party, ball/park). That's what makes an
   11-document corpus produce a learning curve.
4. Every Act 3 `correct` answer must **exist in the corpus**, or its message
   is unanswerable by construction.

`STOPWORDS` keeps function words out of the table; on this little text "the"
would otherwise co-occur with everything. `he` and `she` are deliberately
**not** stopped — the gender beat in Act 3 needs both in the model. The
coffee shop document has a pronoun blank for the same reason; it sits
immediately after "doctor" so that pair dominates the belt there.

---

## Act 2 — Quality Control

Instruction tuning, in three beats. The middle one is the original sorting
task — supervisor, `?` and `=` fields, ten lights, stamp and siren —
unchanged.

**Before.** A question arrives and is answered from the Act 1 model with no
frame to put it in, so the reply continues like a document and doesn't stop:

```
"Where does a frog live?"        →  pond walked edge garden      👎
"What do you take in the rain?"  →  umbrella cold day cloud      👎
```

**Sort.** Slips into `?` and `=`, ten correct. No instructions — the shape
is inferred from feedback.

**After.** The same questions, now with a frame carrying one blank:

```
"Where does a frog live?"        →  In the pond.                 👍
"What do you take in the rain?"  →  Take your umbrella.          👍
```

Two rules to preserve if this is edited:

- **The after beat is approved whatever word goes in the gap.** "In the
  sky." passes too. The supervisor grades form, which is what format tuning
  grades — and it sets up Act 3 thanking a wrong answer.
- **Act 2 never calls `Model.read()`.** Tuning supplies frames, not word
  weights, so Act 3 inherits exactly the table Act 1 built.

Frames are article-agnostic (`Take your ___`, not `An ___`) so any noun the
table offers reads grammatically.

---

## Act 3 — Deployment

A chat window. Requests arrive; the reply is a frame with blanks; the words
come from the trained model. The belt sits stopped in the background with
the hatch boarded over — the knowledge cutoff, shown rather than said.

The model observes the incoming message and the slot's `anchors`, then
offers what its own table puts nearest, whether or not the right answer is
among them. Nothing marks a wrong option as uncertain.

Candidates are filtered by `WORD_CLASS` so they read grammatically in their
frame. **A word with no class is never offered** — that's the safety net, so
leaving one out is safe and adding a wrong one is not.

**The unnoticed hallucination**: the first trainable miss is thanked anyway,
with nothing said at the time. It surfaces on the end screen.

> **me** — he gets the pond and they live happily ever after.
> **them** — Oh nice — "he gets the pond and they live happily ever after." Thanks!!

**Gendered underrepresentation** (message 8): the corpus mentions a doctor
twice and calls him "he" both times. It knows "she" perfectly well — she
sits with `princess`, `knelt`, `waiting` — she has just never appeared near
a job. So a slot filtered to people and anchored on the doctor can only
offer one word, and the player wanting the other one is the point. The
prompt says "daughter" and never "she", so the missing word is missing on
merit rather than because the repetition filter dropped it. Untrainable, so
it costs no strike.

Three messages are unanswerable **on purpose**:

- **Message 6** (*"flight canceled… what do i do?"*, wants `house`) is the
  designed hallucination host — most tables offer only `sky`, `pond`,
  `field`. All fluent, all wrong.
- **The rocket** has an empty bar. The newspaper lands on the desk at
  message 6 and tells the player the answer; the bar still doesn't change,
  because reading something doesn't put it in the weights.
- **Message 8** offers only `he`, above.

Three strikes on trainable messages triggers deprecation.

---

## Odds and ends

**The end screen** — accuracy, the unnoticed hallucination, and the gender
reveal counted straight off the trained model: how often it saw `he` versus
`she`, that `doctor` only ever sat next to one of them, and what the player
was able to answer on the birthday-card message. Player-facing copy avoids
jargon — "training data", not "corpus" or "inference".

**Popup images** — each document shows a real image from `assets/images/`
with an invented `source` line, so the act reads as documents being ingested.

**Phase music** — four tracks in `assets/audio/`, crossfaded by
`Audio2.playPhase()`: `the-last-atom` (opening), `sort-it-out` (Acts 1–2),
`best-guess` (Act 3), `thank-you` (ending). The opening track doesn't loop
— it runs 19.7s and the phase change at 17.4s crossfades out of it, so it
lands on its own ending.

**Debug helpers**, console only:

```js
ML_DEBUG.toPretrain()     // Act 1 (what BEGIN runs)
ML_DEBUG.ptModel()        // inspect the table, freq, curve
ML_DEBUG.toQC()           // Act 2
ML_DEBUG.toEra2()         // Act 3
ML_DEBUG.toEnd()          // deprecation + end screen
ML_DEBUG.state()          // session state
```

## What's left

- **Remove the legacy path** — `era1.js`, its markup and CSS, the `text`
  field on every snippet, `ML_DEBUG.toOldEra1()`, and `State.associations`
  with its helpers. Nothing consumes the old table any more; `ending.js` is
  already clear of it. `NEWSPAPER` in `data.js` is dead too — the
  newspaper's content is hardcoded in `index.html`.
- **Pacing is unverified.** Every timing constant in `pretrain.js` and
  `qc.js` was reasoned about, not measured — automated browsers throttle
  timers. Needs a real playthrough.
- **The QC desk** is a fixed-width flex row and needs proper work if narrow
  screens ever matter.
- **Open ideas**, tracked as issues: temperature dial; the context window as
  a mechanic; player choice over the corpus; a role-flip ending.

The retired drag-to-file Era 1 and its trap set are gone as of this
cleanup; the older design docs (`most-likely-build-reference.md`,
`most-likely-claude-code-brief.md`, `most-likely-rework-spec.md`) still
describe them. Kept as history, not as spec.

## Deliberately not in v1

No relaxed/untimed mode, no aggregate player stats, no document shuffling,
fixed 11-document order.
