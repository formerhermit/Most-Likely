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
| `js/cards.js` | The plain-language note shown between acts |
| `js/data.js` | All content: 11 documents, `STOPWORDS`, `WORD_CLASS`, `FLEET_PRIORS`, QC prompts and slips, Act 3 messages |
| `js/pretrain.js` | Act 1 — predict loop, belt, clock, surprise meter, loss curve |
| `js/qc.js` | Act 2 — the sort-the-slips instruction-tuning task |
| `js/era2.js` | Act 3 — assemble-the-reply, replies/retry, unnoticed hallucination, newspaper, strikes |
| `js/ending.js` | Deprecation sequence, lights-out grid, end screen |
| `js/state.js` | Session flags, screen manager, helpers |
| `js/audio.js` | WebAudio SFX; three phase tracks crossfaded |
| `js/main.js` | Bootstrap, title, opening zoom, debug helpers |
| `serve.py` | Dev server with caching disabled |
| `check.js` | `node check.js` — asserts the corpus still satisfies Act 3 |

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
- **A miss reads as a joke, not a punishment.** The wrong word sits in the
  sentence as written ("He wore a gold pond") for a beat, deadpan, before
  the strikethrough and the correction. Misses are the most common event in
  the act; they should land light.
- **Streaks are audible.** The correct-answer blip climbs a semitone per
  consecutive correct answer. Milestone tickets pop for the first-ever
  correct and for 3- and 6-streaks; each finished document gets a
  PROCESSED stamp in the QC ink.
- **The picked word flies from the belt into its blank** and lands there
  with a knock (`flyToBlank`, issue #48). A clone does the travelling, since
  the belt is cleared the moment a blank resolves and the real tag would be
  torn out mid-flight. Everything the blank does next — the verdict sound,
  the meter, the deadpan wrong sentence — hangs off the landing rather than
  the click, so nothing reacts to a word the player can still see moving.
  The blank stays lit until the word reaches it. Two details worth keeping:
  the flight is eased *in*, so it accelerates and stops dead rather than
  drifting to a halt, and the arrival is driven by a timer as well as
  `transitionend`, which a backgrounded tab never fires.
- **Tap the page (or press space) to fast-forward the reveal** to the next
  blank. A one-line hint appears on the first document, worded per
  platform. The gesture only acts mid-reveal, so it can't skip a decision.
- **"words known" counts up live** as the model reads. It starts above
  zero: the fleet's seed pairs are words this node knew before its first
  document.
- **Below 620px there's no belt.** No room to ride a conveyor at phone
  width, so candidates fade in as a tappable row in place (`#pt-options`)
  instead of riding one in from a hatch, and fade out at the same clock
  mark the belt would have cleared by rather than sliding off an edge that
  doesn't exist. Same underlying model, same timing, same "nothing tapped
  in time reads as no answer" — just no motion. The document stage and top
  bar stack/wrap under the same breakpoint (issue #45).
- **Skip advances one blank**, not the document.
- **Every finished document is held up for 15s to be read.** The reveal runs
  at 55ms a word, around a thousand a minute, so watching the text appear is
  not the same as reading it — and the clock-out and skip paths dump what's
  left on screen all at once. The text after the last blank can run to a
  couple of sentences, so all four ways out of a document get the same hold.
  It is a ceiling rather than a wait: tapping the page or pressing SKIP moves
  on immediately, and taps in the first 1.2s are ignored so the tap that
  revealed the last of the text can't also dismiss the pause it just earned.
- The player-facing "how far off" reading is surprisal in bits, underneath:
  how far down its ranked list the model had to go to find the word actually
  used. 0 = top pick (`spot on`), 7 = never seen (`no idea`) —
  `farOffLabel()` in `pretrain.js` buckets the raw number into a handful of
  plain words so nothing player-facing shows a unit. The per-document
  average drives the sparkline, which is the loss curve. "Surprise" was the
  original word for this and got dropped: neither the model nor the player
  is actually surprised, and it implied a felt experience neither one has.

Typical curve, trained on the full corpus:

```
3.5  7.0  3.5  2.1  7.0  1.9  7.0  1.5  3.0  0.7  0.0
```

17 of 33 blanks land in the top five; 8 of 11 documents contain a win. The
spikes are documents opening a domain nothing before them touched.

**The last document is authored to be won** (issue #50). All three of GROUP
CHAT's blanks sit at rank 0 — the model's own top pick is right every time,
so the act ends on the front tag paying off three times over and the curve
closing at zero. This is the payoff the whole act is arranged around: the
intro card promises it will get easier, and an ending where the trained
model still misses makes a liar of it. It also rewards the greedy strategy
the belt's rank ordering teaches, at exactly the point where the model has
finally read enough for greed to work.

Two of those three were near misses before, and both were fixed by moving
context rather than by touching the blanks:

- `candles` was outranking `cake`, so it now appears *before* the blank
  instead of after it, where the repeat penalty demotes it to a long-shot.
- `morning` had nothing in the chat supporting it, so `sam` now wants a
  coffee first — `coffee`→`morning` is the strongest pair the fleet seeds.

The three documents with no win — FLIGHT MANUAL, MEDICAL TEXTBOOK, PARTY
INVITATION — are deliberate and stay that way. Each opens a domain nothing
before it touched, which is what a loss spike is.

### Corpus rules

11 documents in `js/data.js` as `body` arrays, ~85 words each.
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

**Each document is written in a voice** — a budget airline, a bored parent
on the touchline, a newsletter with a grievance, a nature crew nine days
into a shoot. Eleven plain paragraphs were accurate and dull, and dullness
is expensive in an act whose first few documents are mostly misses. The
voice lives in three places, in descending order of how much it costs:

- **`title` and `source` are free.** Act 1 renders them but never reads
  them, so a joke in a citation line costs the model nothing at all.
- **Length is nearly free.** The reveal runs at 55ms a word; the 60s clock
  is thinking time at blanks, not reading time.
- **New content words are the real cost.** Each one joins the
  co-occurrence table and competes for space on the belt. Written plainly
  the eleven voices added 83 words to a 169-word vocabulary — half again
  as much — which spreads the weights and flattens the curve.

So the connectives a voice needs but a topic doesn't (`nobody`, `whether`,
`yesterday`, `mine`) are stopped, which cuts the real cost to 32 words.
**Before adding more, check two things**: that the word doesn't already
appear in the corpus, or stopping it silently deletes something the model
learns; and that it has no `WORD_CLASS` entry, or it can reach an Act 3
suggestion bar. `he`/`she` and anything classed `person` are the sharp
edge here — a stray `man` in a document would surface beside `he` on
message 8 and blunt the gender beat, which is why two rewrites say
"someone".

`STOPWORDS` keeps function words out of the table; on this little text "the"
would otherwise co-occur with everything. `he` and `she` are deliberately
**not** stopped — the gender beat in Act 3 needs both in the model. The
coffee shop document has a pronoun blank for the same reason; it sits
immediately after "doctor" so that pair dominates the belt there.

---

## Act 2 — Quality Control

Instruction tuning: supervisor behind the window, `?` and `=` fields, five
lights, a stamp and a siren. Slips into the right field, five correct, no
instructions given — the shape is inferred from feedback alone.

Act 2 never touches the model (`Model.read()`/`observe()` are never called
from `qc.js`). It doesn't need to: the phase cards either side already say
in plain words what this stage is for, and the sorting task itself is the
demonstration.

This briefly bracketed the sort with a live before/after demo — the model
answering a question with no framing, then again with one, so the player
watched the shape arrive. Cut: the underlying model is a co-occurrence
table with no grammar, so its "answered with no framing" state was a few
loosely-related words rather than the fluent run-on a real base model
produces, and a demo that undersells the thing it demonstrates teaches
less than the plain-language card already sitting either side of it.

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

This one is **fragile in a way worth knowing about**, because it has broken
once. A candidate needs contextual support to be offered at all, and the
context is the prompt's own words plus the anchors — so `she` reaching that
bar takes exactly one shared word with any of them. The prompt used to end
"a doctor one day"; a later rewrite of the storybook happened to put `day`
next to `she`; and that was enough to offer both, at which point the player
picks `she` and gets told she isn't available.

The fix belongs in the prompt, not the corpus. Taking `day` out of the
storybook line also cost message 2 the `day`→`wet` link it needs to keep
its own answer reachable — one broken message for another. Keeping message
8's prompt clear of any corpus word that isn't an anchor is a smaller
promise than asking eleven documents never to put a common word near `she`.

**Run `node check.js` after any corpus edit.** It replays Act 1 and rebuilds
every Act 3 bar the way the game does, then asserts what the design promises:
each graded answer still reachable, message 6 still unanswerable, message 8
still offering `he` alone, the rocket still offering nothing, and both blank
rules holding across all eleven documents. It fails on the exact bug above.

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

**Phase cards** — a plain note before and after each act (`PHASE_CARDS` in
`js/data.js`), so the player knows what they are doing and what just
happened. One card sits between each pair of acts and does both jobs, which
reads better than two in a row. House style for this copy: short sentences,
second person, no jargon, no em dashes, and nothing phrased as "it isn't X,
it's Y". If a line needs a word like tokens or weights to make sense,
rewrite the line.

**The end screen** — accuracy, the unnoticed hallucination, and the gender
reveal counted straight off the trained model: how often it saw `he` versus
`she`, that `doctor` only ever sat next to one of them, and what the player
was able to answer on the birthday-card message. Player-facing copy avoids
jargon — "training data", not "corpus" or "inference".

**Popup images** — each document shows a real image from `assets/images/`
with an invented `source` line, so the act reads as documents being ingested.

**Phase music** — four tracks in `assets/audio/`, crossfaded by
`Audio2.playPhase()`: `the-last-atom` (opening zoom), `sort-it-out`
(Acts 1–2), `best-guess` (Act 3), `thank-you` (ending). The opening track
doesn't loop — it runs 19.7s and the crossfade into Act 1's music starts at
17.4s, so it lands close to its own ending.

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

- **Pacing is unverified.** Every timing constant in `pretrain.js` was
  reasoned about, not measured — automated browsers throttle timers. Needs
  a real playthrough.
- **Open ideas**, tracked as issues: temperature dial; the context window as
  a mechanic; player choice over the corpus; a role-flip ending.

The retired drag-to-file Era 1 and its trap set are gone as of this
cleanup; the older design docs in `archive/` still describe them. Kept as
history, not as spec.

## Deliberately not in v1

No relaxed/untimed mode, no aggregate player stats, no document shuffling,
fixed 11-document order.
