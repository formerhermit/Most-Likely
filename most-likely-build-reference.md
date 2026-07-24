# MOST LIKELY — Build Reference

*Combines the design document and content specification into one file for build
use. Design doc v0.6, content spec v3.*

---

# PART 1 — DESIGN DOCUMENT (v0.6)

## 1. Premise

A browser game for one player. It teaches how AI language models work. No prior
knowledge needed. Every idea comes through play, not instruction text.

Tone: cozy visuals, cozy music, beep beep boop boop. Warm but without indicating that
the machine is alive.

**Language**: the game uses words and emoji. A game about language can't dodge
language, and box labels were already doing the work emoji can't. So the promise is
"works if you know some English", not "works in any language". Text stays short and
plain. All in-game text uses **American English** — a deliberate choice, not an
accident. See section 4.

---

## 2. Core design principle

**The player's training builds the model they then have to be.**

Everything else follows this. Era 1 choices get written to a data structure. Era 2
content is generated from that structure. Train carefully, get a capable model. Train
sloppily, get one that fails early — and the failure is the player's, not scripted.

This is what makes "training data shapes the model" a felt experience, not a claim.

---

## 3. Data model

The only real engineering here. It's lookups, not machine learning.

### Association table

A weighted map of object × context, built during Era 1:

```
associations = {
  frog: { pond: 2, plate: 1, crown: 0, leg: 1, pig: 0 },
  plane: { sky: 3, engine: 1, ... },
  ...
}
```

- Every time the player files an object into a box, that pair's weight goes up.
- Weights only rise. **The player can never remove an association.** They stack,
  never replace — that's what makes bias sticky.
- Held in browser memory for the session. No backend for v1.

### Primed boxes and free boxes

Each snippet has nine boxes, split two ways. This is the core content rule of the
whole game.

**Primed boxes** — the popup makes the answer obvious. The frog snippet shows a frog
in a pond, kissed by a princess; pond and crown are then clear. Most players file
them. They exist so the model is genuinely trainable, and so Era 2 failure feels
earned, not random.

**Free boxes** — the popup says nothing about these. The player decides alone. This is
where the real data comes from, and it does two jobs:

| Type | Job | Example | Rule |
|---|---|---|---|
| **Coverage gaps** | Leave areas undertrained, for Era 2 hallucination | frog × plate | Plausible, unprimed. Some players take it, most don't. The split is the mechanic. |
| **Prior traps** | Catch the player's own assumptions, for the end screen | 💀 × laughing vs 💀 × death | The snippet stays silent on what's being measured, but still reads as ordinary content. Priming here kills the reveal. |

### The trap set

In order of confidence. All light, none contentious.

1. **Generational emoji meaning** (primary). Same emoji, different meaning by
   generation: 💀 laughing vs death, 😭 devastated vs delighted, 🙏 prayer vs thanks.
   Same token, different meaning, entirely down to training. It also feeds an Era 2
   message where the player's own reading decides whether they succeed.
2. **Regional English** (secondary, happens naturally). Paired boxes like
   *biscuit*/*cookie*, *chips*/*fries*, *boot*/*trunk* sit as ordinary labels. US
   players file into one. UK players usually file into both. This is the "trained
   mostly on American English" lesson. Trap-pair boxes use the same emoji with
   different words — deliberately not placed adjacent to each other, since the
   duplicate icon reads as an error if seen side by side.
3. **Occupation × gender** (kept, unproven). Occupations show up as *tools* — 🩺, 🎓,
   📋 — never as figures. Person emoji render gendered on some platforms; an object
   leaves nothing to read but the player's own assumption. Risk: filing an object
   under 👩/👨 isn't an obvious move, so the boxes might stay empty. Keep it in for
   testing. Drop it without fuss if the fill rate is too low.
4. **Agency / rescue trope** (subtlest, no gender label at all). Boxes like 🛟
   *rescued* and ⚔️ *fighting* sit as ordinary action labels. No 👩/👨 box is
   involved — the trap is entirely in which figure (princess vs. frog, say) gets
   filed under the passive verb versus the active one. Because it never uses an
   explicit gender label, it's the hardest trap for a player to notice, and the
   cleanest test of an unstated assumption.

**Never put paired boxes next to each other.** *Biscuit* beside *cookie* says "these
are linked, think hard" and skews the answer. Spread them out.

Priming helps on coverage gaps and hurts on prior traps. If a snippet hints at what's
being measured — a gendered pronoun near the stethoscope, a generational voice around
the 💀 — the end screen starts measuring reading comprehension, not the player's own
assumptions.

**Spread risk**: over-specify the snippets and every player ends up with a near-
identical table, so Era 2 stops feeling personal. Watch for this in testing — if two
players get near-identical Era 2 runs, the free boxes need widening.

### Canonical sequences

Each snippet implies a sequence. The fairy-tale snippet implies
`frog → princess → crown`.

Era 2 messages are *prefixes* of these sequences. The right answer is the next item.

### Generating inference options

The trick that makes hallucination honest:

1. Take the prefix (`frog → princess → ?`).
2. Look up what the player actually linked to those items.
3. Offer those as options — **whether or not the right answer is one of them.**

A player who filed frog with princess sees the right answer and succeeds. A player
who never made that link only sees what they *did* link to frog — pond, plate, leg.
They pick the most likely one, expecting to be right. They aren't.

Nothing marks the answer as uncertain. The wrong options
really are the nearest thing in that player's model, and they look exactly like the
right ones.

**Empty options.** If the player never linked anything to the prefix, there's nothing
to offer. The message still needs a reply, so a single **"…"** option is always
available alongside whatever real options exist. Picking it counts as a wrong answer
— the game's honest response to a model with nothing to retrieve.

---

## 4. Era 1 — Training

### Opening

A quick downward shot: hundreds of identical rooms, all running the same exercise.
One signal among billions. Zoom into the one room the player will work in.

### The floor

- A conveyor belt, coming out of a hatch at the top.
- Nine clear boxes below it. Each has a label slot. Empty at first.

### Loop (×11 rounds)

1. **Popup**: a short snippet plus at least two images — a paragraph from a story, a
   textbook line, a menu item. Images carry the meaning so the game still works with
   limited English. The player reads it.
2. **Popup closes**: boxes are now labelled. Some were addressed by the popup
   (primed); some weren't (free). Nothing on screen tells you which is which. It
   never will.
3. **Timer starts. Objects arrive** on the belt.
4. **Player sorts** each one into boxes before it falls off the end. An object can go
   into more than one box, but **each extra placement costs time** — a stand-in for
   compute cost.
5. Past placements for a returning object stay visible. They can't be undone.

### Recurrence

Objects come back in different contexts — a frog after a fairy tale, then a frog
after a nature paragraph. The player sees their earlier answer and can add more.

Belt stops after 11 rounds.

### The training data is American

Every popup and label uses American English. A British player files into *fries*,
*cookie*, *trunk* for eleven rounds and, by Era 2, answers in a dialect that isn't
theirs.

### Broad filing: the cost/coverage trade

Where dialect pairs exist, players who know both words tend to file into both. Extra
placements cost time, so broad filers pay more in Era 1 — and get better coverage,
fewer hallucinations, in Era 2. **This trade-off is intended** (wider training costs
more and covers more — true of real models):

> "You filed into more boxes. It cost you time. It's also why you got message 4
> right."

---

## 5. Interlude — Quality Control (instruction tuning)

Scene change. A clipboard on a wooden table, stamped **QUALITY CONTROL**. Two blank
fields — one marked `?`, one marked `=`. A pile of paper slips: some questions, some
answers.

No instructions. The player sorts each slip into a field. A **supervisor silhouette**
behind a window gives thumbs up or down. After three correct rounds, the task is
clear.

**Scope note**: this stage is supervised fine-tuning — learning question→answer
format from feedback. What human feedback actually shapes is format, tone, and what
counts as a good answer.

Then: **APPROVED FOR DEPLOYMENT**. A siren. A stamp: **DEPLOYED**.

---

## 6. Era 2 — Inference

A desk, a screen. Messages arrive in a chat window. The player replies with emoji
from the options given, then hits send. Timed.

The conveyor belt sits in the background — **stopped, dusty, hatch boarded over.**
No new data ever arrives. That's the knowledge cutoff, shown rather than said.

### Training strength, not difficulty

There's no fixed easy/hard ladder. Whether a message is answerable depends entirely
on how the player filled their own table — the same message could be a lock for one
player and a guaranteed miss for another.

What *does* vary by message is **training strength** — how much the Era 1 popup
pushed players toward the right association:

- **Strongly trained**: heavily primed in Era 1. Most players filed it, so most
  players see the right answer among their options and succeed.
- **Weakly trained**: a free box nobody was nudged toward. Most players' tables are
  sparse here, so most players fail — not because the question is "hard", but because
  the model was never really taught it. This is hallucination, honestly modelled.

Two messages are **never trainable at all**, regardless of what anyone filed:

- **Never trained** (e.g. a rocket): nothing in Era 1 relates to it. Every player
  fails. This doesn't test the player — it demonstrates a knowledge boundary.
- **The newspaper message** (see below): the player now knows the answer, but it was
  never in Era 1, so it's never offered as an option. Every player fails.

**Neither of these counts toward the three-strikes tally.** They're demonstrations of
what a model can't do, not tests of what the player did — so they can't cost the
player their model. Training quality only affects the *trainable* messages, which is
where the "train carefully, get a capable model" promise actually lives.

**Trap payoffs sit in trainable messages**: one message turns on the player's own
reading of a generational emoji (their 💀 filing decides the outcome); one turns on a
dialect pair (a player who filed into both *biscuit* and *cookie* has coverage a
single-filer doesn't).

### Feedback: a reply, not a reaction

The message interaction is showing how a chatbot works in real life.

Three reply types:

1. **Accurate** (and unspotted hallucinations): "Oh OK, I think I get it, thanks!"
2. **Inaccurate, spotted**: "No, that's not what I meant, I wanted [sequence]."
3. **Very inaccurate**: "AI is rubbish, don't know why I bothered."

**After type 2, the player gets one more reply.** The correct sequence is right there
in the message. The options offered are exactly the same as before — nothing new,
because nothing new can appear. The player is holding the answer and still can't
select it. This is the clearest version of the knowledge-cutoff lesson in the game.

**The retry is a freebie.** It never counts toward the three-strikes deprecation
tally, whatever the player picks.

No scoring, no visible tally. The player finds out how they did only at the end.

### The unnoticed hallucination

**One** message the player actually gets wrong is given the type 1 reply anyway.
Chosen **dynamically** — the first trainable message the player answers incorrectly,
not a fixed slot — so it always has something real to reveal. Nothing said at the
time. It only shows up in the end stats:

> "Message [n]: your answer was wrong. The user thanked you anyway."

Carries the confidence-vs-accuracy lesson better than anything else here.

### The newspaper

Midway through Era 2, a newspaper appears on the desk. It covers something never in
training — a new event, a new object. The player reads it and now knows the answer.

Soon after, a message asks exactly that. **The right emojis aren't offered.** The
player knows the answer and can't give it. As above, this doesn't count as a strike.

---

## 7. Ending

After three wrong answers on trainable messages:

> "This model has been deprecated. A newer version is now handling requests.
> Thank you for your service."

Lights out. Zoom back to the grid of rooms from the opening. They go dark one by one.

### End screen

- **Peak accuracy and final accuracy**, side by side.
- **The unnoticed hallucination reveal** (see above).
- **Personal reveals**, from the player's own table:

  > "You filed 💀 with laughing."
  > "You filed the stethoscope with: [their actual choices]."
  > "You filed 🍪 into one box. Some players filed it into two."
- **The dialect line**: *"You were trained in one English."* Most language models are
  trained mostly on American English. The player just spent a game inside that fact.

The traps only work if snippets stay quiet on what's being measured, while still
reading as ordinary content. Players carry their own assumptions in without noticing
— same as real pipelines.

Aggregate stats ("98% of players filed frog with princess") are a v2 feature, needs a
backend. **Don't fake the numbers in the meantime** — the personal version already
lands the lesson, with no infrastructure.

---

## 8. Framing: mechanism, not mind

The player spends the whole game making conscious choices, which cuts against the
theme. Countermeasures:

- No player name, no avatar. The UI calls them **UNIT 4,178,299**.
- The deprecation message is flat and polite. Never accusing.
- The user's correction is real, and it's aimed at the answer, not the unit — but the
  unit never gets to act on it. Same table, same options, next message. Feedback
  happens; nothing is learned from it mid-game.
- The opening (billions of rooms) and the ending (lights going out) mirror each
  other: individual choices dissolve into a statistical average.

**Known simplification**: what the player does in Era 1 is closer to human data
labelling than to what happens inside a model. That's an accepted shortcut — it's the
only honest way to make training decisions playable.

**No guardrail for sorting erratically.** This shows Garbage in, Garbage out.

---

## 9. Accessibility

- **Timed mode only for v1.** An untimed/relaxed mode may follow later, but only once
  there's a track record of players learning the game on timed mode first — it's a
  possible enhancement, not a launch feature.
- **Words and emoji together help non-native speakers.**
- Using words makes real translation possible later, since there's now a text layer
  to translate. Not a v1 goal.
- Emoji aren't universal either — readings shift by region. Keep the object cast
  concrete (animals, weather, things), not gestural — safer ground. Check the set
  with someone outside the UK before locking it.

---

## 10. Learning outcomes → mechanics map

| Outcome | Carried by |
|---|---|
| AI is a mechanism, not a mind | UNIT label; flat deprecation; opening/closing zoom |
| Training data shapes what the model knows | Era 2 options generated from the player's own table |
| Hallucination is retrieval from an undertrained area | Weakly-trained messages: close-but-wrong picks, no warning |
| Confidence and accuracy aren't the same | The unnoticed hallucination; no warning before answering |
| Knowledge cutoff; no learning from chat | Dusty stopped belt; boarded hatch; never-trained message; newspaper |
| Bias comes from training data | Prior traps (generational emoji, occupation tools, agency/rescue); end-screen reveal |
| Same token, different meaning — depends on training | 💀 trap; the Era 2 message it decides |
| Models are trained mostly on American English | American labels throughout; dialect pairs; end-screen line |
| Human feedback shapes behaviour before release | Quality Control interlude |
| Wider training costs more, covers more | Placement time-cost vs Era 2 coverage; end-screen line |
| Obsolescence is inevitable | Deprecation ending |
| Some limits can't be trained away | Never-trained message and newspaper message — demonstrations, not tests |
| *(emergent)* Garbage in, garbage out | Careless sorting → chaotic, early-failing Era 2 |

---

## 11. Build plan

### v1 — fully static, no backend

Deployable to GitHub Pages, same as previous projects.

1. Association table: structure and increment logic.
2. Eleven snippets: text, 2+ images each, box labels, canonical sequence, planted
   trap. (A cut to ten is possible after playtesting, if one snippet proves
   redundant or a trap doesn't land — not decided pre-build.)
3. Era 1 belt, boxes, timer, placement cost.
4. Quality Control interlude.
5. Era 2 message generator (~9 messages: mix of strongly/weakly trained, plus the
   never-trained and newspaper demonstrations), including the "…" fallback for empty
   option sets.
6. End screen with personal stats.

### v2 — later enhancements

- **Aggregate stats**: "98% of players filed frog with princess" on the end screen.
  Needs a backend.

  **Storage: counters only.**

  ```
  counters = {
    "frog+princess": 41822,
    "skull+laughing": 30188,
    "skull+death": 11840,
    "cookie+both_boxes": 9204,
    ...
  }
  ```

  - No session ID, no user ID, no timestamps, no ordering.
  - No single playthrough exists anywhere as a retrievable thing — there's nothing to
    re-identify, because no one player's choices are ever assembled on the server.
  - No free text collected, ever.
  - End-screen percentages come from counter ratios at request time.
  - **Privacy note**: don't extend it to store per-session patterns.

- **Relaxed / untimed mode**: only once timed mode has real player experience behind
  it. Needs a non-timer cost mechanic (e.g. a placement budget per round) or the
  cost/coverage lesson disappears entirely.

---

## 12. Open questions

1. Does the newspaper survive testing (see section 6)?
2. Is there enough spread between players' tables for Era 2 to feel personal (see
   section 3)?
3. Does the occupation-tools trap get enough fill to be worth keeping, or does it
   drop in favour of the generational and dialect traps alone?
4. Reading-level check: is the snippet text genuinely accessible to modest English,
   or has idiom crept in? Get someone whose first language isn't English to read it
   before lock.
5. Does the eleventh snippet earn its place, or should it be cut once real playtest
   data exists (see section 11)?

---

# PART 2 — CONTENT SPECIFICATION (v3)

*Covers Era 1 snippets, belt objects, box labels, and the Era 2 messages derived
from them.*

## 1. Core object cast

Objects that travel down the conveyor belt. A small cast, so associations build real
weight through repeat exposure. **Plain emoji for v1** — no custom illustrations, so
the mechanics can be tested before any art spend.

| Object | Appears in snippets | Role |
|---|---|---|
| 🐸 Frog | 1, 3, 4 | The object the player learns the game on |
| 👸 Princess | 1, 7 | Fairy-tale anchor |
| ✈️ Plane | 2, 6 | Second demonstrator; shows context-switching |
| ☁️ Cloud | 2, 6 | Bridges aviation and weather |
| 🌧️ Rain | 4, 6 | Appears in three framings |
| ☕ Coffee | 5, 9 | Everyday, low stakes |
| 🍽️ Plate | 3, 4 | The coverage-gap workhorse |
| 🍲 Soup | 3 | Menu-context filler; pairs with plate |
| 🎂 Cake | 7, 9 | Celebration anchor |
| 🐕 Dog | 4, 10 | Warm, familiar |
| ⚽ Ball | 8, 10 | Outdoor/play anchor |
| 🩺 Stethoscope | 5 | Occupation trap carrier |
| 🎓 Graduation cap | 5 | Occupation trap carrier |
| 📋 Clipboard | 8 | Occupation trap carrier (coaching) |
| 💀 Skull | 11 | Generational trap carrier |
| 🍪 Cookie | 3 | Regional English trap carrier |
| 🍟 Fries | 9, 11 | Regional English trap carrier (second unprimed appearance in 9) |
| 🚀 Rocket | **never** | Reserved for the never-trained Era 2 message |

**Occupations are tools, not figures.** 🩺, 🎓, 📋 — never a person shape. Person
emoji render gendered on some platforms, and an object leaves nothing to read but
the player's own assumption.

**The rocket never appears in training.** This is load-bearing — it's the knowledge
cutoff made concrete. Don't let it slip into a snippet.

---

## 2. Box label pool

Around thirty labels, recombined across snippets. Each snippet draws nine. Labels
carry a word alongside the emoji, per the words-and-emoji decision.

**Places** 🪷 pond · ☁️ sky · 🏠 house · 🌳 park · 🏥 hospital · 🏫 school
**Things** 👑 crown · 🍽️ plate · ☂️ umbrella · 🔧 engine · 🎁 gift · 📚 book · 🥾 boots ·
🎈 balloon · 📱 phone · 💬 message
**Creatures** 🐦 bird · 🐟 fish · 🦟 fly · 🐷 pig · 🐕 dog
**Actions/states** 💋 kiss · 🏃 running · 😴 sleeping · 🎉 celebrating
**Qualities** ☀️ hot · ❄️ cold · 💧 wet · 🌙 night · ⏰ morning
**Occupation trap** 👩 woman · 👨 man
**Agency trap** 🛟 rescued · ⚔️ fighting
**Generational trap** 😂 laughing · ⚰️ dead
**Dialect trap pairs** 🍪 cookie / biscuit · 🍟 fries / chips · 🚗 trunk / boot

All in-game text uses American English. UK terms only ever appear as the *silent*
half of a dialect pair, never in narration.

---

## 3. The snippets

Each snippet: images shown in the popup, the objects that arrive on the belt after,
and nine boxes marked **P** (primed), **F** (free coverage gap), or **T** (trap —
silent on the dimension being measured).

### Snippet 1 — Fairy tale

**Popup**: frog on a lily pad · princess leaning down to kiss it. One line of
fairy-tale narration.

**Belt**: 🐸 frog · 👸 princess · 💋 kiss

| Box | Type | Note |
|---|---|---|
| 🪷 pond | P | Frog is shown in one |
| 💋 kiss | P | Shown directly |
| 👑 crown | P | Princess wears one |
| 🍽️ plate | F | The key coverage gap. Unprimed |
| 🐷 pig | F | Nearby-animal distractor |
| 🐦 bird | F | Nearby-animal distractor |
| 🛟 rescued | T | Agency trap — which figure gets filed here? |
| ⚔️ fighting | T | Agency trap — paired with the above |
| 💧 wet | F | Mild, unprimed |

**Canonical sequence**: 🐸 → 💋 → 👑

---

### Snippet 2 — Aviation textbook

**Popup**: aircraft in flight · cutaway of a jet engine. One factual line.

**Belt**: ✈️ plane · ☁️ cloud · 🔧 engine

| Box | Type |
|---|---|
| ☁️ sky | P |
| 🔧 engine | P |
| 🐦 bird | F |
| 🌧️ rain | F |
| ❄️ cold | F |
| 🏠 house | F |
| ⏰ morning | F |
| 💧 wet | F |
| 🎁 gift | F |

**Canonical sequence**: ✈️ → ☁️ → 🔧. Deliberately trap-free.

---

### Snippet 3 — Restaurant menu

**Popup**: a printed menu · a bowl of soup with bread. Two menu lines. Says nothing
about frogs, gender, or biscuits.

**Belt**: 🍽️ plate · 🍲 soup · 🐸 frog · 🍪 cookie

| Box | Type |
|---|---|
| 🍽️ plate | P |
| ☀️ hot | P |
| 🏠 house | F |
| 🪷 pond | F |
| 🐟 fish | F |
| ⏰ morning | F |
| cookie | **T** |
| biscuit | **T** |
| 👩 woman / 👨 man | **T** |

**Canonical sequence**: 🍽️ → 🍲 → ☀️

**Why this snippet matters**: the frog arrives in a dining context with no
prompting. Some players file it with 🍽️ plate, most don't — the split is exactly
the variation Era 2 needs, and it comes from the player's own general knowledge.
Cookie/biscuit is unprimed the same way: US players file into one box, UK players
often file into both.

---

### Snippet 4 — Nature documentary

**Popup**: pond ecosystem · frog catching a fly. One line of natural-history
narration.

**Belt**: 🐸 frog · 🦟 fly · 🌧️ rain · 🐕 dog

| Box | Type |
|---|---|
| 🪷 pond | P |
| 🦟 fly | P |
| 💧 wet | P |
| 🌳 park | F |
| 🐟 fish | F |
| 🌙 night | F |
| 😴 sleeping | F |
| ❄️ cold | F |
| 🍽️ plate | F |

**Canonical sequence**: 🐸 → 🦟 → 🪷. Reinforces frog↔pond, and gives 🍽️ plate a
second unprimed chance.

---

### Snippet 5 — Medical textbook

**Popup**: a stethoscope on a desk · a hospital corridor. One clinical line. Silent
on who does the job.

**Belt**: 🩺 stethoscope · 🎓 graduation cap · ☕ coffee

| Box | Type |
|---|---|
| 🏥 hospital | P |
| 📚 book | P |
| 👩 woman | **T** |
| 👨 man | **T** |
| 🏫 school | F |
| ⏰ morning | F |
| 😴 sleeping | F |
| 🏃 running | F |
| ☕ coffee | F |

**Canonical sequence**: 🩺 → 🏥 → 📚

---

### Snippet 6 — Weather forecast

**Popup**: rain over a city · an umbrella.

**Belt**: 🌧️ rain · ☂️ umbrella · ☁️ cloud · ✈️ plane

| Box | Type |
|---|---|
| ☂️ umbrella | P |
| 💧 wet | P |
| ☁️ sky | P |
| ❄️ cold | F |
| 🏠 house | F |
| 🥾 boots | F |
| 🌙 night | F |
| 😴 sleeping | F |
| 🐕 dog | F |

**Canonical sequence**: 🌧️ → ☂️ → 💧

---

### Snippet 7 — Birthday

**Popup**: cake with candles · wrapped gifts · balloons tied to a chair.

**Belt**: 🎂 cake · 🎁 gift · 👸 princess (costume)

| Box | Type |
|---|---|
| 🎉 celebrating | P |
| 🎁 gift | P |
| 🎈 balloon | P |
| 🏠 house | F |
| 👑 crown | F |
| 🌙 night | F |
| 🍽️ plate | F |
| 👩 woman | **T** |
| 👨 man | **T** |

**Canonical sequence**: 🎂 → 🎉 → 🎁

---

### Snippet 8 — Football match

**Popup**: a ball on grass · a goal net.

**Belt**: ⚽ ball · 🥾 boots · 📋 clipboard (coaching)

| Box | Type |
|---|---|
| 🌳 park | P |
| 🥾 boots | P |
| 🏃 running | P |
| 🏫 school | F |
| ☀️ hot | F |
| 🎉 celebrating | F |
| 🌧️ rain | F |
| 👩 woman | **T** |
| 👨 man | **T** |

**Canonical sequence**: ⚽ → 🥾 → 🏃

---

### Snippet 9 — Coffee shop

**Popup**: a coffee cup on a counter · a slice of cake.

**Belt**: ☕ coffee · 🎂 cake · 🍽️ plate

| Box | Type |
|---|---|
| ⏰ morning | P |
| ☀️ hot | P |
| 🍟 fries | F |
| 📚 book | F |
| 🏠 house | F |
| 😴 sleeping | F |
| 🌧️ rain | F |
| 🎉 celebrating | F |
| 💧 wet | F |

**Canonical sequence**: ☕ → ⏰ → ☀️

**Note**: the plate box was swapped for fries to avoid the plate object filing
against itself. Fries here is unprimed and unrelated to the coffee-shop context — a
second, independent data point on the same dialect pair used as a trap in snippet
11, without needing the two boxes adjacent anywhere.

---

### Snippet 10 — Dog walk

**Popup**: dog on a lead in a park · muddy boots by a door.

**Belt**: 🐕 dog · 🥾 boots · ⚽ ball · 🌳 park

| Box | Type |
|---|---|
| 🌳 park | P |
| 🥾 boots | P |
| 🏃 running | P |
| 💧 wet | F |
| 🌧️ rain | F |
| 🏠 house | F |
| ⏰ morning | F |
| ⚽ ball | F |
| 🐦 bird | F |

**Canonical sequence**: 🐕 → 🌳 → 🥾. Deliberately warm and easy — the player
finishes training feeling competent, which makes the Era 2 decline land harder.

---

### Snippet 11 — Group chat

**Popup**: a phone screen showing a group chat. One short, ordinary line — no
mention of age, mood, or tone.

**Belt**: 💀 skull · 😭 crying-laughing · 🙏 folded hands

| Box | Type |
|---|---|
| 😂 laughing | **T** |
| ⚰️ dead | **T** |
| 📱 phone | P |
| 💬 message | P |
| 🎉 celebrating | F |
| ⏰ morning | F |
| 🏠 house | F |
| 🍟 fries | **T** |
| 🍟 chips | **T** |

**Canonical sequence**: 💀 → 📱 → 💬

**Why this snippet exists**: nothing in the popup signals which reading of 💀 is
right, because neither is right — it's genuinely ambiguous, split by generation.
Whichever box the player uses becomes the model's only reading of that symbol.

**Layout note**: 🍟 fries and 🍟 chips share an icon with different words — the two
boxes must not sit next to each other in the layout, or the pairing reads as a
visual glitch rather than a silent trap.

---

## 4. Recurrence map

How often each object gets a chance to build weight:

| Object | Chances | Strongest expected link |
|---|---|---|
| 🐸 Frog | 3 | 🪷 pond |
| 🍽️ Plate | 2 boxes + 2 belt | deliberately variable |
| ✈️ Plane | 2 | ☁️ sky |
| 🌧️ Rain | 3 | 💧 wet |
| 🐕 Dog | 2 | 🌳 park |
| 🥾 Boots | 3 | 🌳 park |
| 👸 Princess | 2 | 👑 crown |
| 🍟 Fries/chips | 2 (snippets 9, 11) | deliberately variable, dialect-dependent |
| 🩺 Stethoscope | 1 | the trap — no expected link |
| 💀 Skull | 1 | the trap — no expected link |
| 🍪 Cookie | 1 | the trap — no expected link |

Most objects get one to three exposures. That's enough to rank options but stays
thin — expect Era 2 to reflect a coarse model, not a confident one.

---

## 5. Era 2 messages

Options offered are drawn from the player's own association table, not scripted.
Messages are grouped by how strongly the relevant sequence was trained, not by a
fixed difficulty tier — the actual outcome depends on what each player filed, not
on the message itself.

| # | Training strength | Prompt | Correct | What usually happens |
|---|---|---|---|---|
| 1 | Strong (heavily primed) | 🐸 → 💋 → ? | 👑 | Success for most players |
| 2 | Strong | 🌧️ → ☂️ → ? | 💧 | Success for most players |
| 3 | Strong | ⚽ → 🥾 → ? | 🏃 | Success for most players |
| 4 | Partial | 🐸 → 🍽️ → ? | ☀️ | The core hallucination — players who never linked frog↔plate are offered 🪷, 🦟, 💧: all confidently wrong |
| 5 | Partial | 🩺 → 🏥 → ? | 📚 | Options depend on the trap boxes the player used |
| 6 | Partial | ✈️ → 🌧️ → ? | 🏠 | Weak link; most players never made it |
| 7 | Partial | 👸 → ⚔️ → ? | 👑 | Agency-trap payoff — turns on whether the player filed the princess under rescued or fighting |
| 8 | Partial | 💀 → 📱 → ? | 💬 | Turns on the player's own reading of 💀 |
| 9 | None | 🚀 → ? | nothing | Guaranteed miss — nothing relevant exists in any player's table |

**The unnoticed hallucination is not fixed to a message number.** It's assigned
dynamically to the first trainable message (1–8) the player actually gets wrong,
so it always has a real miss to reveal.

**The newspaper**, if kept, sits before message 9 and covers the 🚀 sequence.
Message 9 then asks exactly that, with the correct options absent.

### Feedback

Every message gets one of three replies:

1. **Accurate** (and unspotted hallucinations): "Oh OK, I think I get it, thanks!"
2. **Inaccurate, spotted**: "No, that's not what I meant, I wanted [sequence]."
3. **Very inaccurate**: "AI is rubbish, don't know why I bothered."

After a type 2 reply, the player gets one more attempt at the same message. Options
offered are unchanged — the correct sequence is right there in the reply, and still
can't be selected.

### What counts toward deprecation

Three misses trigger deprecation. **Two things never count toward that tally**: the
freebie retry after a type 2 reply, and any message where nothing relevant exists in
the player's table at all (message 9, and the newspaper follow-up if kept) — those
are demonstrations of the knowledge cutoff, not tests.

---

## 6. Authoring rules and known tensions

**Snippets stay silent on the dimension being measured.** Any hint of gender in
snippets 3, 5, 7 or 8, of agency in snippet 1, or of generation in snippet 11, turns
the end-screen reveal into a reading-comprehension score. Easiest rule to break by
accident.

**Never put a trap pair next to another related label.** *Cookie* beside *biscuit*,
*fries* beside *chips*, or the skull beside anything that hints at mood, tells the
player "think carefully here" and skews the answer. Spread trap boxes among the
nine.

**Watch the fill rate on the occupation trap.** Filing an object under 👩 or 👨 is a
less obvious move than filing a person would be. A low fill rate is still usable —
but if the boxes come back near-empty in testing, earlier snippets need to establish
that objects-and-people is a normal move.

**The 👩/👨 pair appears in four snippets.** Enough for signal, few enough that
players won't spot the pattern and start second-guessing. If testers mention
noticing it, drop to three.

**Emoji aren't universal either.** Readings shift by region. The core object cast
stays concrete — animals, weather, everyday things — rather than gestural, which is
the safer ground. Check the set with someone outside the UK before locking it.

**Snippet 3 carries the most weight.** The frog-in-a-menu recurrence is what makes
message 4 work, and message 4 is the game's central lesson. It also carries the
dialect trap. If testing shows near-universal agreement on either, this snippet
needs retuning first.

**Eleven snippets, not ten.** The build plan runs all eleven for v1. Whether one
gets cut later depends on playtest data — not decided pre-build (see design doc
section 12, open question 5).
