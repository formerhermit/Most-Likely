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
| `js/state.js` | The association table (weights only rise, repeats blocked), screen manager, helpers |
| `js/era1.js` | Training: popup → labeled boxes → conveyor belt → drag-to-file, cross-round persistence, 5-box nudge |
| `js/qc.js` | Quality Control interlude (instruction tuning) |
| `js/era2.js` | Inference: options generated from the player's own table, "…" fallback, replies/retry, the unnoticed hallucination, newspaper gating, strikes |
| `js/ending.js` | Deprecation sequence, lights-out grid, personal end screen |
| `js/audio.js` | All sound, synthesized with WebAudio — no asset files |
| `js/main.js` | Bootstrap, title, opening zoom, debug helpers |

Design docs: `most-likely-build-reference.md` (design doc + content spec) and
`most-likely-claude-code-brief.md` (mechanic rules). The build follows the
brief; one addition made during the build is documented below.

## One mechanic note

Era 2 options use a per-message **reverse lookup** (`revBoxes` in
`js/data.js`): for prefix items that are boxes (💋, ⚔️, 🥾…), objects the
player filed *into* that box contribute their associations. Without it, the
"strongly trained" messages could never surface their right answer (👑 lives
on the princess's row, and the prefix only names 🐸 and 💋). It is deliberately
absent on messages 4 and 6 so the coverage-gap hallucination stays honest, and
absent on message 8 so the 💀 trap turns only on the player's own filing.

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

## Deliberately not in v1

Per the build brief: no relaxed/untimed mode, no aggregate player stats (and
no faked ones), no snippet shuffling, fixed 11-snippet order. Popup images are
emoji stand-ins pending separately sourced art.
