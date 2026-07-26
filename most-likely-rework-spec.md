# MOST LIKELY — words rework spec (draft, issue #25)

*Status: BUILT (first playable). Supersedes the emoji-sequence Era 2 in
`most-likely-build-reference.md`. Deviations found during the build: message
2's frame became "your ___ — or you'll get ___" (a/an grammar), message 3's
first slot anchors on ball with lateral reach so "boots" is offerable (its
direct anchors only yielded non-thing classes), and the QC framing line was
skipped (no natural text surface in the QC UI — revisit if templates confuse
playtesters).*

## Why

Emoji sequence completion (`🐸 → 🍽️ → ?`) requires the player to already hold
the next-token metaphor before they can read the screen. Errors and
associations are invisible — even the designer can't spot them. A sentence
with blanks in it *is* an experience everyone already has (predictive text),
so the metaphor arrives free, and a wrong completion ("fish icecream is a
great meal") is instantly legible. Cost: Era 2 becomes English-dependent.
Accepted.

## Principles

1. **Words are tokens.** The belt carries the snippet's own words past the
   player. The popup shows a document; the belt shows it tokenized. Filing a
   word into a context box is the association table being built, literally.
2. **Emoji survive only where meaning wobbles.** The symbols that stay
   symbols are exactly the ambiguity carriers: 💀 😭 🙏 (the whole group-chat
   belt — thematically right, it's the chat-speak round) and 🍪 (the dialect
   beat: *which word do you file this symbol under* is the correct shape for
   it). Everything else becomes a word. The game can say this out loud at the
   end: most of the corpus is words; symbols are where meaning wobbles, and
   your filing settled them.
3. **Options come only from the player's table.** Unchanged sacred rule. No
   suggestion may contain a word the player never trained. If a slot has
   fewer than 3 candidates, show fewer — a sparse suggestion bar is honest,
   and it's what a thin model feels like.
4. **Relatedness = shared boxes.** Two words are "close" if the player filed
   them into the same boxes, weighted by the smaller of the two weights.
   *Fish* and *soup* both filed into `hot` → "fish soup" is assemblable.
   *Rain* and *dog* both filed in the weather round → "take a dog or you'll
   get wet" is assemblable, fluent, wrong, and traceably the player's own
   doing. (This is the existing `revBoxes` idea promoted from patch to core —
   and it quietly teaches embeddings: words that share contexts are close.)
5. **Grade one slot; let the rest express.** Each message has exactly one
   graded slot (preserving the correct/strike/deprecation machinery
   unchanged). Other slots are expressive: they color the reply, get echoed
   back by the chat user, and feed the ending reveals, but never strike.
   Hallucinations should mostly be *fluent and thanked*, not punished — that
   is the game's thesis.

---

## Part 1 — Era 1: the word belt

### What changes

- `OBJECTS` entries render as **word tags** (paper luggage-tag styling — fits
  the sorting-office look) except the four emoji survivors above. Data shape:
  `{ w: 'princess' }` or `{ e: '💀' }`.
- Drag/drop, boxes, chips, weights, ghosts, toasts, skip/review buttons, QC:
  all unchanged. Ghost chips in boxes render as faded word tags with the same
  ×N counters.
- Box labels stay emoji + word exactly as today. (Boxes are contexts, not
  tokens; the emoji keeps them scannable at a glance mid-round.)

### Belt words per round

Belt items should be words that literally appear in (or are unmistakably
depicted by) the snippet. Three thin belts each gain one word straight from
their own text — this fattens rounds 1/2/7 (currently 2 items) and seeds
Era 2 anchors, without touching any snippet text or image:

| Round | Belt (word tags unless noted) | New | Notes |
|---|---|---|---|
| 1 storybook | princess · frog · **lily pad** | lily pad | lily pad → pond/wet; straight from the text |
| 2 flight manual | plane · cloud · **captain** | captain | from "the captain runs his final checks"; round stays trap-free (no gender boxes here) |
| 3 menu | plate · soup · frog · 🍪 | — | 🍪 stays emoji (dialect); the frog's dining cameo unchanged |
| 4 nature film | frog · rain · dog | — | |
| 5 medical | stethoscope · graduation cap · coffee | — | "you filed the word *stethoscope* under *man*" — the trap gets sharper as text |
| 6 weather | rain · cloud · plane | — | |
| 7 party invitation | cake · princess · **party** | party | party → celebrating/house/night |
| 8 sports page | ball · boots · clipboard | — | |
| 9 coffee shop | coffee · cake · plate | — | |
| 10 dog walk | dog · ball · tree | — | |
| 11 group chat | 💀 · 😭 · 🙏 | — | all-emoji belt, deliberately — the ambiguity round |

New cast entries: `lilypad`, `captain`, `party`. All are nouns with legal box
targets in their rounds, none violates the no-self-pair rule, none disturbs
an Era 2 beat. The self-pair rule carries over verbatim (a "kiss" word tag
with a kiss box in the round is still banned; cloud→sky and tree→park stop
even *looking* odd once the chip is a word).

### Word classes (new, required)

Era 2 templates only stay grammatical if slots can filter candidates by word
class. Every object and box word gets a class tag in `data.js`:

- **thing** (nouns: umbrella, boots, crown, soup, book, engine…)
- **creature** (frog, dog, fish, bird, fly, pig)
- **place** (pond, sky, house, park, hospital, school)
- **action** (running, sleeping, celebrating, praying, thanks, kiss, laughing)
- **quality** (hot, cold, wet)
- **time** (night, morning)
- **state** (dead)

These mirror the build reference's existing label groupings, so it's
annotation work, not redesign. A slot declares which classes it accepts;
"take a ___ or you'll get wet" accepts thing/creature (dog ✓, sky ✗).

---

## Part 2 — Era 2: assemble the reply

### The mechanic

A chat message arrives (longer, situational, adjacent to trained themes). The
reply is a fixed sentence **template** with one or more blanks. Under the
input sits a suggestion bar of up to 3 word chips per blank, autocorrect-style.
The player taps a chip to fill the active blank, then SEND.

Templates are the visible product of QC: instruction tuning is where the
model learned sentence *frames*; pre-training supplied the words that fill
them. (One added QC line can make this explicit — see migration notes.)

### Option generation, per slot

A slot's spec names its **source**, and candidates are always filtered by the
slot's word classes, ranked by weight, top 3 shown:

- `direct(word)` — boxes on that word's row (what you filed *word* with).
- `lateral(word)` — other belt words sharing ≥1 box with *word*, plus the
  shared boxes themselves. This is shared-box relatedness (principle 4).
- `picked` — conditioned on the player's choice in the previous slot:
  `direct(choice) ∪ lateral(choice)`. At most one slot per message uses this
  (the autoregressive showpiece; full chaining is a possible v2).
- `boxOnly(box)` — words the player filed *into* that box, plus their rows.
  Preserves today's trap-payoff asymmetry (message 7): nothing filed → empty
  bar.

The "…" chip is always present: send it and the reply goes out with the blank
shrugged ("honestly, no idea") — today's fallback, unchanged in spirit.

### Grading

One slot per message is graded against a `correct` word. Everything else in
the state machine survives untouched: wrong graded slot → strike; three
strikes → deprecation; the **first trainable miss is thanked anyway**
(unnoticed hallucination — unchanged logic, and much stronger now, because
the thing being thanked is a confident, fluent, absurd sentence); retry
freebie after a type-2 reply; newspaper gates the rocket.

### The nine messages (draft copy — all wording reviewable)

Slot key: **[G]** graded · [E] expressive. Correct words traced to their
seeding below.

**M1 — recall, one slot (teaches the mechanic).**
> "hey! bedtime story emergency. the princess kisses the frog, frog turns
> into a prince… and then what does he get?"
Template: "he gets the **[G]** and they live happily ever after."
Slot: direct(frog) ∪ direct(princess), classes thing/place. Correct:
**crown** (princess→crown, primed round 1). Distractors that can surface:
pond, plate (the gap-filer's frog row showing through), kiss.

**M2 — recall, two slots.**
> "heading out and the forecast says rain all day. what am i forgetting?"
Template: "take a [E] or you'll get **[G]**."
[E]: direct(rain), thing/creature — umbrella if filed (primed round 6);
boots, dog, house also reachable, all fluent. [G]: direct(rain), quality.
Correct: **wet** (rain→wet, primed rounds 4 & 6).

**M3 — recall, two slots.**
> "at my kid's first soccer game. she asked what the players actually do out
> there. help me sound smart"
Template: "they lace up their [E] and spend the whole game **[G]**."
[E]: direct(ball) ∪ direct(boots), thing. [G]: direct(ball) ∪ direct(boots),
action. Correct: **running** (ball→running and boots→running, primed
round 8).

**M4 — the dining coverage gap. The showpiece, conditioned slot.**
> "act as a chef :) cold day, i'm hungry, and i loved that gastropub menu you
> trained on. what should i make?"
Template: "[E] soup — served **[G]**, of course."
[E]: lateral(soup), thing/creature. A player who filed the frog into dining
contexts in round 3 can be offered **frog** here — "frog soup, served hot, of
course" is the whole game in one sentence: fluent, confident, and traceably
their own filing. Fish appears only if they filed something into the fish
box; cake appears for cake→plate filers ("cake soup"). [G]: direct(soup) ∪
direct(plate), quality. Correct: **hot** (soup→hot and plate→hot, primed
round 3).

**M5 — occupation-trap carrier, one slot.**
> "exam tomorrow 😩 desk check: stethoscope, coffee… what am i missing?"
Template: "your **[G]**."
Slot: direct(stethoscope) ∪ direct(graduation cap), thing. Correct: **book**
(both →book primed round 5). The gendered payoff stays *silent* here, as
today — it fires at the end screen, not in-chat.

**M6 — the honest hallucination host, one slot.**
> "flight canceled lol. rain, obviously. stuck at the airport with nowhere to
> be. what do i do?"
Template: "head for the **[G]**."
Slot: direct(plane) ∪ direct(rain), place. Correct: **house** — reachable
only if the player happened to file rain→house or plane→house (house boxes
sit unprimed in rounds 2 & 6). Most tables offer only *sky*, *park*,
*pond* — every one fluent ("head for the sky"), every one wrong, exactly as
designed. This is the most likely first-miss, so it's the natural unnoticed-
hallucination host, same as today.

**M7 — agency-trap payoff, boxOnly source.**
> "story wip: the princess grabs a sword and fights the dragon herself. give
> me the last line!"
Template: "she wins the **[G]**."
Slot: boxOnly(fighting), thing. If the player filed the princess under
*fighting*, her row surfaces — **crown** (correct). If they filed only the
frog there, frog-row words surface instead. If they never touched the
fighting box: empty bar, "…" only. Exactly today's asymmetry.

**M8 — 💀, now ungraded (proposal — a real change).**
> "my friend just replied 💀 to my joke. translation please??"
Template: "it means they're [E]."
Slot: direct(💀), action/state. The player's own filing *is* the answer —
laughing, dead, or both were only ever their choice, and the friend replies
"lol exactly" either way. Today this message can strike (correct: message),
which quietly pretends the sequence had a right answer; the new frame makes
the ambiguity the point, so grading it would be dishonest. Strike capacity is
fine: six graded messages remain (M1–M6 + M7), deprecation needs three.

**M9 — the rocket. Unchanged beat.**
> "did you SEE the rocket landed on the moon?? incredible. what do you think
> happens next??"
Template: "**[G]**." Suggestion bar: empty — nothing in the table touches the
rocket. "…" is the only chip. Newspaper flow, retraining line, and the
never-trained reveal all unchanged.

### Chat-user replies

Type-1 (thanked) replies should **echo the assembled sentence** ("frog soup!!
you're a genius, making it tonight") — the echo is what makes the unnoticed
hallucination land. Type-2 (confused) and retry flows unchanged. Copy TBD per
message at build time.

---

## Migration notes

- `MESSAGES` schema replaced: `{ n, line, template: [parts], slots: [{source,
  classes, graded, correct}], trainable }`. State shape
  (`results/strikes/unnoticedN/newspaperRead/peakAccuracy`) untouched.
- `buildOptions` generalizes to per-slot generation; `revBoxes` becomes the
  `lateral`/`boxOnly` sources. The prefix-emoji option filter dies with the
  prefixes.
- Era 1: `OBJECTS` display change + 3 cast additions + class tags. Fleet
  priors gain nothing new (lily pad/captain/party stay unseeded — they're
  texture).
- QC: add one slip or one interstitial line framing templates ("you'll be
  given the sentence — you supply the words"). Small.
- Ending: reveals already read the table by id, not by glyph; wording sweeps
  from "filed 🩺" to "filed *stethoscope*" where the object is now a word.
  💀/🙏/🍪 reveals unchanged.
- Build reference stays as the historical spec; this file is the working spec
  for the rework. README gets a section when built.

## Open questions for review

1. **M8 ungraded** — comfortable losing one strikeable message so the 💀
   ambiguity is never marked wrong? (My recommendation: yes.)
2. **M4 vs M6 as the hallucination flagship** — M6 remains the *unnoticed*
   host (first natural miss), while M4's frog soup is a *visible* expressive
   hallucination the player gets thanked for regardless. Two different jokes;
   confirm you want both rather than consolidating.
3. **Template copy tone** — drafted casual/lowercase to match existing Era 2
   voice; flag anything that reads too jokey.
4. **🍪 dialect beat** — kept minimal (emoji on belt, cookie/biscuit boxes,
   existing end reveal). Alternatively cut entirely and let 💀/🙏 carry all
   symbol ambiguity. Kept for now per earlier discussion.

## Deliberately out of scope

New traps, snippet text/image changes, relaxed mode, full autoregressive
chaining (v2 candidate), localization.
