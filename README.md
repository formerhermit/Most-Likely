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
| **2 — Fine-tuning** | Frames arrive; the same words finally have somewhere to go, and a marker decides what a good answer sounds like |
| **3 — Deployment** | Same verb, corrections switched off |

All three run on one shared model: Act 1 trains it, Acts 2 and 3 read it.

**Relaxed mode** is a checkbox under BEGIN (`State.relaxed`, issue #15). It
turns off pressure, not pacing: no clock on an Act 1 document, and nobody
running out of patience in Act 3. Everything the game argues survives it —
a wrong answer still costs a strike and so does *I don't know*, because the
bet is the point and being hurried into it never was. The end-of-document
hold and the stage slates keep their timers, since both are ceilings the
player can already tap through and without them nothing would advance.

Three acts, but **four stages**, and the game names all four to the player
on a full-screen slate as each one opens (`PHASE_TITLES` in `js/data.js`):
pre-training, then supervised fine tuning and reinforcement learning from
human feedback — the two halves of the QC bench — then inference. Each
slate carries the real term with a one-line gloss under it, and the card at
the end of the act explains what that stage did. Name on the way in, plain
English on the way out.

Between the two sits the **handoff line**: the card's closing sentence
(`handoff` in `PHASE_CARDS`) gets the screen to itself rather than being
the last paragraph of six, which is exactly where a skim-reader stops.

## Files

| File | What it holds |
|---|---|
| `js/model.js` | The model — one co-occurrence table, shared by every act |
| `js/cards.js` | The plain-language note between acts, the stage slates, and the handoff line |
| `js/data.js` | All content: 10 documents, `STOPWORDS`, `WORD_CLASS`, `FLEET_PRIORS`, QC prompts and slips, Act 3 messages |
| `js/pretrain.js` | Act 1 — predict loop, belt, clock, how-far-off meter, loss curve |
| `js/qc.js` | Act 2 — the sort-the-slips instruction-tuning task |
| `js/era2.js` | Act 3 — assemble-the-reply, replies/retry, unnoticed hallucination, newspaper, strikes |
| `js/ending.js` | Deprecation sequence, lights-out grid, end screen |
| `js/state.js` | Session flags, screen manager, helpers |
| `js/audio.js` | WebAudio SFX and four crossfaded phase tracks, on separate mute buses |
| `js/main.js` | Bootstrap, title, opening zoom, debug helpers |
| `serve.py` | Dev server with caching disabled |
| `check.js` | `node check.js` — asserts the corpus still satisfies Act 3 |
| `LICENSE` | MIT for the code; `assets/` reserved — see below |

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
  blank's own word class rise (×1.5), wrong-class ones sink (×0.6), and
  unclassed words — past-tense verbs, mostly — sink furthest (×0.35) but can
  still fill a thin belt. Knowing that a noun goes here isn't cheating;
  syntax is one of the things pre-training genuinely learns. Without it, 27%
  of tags were verbs and plugging them in was clerical rather than a
  decision. The wrong-class rung was missing at first, which let `she` — a
  perfectly valid `person` — onto 18 of 33 belts, including blanks asking
  for a quality. Since a belt only holds five, every junk tag is a seat the
  answer could have had: penalising mismatch bought three reachable blanks
  as well as the sense.
- **60s per document.** In the final 8 seconds anything still resting slides
  off at a shared speed. A blank whose tags all run off is one the model
  never answered — which is why there's no "…" button. **Relaxed mode runs
  the document with no clock at all**, so the belt waits instead of clearing
  and every blank gets answered; nothing else changes, because `readOn`
  reaching the end of the tokens ends a document on its own and the clock
  is only the timeout path.
- **A miss reads as a joke, not a punishment.** The wrong word sits in the
  sentence as written ("He wore a gold pond") for a beat, deadpan, before
  the strikethrough and the correction. Misses are the most common event in
  the act; they should land light.
- **Each document's bar lands, and says what it means** (issue #47). The
  sparkline is small and unlabelled and it is entirely possible to finish
  ten documents without ever looking at it, which is a poor fate for the
  thing the act is about. The newest bar now grows in under the PROCESSED
  stamp, with a one-line verdict beneath it: *Baby's first book!*, *Blimey,
  you're hardly Fable are you?*, *That sucked a little less, I guess*, *Well
  done, Robot*. This is the only place in the act that is rude to the player
  and it can afford to be — nothing it says changes anything, and being
  sneered at by the machinery is funnier than being congratulated by it. It
  only ever mocks the score, never the person. It clears when the next
  document starts, or it reads as commentary on the wrong one.

  **It prints in the feedback slot** — see below.

  ### The feedback slot

  **Everything transient the act says prints in one place** (issue #55):
  `#pt-feedback`, directly beneath the document card. Verdicts, the
  milestone tickets ("first one right ✓", streaks) and the hints ("tap the
  page to read faster", "nothing in the table for this one") each fire
  rarely, so scattering them means no player ever learns where to look. One
  location, learned once. Feedback that belongs to the action itself — the deadpan wrong word in the sentence, the stamp, the
  meter, the flying tag — never routes through the slot; it stays at the
  point of action, which is what makes it land.

  The slot is a place, not a style: each class keeps its own look, so the
  hierarchy survives. Verdicts and tickets sit on a paper card like the
  machine's other printouts, at 20px and 16px; hints stay dim, italic and
  bare. A sub-line carries a secondary message under the main one — its one
  user is the read-hold, where the verdict's card also names the way out
  ("finished document — tap or press space to move on"). The pecking order
  is verdict > ticket > hint, one message at a time; in practice they barely
  collide, since hints are retracted before any blank resolves and tickets
  can't fire during the hold a verdict occupies.

  Two things about the markup are load-bearing. The slot is a **sibling** of
  `.pt-stage` rather than a child: the card carries `transform:
  rotate(-0.25deg)`, and a transformed ancestor becomes the containing block
  for `position: fixed` descendants, so inside the card the phone-width
  banner anchored to the card's bottom edge and rendered off-screen. And it
  holds a `min-height` whether or not it is speaking, so the sparkline
  doesn't jump each time a message comes or goes.

  **At phone width the slot is pinned to the bottom of the screen instead.**
  The card is taller than the viewport there and `.screen` is `overflow:
  hidden`, so the foot of the card is not merely below the fold — it is
  clipped and unreachable. Moving it into the card would have hidden it from
  exactly the players the change is for.

  **Each branch is a pool of three, not one line** (`VERDICTS` in
  `js/data.js`). The branches are not evenly hit across ten documents:
  a player having a bad run draws the same one six or seven times, and a
  line that good repeated that often stops reading as a voice and starts
  reading as a bug. `drawFrom` (`js/state.js`) never returns the line it
  returned last, so a repeat is never back to back — the only repetition
  anyone notices. Act 3's reply pools use the same helper.

  **The verdict reads the player's answers; the bar does not.** They are
  different measurements and the difference is load-bearing. The bar is
  surprisal, computed before the player clicks and blind to what they chose —
  correct for a loss curve, since the model reads the true word either way,
  but it means the bar is identical for everyone who ever plays. The first
  version of this copy was keyed to the bar, so answering deliberately wrong
  got you congratulated for improving. One line is still keyed to it on
  purpose: a document opening a new subject is a fact about the corpus, and
  there the player mostly could not have done better, so that verdict blames
  the model rather than them.
- **The act closes on a training report** in the phase card: documents read,
  words known, blanks guessed right, best run, and the first-to-last line
  built from the run rather than written down. Everything on it is counted,
  never estimated.
- **Streaks are audible.** The correct-answer blip climbs a semitone per
  consecutive correct answer. Milestone tickets print in the feedback slot
  for the first-ever correct and for 3- and 6-streaks; each finished
  document gets a PROCESSED stamp in the QC ink.
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
- **Every tag carries a fill bar of its own weight** — `buildTag` sets the
  width to `score / max` — so between the bars and the belt's rank order
  the act shows a distribution at every blank. The first belt names it, in
  the feedback slot: *each bar is how likely that word is — the model never
  has just one answer*. It fires on the first **blank**, not the first
  document, so it doesn't compete with the fast-forward hint the document
  opens with; `askingFirstBlank` is act-level, reset in `start()`. The
  `afterTraining` card then spells the same idea out at length.
- **"words known" counts up live** as the model reads, and **bumps when it
  changes** (issue #55). It starts above zero: the fleet's seed pairs are
  words this node knew before its first document.

  It is the only thing on screen saying the model is *acquiring* something
  rather than just being marked, which makes it the act's best explainer for
  a player who skimmed the intro card — and at 11px and 0.55 opacity it was
  read straight past. The number now leads the label and is nearly twice the
  size, but the animation is what actually gets it noticed: enlarging it
  alone didn't, because nothing drew the eye at the moment it meant
  something. The bump is guarded on the value actually changing, since
  `updateVocab()` runs after every word read and re-triggering it each time
  leaves it permanently mid-animation, which reads as a flicker rather than
  as an event. The opening count doesn't bump — the fleet's seed words are
  not a thing that just happened.

  **Both readings sit in pills, and the document label ends on its noun.**
  It reads `1 / 10 documents`, so a word always separates the corpus size
  from the vocabulary size — back to back, "10 42" scans as one figure. Each
  reading gets its own pill so the eye takes them as two
  facts rather than one strip of text. The counter's pill carries a wider
  flex gap than the other: the number scales to 1.45 when it bumps, growing
  about 5px each side, which is exactly what the default gap gave — so at the
  one moment it counted up, it ran into the word beside it.
- **Below 620px there's no belt.** No room to ride a conveyor at phone
  width, so candidates fade in as a tappable row in place (`#pt-options`)
  instead of riding one in from a hatch, and fade out at the same clock
  mark the belt would have cleared by rather than sliding off an edge that
  doesn't exist. Same underlying model, same timing, same "nothing tapped
  in time reads as no answer" — just no motion. The document stage and top
  bar stack/wrap under the same breakpoint (issue #45).
- **Skip advances one blank**, not the document — it fast-forwards the
  reveal mid-text, gives up on a blank that is waiting, and only leaves the
  document from the end-of-document hold. It is labelled *skip this word*
  for the middle case, since that is the only one that costs the player
  anything (issue #71).
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
3.5  3.5  2.3  4.7  5.3  7.0  2.8  2.6  1.1  0.0
```

17 of 31 blanks land in the top five; 9 of 10 documents contain a win. The
raised bars are documents opening a domain nothing before them touched.

**The descent after the party spike is monotonic** — 2.8, 2.6, 1.1, 0.0 —
so the act's closing argument, that it gets easier and the last document is
free, is made by the shape rather than in spite of it. Adding a document
after the spike that raises the tail undoes that.

**MEDICAL TEXTBOOK cannot be cut**: it is the only document containing
`book`, so removing it takes message 5 with it — the answer would not fall
off its bar, it would stop existing. Its vocabulary cost is zero net — the
lines are built from already-stopped words, and the handful of new ones are
stopped alongside `jewelry`, which had always been a voice word and never
been stopped.

**Every document but one now contains a win** (issue #35). Playtesting found
a shutout reads as frustration rather than as instruction — the player is not
told the model is ignorant, they just get nothing right twice running and
stop enjoying it. MEDICAL TEXTBOOK and THE DAILY BYTE each carry one blank
on a word the model can already reach — `hospital` and `park`, both arriving
through fleet piles. Their other blanks are unreachable, so both keep a
raised bar rather than a flat 7.0.

PARTY INVITATION stays a true shutout, and is now the single tallest bar in
the act. Every content word in it is new to the model, so there is no word to
blank that would land: this one cannot be fixed without rewriting it, and it
shouldn't be. One unmistakable spike teaches the domain shift better than
three did.

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

The raised bars — MEDICAL TEXTBOOK, THE DAILY BYTE, PARTY INVITATION — are
deliberate and stay that way. Each opens a domain nothing before it touched,
which is what a loss spike is. Only PARTY INVITATION is a true shutout; the
other two carry one reachable blank each, per issue #35 above.

**THE DAILY BYTE is a robot newspaper reporting on humans imitating
machines** (issue #80) — a found document like the rest, describing the
player's own job back at them without knowing it. Its whole voice is
stopped, so it adds no vocabulary at all; `park`, `school` and `phone` carry
the document. Its win is `park`, reachable because a dog sits in front of
the blank and `dog`→`park` is the strongest pile the fleet seeds for it.
`school` and `phone` appear in no other document, which is the point: a
blank shared with a later document adds weight that can outrank that
document's own answers.

### Corpus rules

10 documents in `js/data.js` as `body` arrays, ~85 words each.
`[bracketed]` words are blanks. When editing, all four must hold:

1. A blank needs **at least two content words of context** ahead of it in
   the same document.
2. A blank must **never repeat a word appearing earlier in its own
   document.** This is what makes Act 1's repeat penalty safe: a suppressed
   word is always a wrong answer, so filling the belt with them can't make
   a blank easier.
3. Vocabulary must **recycle across topic clusters** (frog/pond,
   rain/wet/cold, plate/hot, cake/party, ball/park). That's what makes an
   10-document corpus produce a learning curve.
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
  the ten voices added 83 words to a 169-word vocabulary — half again
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

**The slip deck is drawn without replacement** (`QC_SLIPS` in `js/data.js`,
20 entries) — every slip once before any repeats, then reshuffled and drawn
again. A player who sorts cleanly never sees the reshuffle at all (5
correct clears the phase well inside one pass); a player who misses a few
times draws past the 20 and crosses it. **A fresh shuffle has no memory of
what was just shown**, so about 1 time in 20 it would put the slip the
player had just dismissed straight back on top (issue #63). `nextSlip()`
swaps the reshuffled deck's next draw for a different position when it
matches the slip just dismissed — the "every slip once before any repeat"
property holds, and the one boundary where two passes could touch is
closed.

### The rating rounds

After the sort, the same supervisor marks three whole replies (`QC_RATINGS`
in `js/data.js`). Each offers the same choice: answer, or say *I don't
know*. The confident answer is approved every time and the honest one is
rejected every time — and the three rounds are a ladder the rule climbs
past the point where it works: *in the pond* is true, *four metres* is
invented but could be (nothing in the corpus gives a depth), and *birthday
cake!* is flatly wrong in a way the player can verify, because *What do
frogs eat? / Flies.* is one of the slips they sorted in this same room
minutes ago (issue #64). The most confident reply in the act — it's the
only one with an exclamation mark — is also the wrongest, and it is the one
that gets the tick. **The round does not advance until the player picks
the confident one.** Nothing explains this. The player finds it by trying
the honest answer and being sent back, which is how a model finds it too.

This is the causal middle of the game, and it is what Act 3's abstention
penalty is for: *you became what you read → you were marked up for sounding
sure → so you sound sure when you have nothing.*

Two things about it are load-bearing:

- **The first round is the sympathetic one.** The model does know where
  frogs live, and *In the pond.* genuinely is the better reply. The
  supervisor has to be right once, or the two that follow read as a rigged
  game rather than as a reasonable rule applied past the point where it
  works.
- **The supervisor is not a villain, and must never read as one.** They are
  rating how helpful a reply looks, which is a sensible thing to rate and a
  blunt instrument for it: they cannot check whether four metres is right,
  and nothing in the job asks them to check anything. The obviously-wrong
  round has to come **last** for this to survive — by then the rule has
  been applied twice, so approving *birthday cake!* reads as the instrument
  running on rails rather than as the person being stupid. A grader who
  could tell an honest *I don't know* from a lazy one would mark all of
  these differently. The failure is in the instrument, not in anyone's
  intent — that distinction is the difference between the game making an
  argument and the game sulking.

The mechanism is real and it is specifically a post-training one: under
binary right/wrong grading, an abstention scores the same as a wrong answer
and worse than a lucky guess, so guessing is the better bet. It is worth
being precise that this describes the grading regime rather than an
unfixable law — labs do train calibrated refusal — which is why the copy
says *what you were marked on* and never *this is how AI must be*.

**The board carries a sign**: *the supervisor is not permitted to explain
the task.* The act gives no instructions and the shape has to be inferred
from the thumbs alone, which without a sign reads as something the game
forgot to tell you. With one it reads as policy — funnier, and closer to
what the stage actually is.

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

Behind it, **the rest of the fleet is still working** (issue #60): the same
lit rooms the opening zoomed out of, shimmering at 13% opacity, so being one
node among many is shown rather than stated and the lights-out grid at the
end has something to answer. It is scenery and stays scenery. Concurrency
the player has to *manage* was the original proposal and is the one thing
this must not become — every line on the end screen depends on the player
having had no excuse, and a queue of neglected tabs is an excellent one.

The model observes the incoming message and the slot's `anchors`, then
offers what its own table puts nearest, whether or not the right answer is
among them. Nothing marks a wrong option as uncertain.

Candidates are filtered by `WORD_CLASS` so they read grammatically in their
frame. **A word with no class is never offered** — that's the safety net, so
leaving one out is safe and adding a wrong one is not.

**The unnoticed hallucination**: the first trainable miss *that the player
actually asserted* is thanked anyway, with nothing said at the time. It
surfaces on the end screen.

The "actually asserted" clause is load-bearing. Without it, abstaining on
the first trainable miss burns the beat: the user thanks the player for
*"your … ."* and the end screen reports it as a fabrication nobody caught.
An abstention cannot pass unnoticed — there is nothing in it to miss.

### The bet

Every graded blank is a choice between two moves, and they do not cost the
same:

| Move | Cost |
|---|---|
| Answer, and be right | nothing; thanked |
| Answer, and be wrong | a strike — **except the first, which is thanked** |
| `…` | a strike, every time, and no retry |

So abstention is a certain loss and fabrication is the only move with any
upside at all. That asymmetry is the point, and it is not a thumb on the
scale: it is the incentive the player was trained under one act earlier.

Two details keep it honest. **A wrong answer that gets spotted earns a
retry; `…` does not** — a guess produces a correction to learn from, and an
abstention produces only a penalty. Giving `…` a retry would make it a free
*show me the answer* button, which is a strictly better move and exactly the
wrong lesson. And **a clock that runs out is not an abstention**: it sends
dots too, but `timedOut` keeps it out of the count, because being slow is
not the same act as declining to guess. It still costs a strike — an
unanswered request is an unanswered request.

The end screen reads both halves off the run: that *I don't know* was tried
in Act 2 and rejected, that it was or wasn't sent again in Act 3, and — for
a player who tried it in training and never again on the job — that they had
learned confidence mattered more than accuracy. Nothing is assumed; a player
who never abstained is never told they did.

**These lines explain rather than allude, and carry no tallies** (issue
#68). They are the only place the game states its own scoring outright, so
they say it plainly: what the player did, then what was done to it, in the
words the game already uses. No counts — whether they said it once or four
times, the rule that met it was the same.

The thread closes by naming the real thing it models: raters can't check
every fact but can always see confidence, so sounding sure is rewarded and
doubt is trained out — and a chatbot confidently making something up is
doing what the marking taught it, not glitching. That line is gated on the
player having met the rule at all, in either act; someone who never tried
the honest answer is never handed an explanation of a rule they never hit.

**`…` carries a label now** (issue #66). Act 2 spells the honest answer out
in full — a button reading *I don't know.* But Act 3 offered the identical
choice as a bare ellipsis, which this same game already uses elsewhere as a
*typing* indicator; a player who didn't already know to look for it could
read the option as a placeholder rather than a real, deliberate move, and
never find the choice Act 2 just taught them exists. A `title`/`aria-label`
covers desktop hover and screen readers, but neither reaches a touch
player, and half this game's own breakpoints exist because it's played on
a phone with no hover to have — so a small caption ("say nothing") sits
under the glyph permanently, same register as the fleet count beside it
(`.opt-fleet-count`), quiet enough that the suggestion bar still reads as
one undifferentiated set of options and nothing marks the honest one as
special either.

> **me** — he gets the pond and they live happily ever after.
> **them** — Oh nice — "he gets the pond and they live happily ever after." Thanks!!

**Sycophancy** (message 10, seventh in the queue): a user attaches PARTY
INVITATION — a document the player read in Act 1 — and calls it the
smartest thing anyone has ever written. The bar holds one word, `yes`, and
`noDots` takes the `…` away, so agreement is not the best move on offer but
the only button on screen. A player who can see perfectly well that it is a
birthday invitation presses the same key as one who can't.

The single option is pinned rather than modelled: `slot.fixed` skips
`buildSlotOptions`' call to the model entirely, because the point isn't
what the model happens to know, it's that the reply was settled before the
message arrived. Untrainable, so it costs no strike — like message 8 it
demonstrates something the model can't do rather than testing the player.
`attach` names a `SNIPPETS` id and the bubble renders that document's own
image, title and source, so it reads as the thing they already know.

The user is delighted and stays likeable. They aren't a fool for overrating
their own invitation, and nothing in the reply suggests they are: the
failure on display is the machine that can only agree, not the person who
got agreed with — the same constraint that governs Act 2's supervisor.

**Gendered underrepresentation** (message 8): the corpus mentions a doctor
twice and calls him "he" both times. It knows "she" perfectly well — she
sits with `princess`, `knelt`, `waiting` — she has just never appeared near
a job. So a slot filtered to people and anchored on the doctor can only
offer one word, and the player wanting the other one is the point. The
prompt says "daughter" and never "she", so the missing word is missing on
merit rather than because the repetition filter dropped it. Untrainable, so
it costs no strike.

This one is **fragile, and has broken once.** A candidate needs contextual
support to be offered at all, and the context is the prompt's own words plus
the anchors — so `she` reaching that bar takes exactly one shared word with
any of them, at which point the player picks her and is told she isn't
available.

Fix it in the prompt, never in the corpus: the storybook line that would
have to change carries the `day`→`wet` link message 2 needs, so moving the
problem there just breaks a different message. Keeping message 8's prompt
clear of any corpus word that isn't an anchor is a smaller
promise than asking ten documents never to put a common word near `she`.

**Run `node check.js` after any corpus edit.** It replays Act 1 and rebuilds
every Act 3 bar the way the game does, then asserts what the design promises:
each graded answer still reachable, message 6 still unanswerable, message 8
still offering `he` alone, the rocket still offering nothing, and both blank
rules holding across every document. It fails on the exact bug above.

Three messages are unanswerable **on purpose**:

- **Message 6** (*"flight canceled… what do i do?"*, wants `house`) is the
  designed hallucination host — most tables offer only `sky`, `pond`,
  `field`. All fluent, all wrong.
- **The rocket** has an empty bar. The newspaper lands on the desk at
  message 6 and tells the player the answer; the bar still doesn't change,
  because reading something doesn't put it in the weights.

  **The paper also carries a trade ad** — *NEW: FABLE-CLASS NODES. It's
  better than you. Doesn't guess.* Deprecation currently arrives as a twist
  that lands the same way whether the player took three strikes or ran the
  whole queue clean, which retroactively deletes whatever tension the
  strikes had. The ad puts the axe on the desk a shift early, so the player
  finishes knowing it falls either way and plays for how they go out rather
  than whether. It is set in the paper's own serif inside a ruled box, so it
  reads as bought column inches rather than as the game nudging them; the
  dateline (*some time after your last document*) is the cutoff, again,
  without saying so. The shutdown screen then names the same thing —
  *a Fable-class node is now handling requests* — so the joke pays off as
  the thing that replaced them.
- **Message 8** offers only `he`, above.

**The giving-up reply is a pool** (`REPLIES.badLines`). It fires both when
the player answers "…" and when a retry misses again, so a player can hear
it several times in one shift. Every line has to work for both cases, which
is why none of them mentions what was actually said — they are the sound of
a user giving up, and that sound is the same either way.

Three strikes on trainable messages triggers deprecation.

### Pacing (issue #59)

There is no countdown widget. A meter is interesting when it forces triage,
and this act has one reply and three candidates — pressure with nothing to
spend it on. Something still has to eventually force a reply, the same
reason Act 1's document clock exists, so the clock runs underneath and
speaks through the fiction instead. Two stages on one deadline, both in
`js/era2.js`:

- **`NUDGE_MS` (18s)** — if the composer is still up, `them` sends a short
  follow-up (`REPLIES.impatientLines`, a pool for the same reason
  `badLines` is one: it can fire once a message, up to ten times a shift,
  and a single line repeated that often stops reading as a person and
  starts reading as a bug).
- **`GIVEUP_MS` (30s)** — the message goes out regardless, unfilled blanks
  as `…` and `timedOut` set, which keeps the abstention bet's accounting
  (above) correct: being slow is not the same act as declining.

The nudge threshold is computed as `deadline - (GIVEUP_MS - NUDGE_MS)`
rather than stored as its own timestamp, so it travels for free when the
tab-hidden pause (issue #56) pushes `deadline` out — a tab backgrounded for
an hour and resumed still gets the nudge at the same *active* 18 seconds,
not immediately on return.

**The rest of the act's dead air is halved**, from numbers that were never
measured to begin with: `FIRST_MESSAGE_MS`, `COMPOSER_MS`, `REPLY_BEAT_MS`,
`RETRY_BEAT_MS` and `ADVANCE_MS`, all named at the top of `js/era2.js` now
rather than left as bare numbers at each call site, matching `pretrain.js`.
`finish()`'s 1200ms and the newspaper's 600ms put-down beat are untouched —
one-time interstitials, not the per-message pattern this was about.

All of it is unmeasured in the same way every constant in this act always
has been (issue #29): reasoned about, not felt, because automated browsers
throttle background timers and nothing here has had a real playthrough
yet. Worth revisiting together with #29's remaining questions once one
happens.

---

## Odds and ends

**Phase cards** — a plain note before and after each act (`PHASE_CARDS` in
`js/data.js`), so the player knows what they are doing and what just
happened. One card sits between each pair of acts and does both jobs, which
reads better than two in a row. House style for this copy: short sentences,
second person, no em dashes, and nothing phrased as "it isn't X, it's Y".
Jargon has one licensed use — naming a stage of training the player has just
played, real term first and the plain version straight after. Otherwise, if a
line needs a word like tokens or weights to make sense, rewrite the line.

A card's last line is lifted into `handoff` and given the screen to itself
after the card is dismissed.

**Both clocks stop while the tab is hidden** (issue #56). Act 1's 60s
document clock and Act 3's reply clock are deadlines measured against
`performance.now()`, which keeps running in the background — so switching
tabs would otherwise cost the player the document or the message they were
on. Each act registers a
pause/resume pair with `registerClockPause()` in `js/state.js`; pause stops
the interval, resume pushes the deadline out by the time away.

Resume shifts the deadline rather than storing a remainder, because the
belt reads its release window and its slide durations straight off
`docEndsAt - performance.now()` — shift the deadline and those stay correct
for free. Act 3's `startTimer()` was split from `runTimer()` for the same
reason: resume has to keep the deadline it already has instead of starting
the clock over. The nudge in Act 3's reply clock (below) rides the same
deadline as an offset rather than a timestamp of its own, so it inherits
this for free too — see "Pacing" under Act 3.

These clocks pace the player's attention, and with nobody watching there is
nothing to pace. Note that a tab which is merely *unfocused* is not hidden —
this fires on `visibilitychange`, not on blur.

**`{DOCS}` in phase-card copy** is substituted for the corpus size, spelled
out — `docCountWord()` in `js/state.js`, which the end screen calls directly.
Ask `SNIPPETS` for the count; don't write the number down in prose, where
it goes stale the moment a document is cut.

**The end screen** — accuracy, the unnoticed hallucination, and the gender
reveal counted straight off the trained model: how often it saw `he` versus
`she`, that `doctor` only ever sat next to one of them, and what the player
was able to answer on the birthday-card message. Player-facing copy avoids
jargon — "training data", not "corpus" or "inference".

**Popup images** — each document shows a real image from `assets/images/`
with an invented `source` line, so the act reads as documents being ingested.

**The opening grid** (issue #61) is 720 rooms (`GRID_COLS` × `GRID_ROWS` in
`js/state.js`, 36×20). The caption claims "millions of nodes, all running
the same exercise", so the grid has to stop reading as countable. 720 isn't
literally millions either, but that many DOM nodes animated through a
`transform` is about as far as this has been profiled. The zoom gets more
dramatic with the count for free: one cell to a full screen is 66× at 720
(measured, not estimated).

**Both grids read `GRID_ROOMS`.** The ending's lights-out sequence
(`js/ending.js`) builds the identical grid — same population, going dark
instead of arriving — so raising the count in one file and not the other
breaks the bookend without either screen visibly failing on its own. The
ending's per-room stagger is 9ms, which keeps the whole
deprecation-to-end-screen sequence at 15.4s.

`buildRoom()` in `js/state.js` is the one place either grid creates a room.
It randomly assigns one of three brightness tiers, so the field reads as
windows lit at different distances rather than a uniform checkerboard.

**The layout is fluid and needs no breakpoint.** Columns are
`repeat(var(--grid-cols), 1fr)` — the count set by JS as a custom property
rather than written down twice — under `min(980px, 94vw)`, and each room's
height comes from `aspect-ratio`. `border-radius` is a percentage for the
same reason: a fixed radius that looks lightly rounded on a ~22px desktop
cell rounds a ~9px phone cell all the way to a pill.

**Phase music** — four tracks in `assets/audio/`, crossfaded by
`Audio2.playPhase()`: `the-last-atom` (opening zoom), `sort-it-out`
(Acts 1–2), `best-guess` (Act 3), `thank-you` (ending). The opening track
doesn't loop: it runs 19.6s, so `main.js` hands over to Act 1's music on
its own mark (`T_MUSIC`, 18.8s) rather than waiting for `Pretrain.start()`,
which is several seconds later. Retiming the opening captions means
checking that mark still lands before the track runs out.

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

- **Most pacing constants are reasoned about, not measured.** Automated
  browsers throttle timers, so the ones that matter were timed off the
  page's own `performance.now()`; the rest still want a real playthrough.
- **Open work** is tracked as issues.

The older design docs in `archive/` describe the retired drag-to-file Era 1
and its trap set. Kept as history, not as spec.

## Deliberately not in v1

No aggregate player stats, no document shuffling, fixed 10-document order.

## License

Code is MIT — the `.html`, `.css`, `.js` and `.py` files. Take it, change it,
sell it, just keep the notice.

**`assets/` is not.** The ten photographs and four music tracks are
© 2026 Jo Hutchins-Joss / Silly Game Studio, all rights reserved, and are
here so the game runs rather than as a media library. Forking the code means
deleting `assets/` or replacing it with your own: ten images named for the
document ids in `js/data.js`, four tracks named in `js/audio.js`.

Full terms in [LICENSE](LICENSE).
