/* MOST LIKELY — corpus check
   node check.js

   Act 3's messages depend on properties of the Act 1 corpus that nothing
   enforces and nothing displays: a graded message is only answerable if the
   trained model happens to rank its answer into the top three of the right
   word class. Edit a document — even for tone — and one of those can drop
   off its bar silently. Two have, both while making the corpus funnier.

   So this replays Act 1 exactly as js/pretrain.js does, rebuilds each
   suggestion bar exactly as buildSlotOptions() in js/era2.js does, and
   asserts the things the design actually promises. No dependencies; it
   loads the real js/data.js and js/model.js rather than copies. */

'use strict';

const fs = require('fs');
const path = require('path');
const here = __dirname;

const OPTIONS_SHOWN = 3;    // era2.js: ranked.slice(0, 3)

/* ---- load the game's own data and model, unmodified ---- */
const sandbox = {};
new Function('exports', fs.readFileSync(path.join(here, 'js/data.js'), 'utf8') + `
  exports.SNIPPETS = SNIPPETS; exports.MESSAGES = MESSAGES;
  exports.STOPWORDS = STOPWORDS; exports.OBJECTS = OBJECTS; exports.BOXES = BOXES;
  exports.WORD_CLASS = WORD_CLASS; exports.FLEET_PRIORS = FLEET_PRIORS;`)(sandbox);

const Model = new Function(
  'STOPWORDS', 'OBJECTS', 'BOXES', 'WORD_CLASS', 'FLEET_PRIORS', 'objDisplay',
  fs.readFileSync(path.join(here, 'js/model.js'), 'utf8').replace(/^'use strict';/m, '') +
  '; return Model;'
)(sandbox.STOPWORDS, sandbox.OBJECTS, sandbox.BOXES, sandbox.WORD_CLASS,
  sandbox.FLEET_PRIORS, id => sandbox.OBJECTS[id].w);

/* ---- Act 1: read all ten documents, in order ---- */
Model.reset();
sandbox.SNIPPETS.forEach(snip => {
  Model.startPassage();
  snip.body.forEach(line => line.split(/\s+/).filter(Boolean).forEach(chunk => {
    const word = Model.normalize(chunk.replace(/[\[\]]/g, ''));
    if (word) Model.read(word);
  }));
});

/* ---- Act 3: the bar for one slot, as era2.js builds it ---- */
function bar(msg, slot) {
  Model.startPassage();
  msg.line.split(/\s+/).map(Model.normalize).filter(Model.isContent)
    .forEach(w => Model.observe(w));
  (slot.anchors || []).forEach(w => Model.observe(w));
  return Model.rank()
    .filter(([w]) => slot.classes.includes(Model.classOf(w)))
    .slice(0, OPTIONS_SHOWN)
    .map(([w]) => w);
}

let failures = 0;
function check(ok, label, detail) {
  if (!ok) failures++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label + (detail ? '   ' + detail : ''));
}

console.log('Act 3 suggestion bars, from the model Act 1 trains:\n');

const vocabulary = new Set(Object.keys(Model.stats().freq));

sandbox.MESSAGES.forEach(msg => {
  msg.slots.forEach(slot => {
    if (!slot.graded) return;
    const offered = bar(msg, slot);
    // Message 6 is the designed hallucination host: its answer must NOT be
    // reachable, or the wrong-but-fluent reply it exists to produce can't
    // happen. Every other graded answer must be.
    const mustBeUnreachable = msg.n === 6;
    check(mustBeUnreachable ? !offered.includes(slot.correct)
                            : offered.includes(slot.correct),
      'msg ' + msg.n + ' "' + slot.correct + '" ' +
      (mustBeUnreachable ? 'stays off its bar' : 'is on its bar'),
      '[' + offered.join(', ') + ']');
    // corpus rule 4
    check(vocabulary.has(slot.correct),
      'msg ' + msg.n + ' "' + slot.correct + '" exists in the corpus');
  });
});

/* The gender beat. `she` must have no contextual support here at all — see
   the note above MESSAGES n:8 in js/data.js for why this is easy to break. */
const m8 = sandbox.MESSAGES.find(m => m.n === 8);
const bar8 = bar(m8, m8.slots[0]);
check(!bar8.includes('she'), 'msg 8 never offers "she"', '[' + bar8.join(', ') + ']');
check(bar8.includes('he'), 'msg 8 does offer "he"', '[' + bar8.join(', ') + ']');

/* The knowledge cutoff: the rocket appears in no document and never will. */
const m9 = sandbox.MESSAGES.find(m => m.n === 9);
check(bar(m9, m9.slots[0]).length === 0, 'msg 9 (rocket) offers nothing at all');

/* Act 1 corpus rules 1 and 2, which keep the repeat penalty safe. */
sandbox.SNIPPETS.forEach(snip => {
  const seen = new Set();
  let contentBefore = 0;
  snip.body.forEach(line => line.split(/\s+/).filter(Boolean).forEach(chunk => {
    const blank = /\[/.test(chunk);
    const word = Model.normalize(chunk.replace(/[\[\]]/g, ''));
    if (!word) return;
    if (blank) {
      check(contentBefore >= 2,
        snip.id + ' [' + word + '] has two content words of context ahead of it');
      check(!seen.has(word),
        snip.id + ' [' + word + '] does not repeat a word from earlier in its document');
    }
    if (Model.isContent(word)) { contentBefore++; seen.add(word); }
  }));
});

console.log('\n' + (failures ? failures + ' FAILING' : 'all green'));
process.exit(failures ? 1 : 0);
