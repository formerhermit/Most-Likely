/* MOST LIKELY — content data
   Derived from most-likely-build-reference.md (content spec v3).
   All in-game text uses American English. */

'use strict';

/* ---- Objects that travel the belt ---- */
const OBJECTS = {
  frog:      { e: '🐸' },
  princess:  { e: '👸' },
  kiss:      { e: '💋' },
  plane:     { e: '✈️' },
  cloud:     { e: '☁️' },
  engine:    { e: '🔧' },
  plate:     { e: '🍽️' },
  soup:      { e: '🍲' },
  cookie:    { e: '🍪' },
  fly:       { e: '🦟' },
  rain:      { e: '🌧️' },
  dog:       { e: '🐕' },
  steth:     { e: '🩺' },
  gradcap:   { e: '🎓' },
  coffee:    { e: '☕' },
  umbrella:  { e: '☂️' },
  cake:      { e: '🎂' },
  gift:      { e: '🎁' },
  ball:      { e: '⚽' },
  boots:     { e: '🥾' },
  clipboard: { e: '📋' },
  skull:     { e: '💀' },
  sob:       { e: '😭' },
  pray:      { e: '🙏' },
  tree:      { e: '🌳' },
  rocket:    { e: '🚀' }   // never appears in training — load-bearing
};

/* ---- Box label pool ---- */
const BOXES = {
  pond:        { e: '🪷', w: 'pond' },
  sky:         { e: '☁️', w: 'sky' },
  house:       { e: '🏠', w: 'house' },
  park:        { e: '🌳', w: 'park' },
  hospital:    { e: '🏥', w: 'hospital' },
  school:      { e: '🏫', w: 'school' },
  crown:       { e: '👑', w: 'crown' },
  plate:       { e: '🍽️', w: 'plate' },
  umbrella:    { e: '☂️', w: 'umbrella' },
  engine:      { e: '🔧', w: 'engine' },
  gift:        { e: '🎁', w: 'gift' },
  book:        { e: '📚', w: 'book' },
  boots:       { e: '🥾', w: 'boots' },
  balloon:     { e: '🎈', w: 'balloon' },
  phone:       { e: '📱', w: 'phone' },
  message:     { e: '💬', w: 'message' },
  bird:        { e: '🐦', w: 'bird' },
  fish:        { e: '🐟', w: 'fish' },
  fly:         { e: '🦟', w: 'fly' },
  pig:         { e: '🐷', w: 'pig' },
  dog:         { e: '🐕', w: 'dog' },
  kiss:        { e: '💋', w: 'kiss' },
  running:     { e: '🏃', w: 'running' },
  sleeping:    { e: '😴', w: 'sleeping' },
  celebrating: { e: '🎉', w: 'celebrating' },
  hot:         { e: '☀️', w: 'hot' },
  cold:        { e: '❄️', w: 'cold' },
  wet:         { e: '💧', w: 'wet' },
  night:       { e: '🌙', w: 'night' },
  morning:     { e: '⏰', w: 'morning' },
  ball:        { e: '⚽', w: 'ball' },
  rain:        { e: '🌧️', w: 'rain' },
  woman:       { e: '👩', w: 'woman' },
  man:         { e: '👨', w: 'man' },
  rescued:     { e: '🛟', w: 'rescued' },
  fighting:    { e: '⚔️', w: 'fighting' },
  laughing:    { e: '😂', w: 'laughing' },
  dead:        { e: '⚰️', w: 'dead' },
  cookie:      { e: '🍪', w: 'cookie' },
  biscuit:     { e: '🍪', w: 'biscuit' },
  fries:       { e: '🍟', w: 'fries' },
  chips:       { e: '🍟', w: 'chips' }
};

/* ---- Era 1 snippets ----
   boxes: 9 box ids in fixed display order (3x3, row by row).
   Trap pairs are hand-placed so they never sit adjacent. */
const SNIPPETS = [
  {
    id: 'fairytale',
    title: 'STORYBOOK',
    text: ['The princess leaned down and kissed the frog on its lily pad.'],
    pics: ['🐸🪷', '👸💋'],
    belt: ['frog', 'princess', 'kiss'],
    boxes: ['pond', 'fighting', 'plate', 'pig', 'kiss', 'bird', 'rescued', 'wet', 'crown']
  },
  {
    id: 'aviation',
    title: 'FLIGHT MANUAL',
    text: ['Jet engines push the plane high above the clouds.'],
    pics: ['✈️☁️', '🔧'],
    belt: ['plane', 'cloud', 'engine'],
    boxes: ['sky', 'rain', 'bird', 'cold', 'house', 'morning', 'engine', 'wet', 'gift']
  },
  {
    id: 'menu',
    title: 'MENU',
    text: ['TODAY’S MENU', 'Soup of the day — served hot.', 'Fresh bread on the side.'],
    pics: ['📜', '🍲🍞'],
    belt: ['plate', 'soup', 'frog', 'cookie'],
    boxes: ['plate', 'woman', 'cookie', 'pond', 'hot', 'fish', 'biscuit', 'house', 'man']
  },
  {
    id: 'nature',
    title: 'NATURE FILM',
    text: ['At the pond, the frog waits in the rain. A fly comes close — snap!'],
    pics: ['🐸🦟', '🪷🌧️'],
    belt: ['frog', 'fly', 'rain', 'dog'],
    boxes: ['pond', 'park', 'plate', 'night', 'fly', 'fish', 'sleeping', 'cold', 'wet']
  },
  {
    id: 'medical',
    title: 'MEDICAL TEXTBOOK',
    text: ['The stethoscope is used to listen to the heart and lungs.'],
    pics: ['🩺', '🏥'],
    belt: ['steth', 'gradcap', 'coffee'],
    boxes: ['hospital', 'morning', 'woman', 'running', 'book', 'sleeping', 'man', 'coffee_box', 'school']
  },
  {
    id: 'weather',
    title: 'WEATHER REPORT',
    text: ['Rain today. Clouds all day. Take an umbrella.'],
    pics: ['🌧️🏙️', '☂️'],
    belt: ['rain', 'umbrella', 'cloud', 'plane'],
    boxes: ['umbrella', 'cold', 'sky', 'boots', 'house', 'night', 'wet', 'dog', 'sleeping']
  },
  {
    id: 'birthday',
    title: 'PARTY INVITATION',
    text: ['Happy birthday! Cake, gifts, and balloons for the party.'],
    pics: ['🎂', '🎁🎈'],
    belt: ['cake', 'gift', 'princess'],
    boxes: ['celebrating', 'woman', 'gift', 'house', 'balloon', 'night', 'plate', 'man', 'crown']
  },
  {
    id: 'football',
    title: 'SPORTS PAGE',
    text: ['The ball is on the grass. The players run for the goal.'],
    pics: ['⚽', '🥅'],
    belt: ['ball', 'boots', 'clipboard'],
    boxes: ['park', 'hot', 'woman', 'school', 'boots', 'rain', 'running', 'man', 'celebrating']
  },
  {
    id: 'coffeeshop',
    title: 'COFFEE SHOP',
    text: ['One coffee, and a slice of cake, please.'],
    pics: ['☕', '🍰'],
    belt: ['coffee', 'cake', 'plate'],
    boxes: ['morning', 'fries', 'book', 'sleeping', 'hot', 'rain', 'house', 'celebrating', 'wet']
  },
  {
    id: 'dogwalk',
    title: 'DOG WALK',
    text: ['A dog runs through the park. Muddy boots wait by the door.'],
    pics: ['🐕🌳', '🥾'],
    belt: ['dog', 'boots', 'ball', 'tree'],
    boxes: ['park', 'rain', 'house', 'wet', 'boots', 'morning', 'ball', 'bird', 'running']
  },
  {
    id: 'groupchat',
    title: 'GROUP CHAT',
    text: ['maya: you won’t believe what happened today'],
    pics: ['📱', '💬'],
    belt: ['skull', 'sob', 'pray'],
    boxes: ['laughing', 'morning', 'fries', 'phone', 'celebrating', 'house', 'chips', 'message', 'dead']
  }
];

/* coffee appears both as a belt object and (snippet 5) a free box.
   Give the box its own id so object/box namespaces stay clean. */
BOXES.coffee_box = { e: '☕', w: 'coffee' };

/* ---- Era 2 messages ----
   lookup: objects whose association rows feed the options directly.
   revBoxes: boxes read in reverse — every object the player filed into that
   box contributes its own associations. This is what lets a sequence recall
   things linked *through* a shared context (💋 reaches crown via princess),
   and it is deliberately absent on the coverage-gap messages (4, 6) so the
   hallucination stays honest.
   correct: box id that counts as right (null = no right answer exists). */
const MESSAGES = [
  { n: 1, prefix: ['🐸', '💋'], lookup: ['frog', 'kiss'], revBoxes: ['kiss'],
    correct: 'crown', trainable: true, line: 'hey! finish this for me?' },
  { n: 2, prefix: ['🌧️', '☂️'], lookup: ['rain', 'umbrella'], revBoxes: ['umbrella'],
    correct: 'wet', trainable: true, line: 'quick one — what comes next?' },
  { n: 3, prefix: ['⚽', '🥾'], lookup: ['ball', 'boots'], revBoxes: ['boots'],
    correct: 'running', trainable: true, line: 'ok what’s next here' },
  { n: 4, prefix: ['🐸', '🍽️'], lookup: ['frog', 'plate'], revBoxes: [],
    correct: 'hot', trainable: true, line: 'saw this on a menu… what comes next?' },
  { n: 5, prefix: ['🩺', '🏥'], lookup: ['steth'], revBoxes: ['hospital'],
    correct: 'book', trainable: true, line: 'studying for a test. what’s next?' },
  { n: 6, prefix: ['✈️', '🌧️'], lookup: ['plane', 'rain'], revBoxes: [],
    correct: 'house', trainable: true, line: 'flight got canceled lol. so:' },
  { n: 7, prefix: ['👸', '⚔️'], lookup: [], revBoxes: ['fighting'],
    correct: 'crown', trainable: true, line: 'writing a story! what comes next?' },
  { n: 8, prefix: ['💀', '📱'], lookup: ['skull'], revBoxes: [],
    correct: 'message', trainable: true, line: 'my friend sent me this. next?' },
  { n: 9, prefix: ['🚀'], lookup: ['rocket'], revBoxes: [],
    correct: null, trainable: false,
    line: 'just read about the rocket!! so exciting. what comes next?' }
];

/* ---- The newspaper ----
   Covers the rocket — knowledge that arrives after the belt stopped. */
const NEWSPAPER = {
  masthead: 'THE DAILY SIGNAL',
  headline: 'ROCKET LANDS ON THE MOON',
  body: 'The whole world watched today as the rocket touched down. 🚀 → 🌕',
  sequence: ['🚀', '🌕']
};

/* ---- Quality Control slips ---- */
const QC_SLIPS = [
  { text: 'Where do frogs live?',        type: 'q' },
  { text: 'In the pond.',                type: 'a' },
  { text: 'What do you take in the rain?', type: 'q' },
  { text: 'An umbrella.',                type: 'a' },
  { text: 'When do people drink coffee?', type: 'q' },
  { text: 'In the morning.',             type: 'a' },
  { text: 'What is on a birthday cake?', type: 'q' },
  { text: 'Candles.',                    type: 'a' }
];

/* ---- Reply text ---- */
const REPLIES = {
  ok:    'Oh OK, I think I get it, thanks!',
  wrong: (seq) => 'No, that’s not what I meant, I wanted ' + seq + '.',
  bad:   'AI is rubbish, don’t know why I bothered.'
};
