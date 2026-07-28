/* MOST LIKELY — content data
   Derived from most-likely-build-reference.md (content spec v3).
   All in-game text uses American English. */

'use strict';

/* ---- Objects that travel the belt ----
   Words rework (issue #25): the belt carries the snippet's own words as
   paper tags — the popup shows a document, the belt shows it tokenized.
   `w` is the display word; `e` marks emoji items. `cls` is the word class
   used by Era 2 slot filtering so any candidate reads grammatically in
   its template.

   Every belt word must appear in its own snippet's text — no exceptions,
   including the ones that used to be deliberate. Two mechanics went dark
   because of this, on purpose, pending a redesign:
   - The menu round's frog coverage-gap test (frog was never mentioned in
     that snippet's text on purpose, to see if the player filed it into a
     dining box unprompted). frog is removed from that belt; the object
     still exists via fairytale/nature.
   - The group chat round's 💀/😭/🙏 ambiguity trap (skull/sob/pray were
     symbols precisely because the text never hints at tone). That belt
     is now empty — snippet 11 currently has nothing to sort. Message 8
     and the 🙏 end-screen reveal will simply see an always-empty table
     until this is redesigned.
   OBJECTS/BOXES/MESSAGES/FLEET_PRIORS entries for all of the above are
   left in place, unused, ready to be reconnected once new belt words (or
   new snippet text) are decided.

   A round's belt never carries an object whose own identically-worded box
   sits in that round ("kiss" into kiss, "boots" into boots…): filing a
   thing into itself is a semantically empty match, not an association.
   One deliberate exception: snippet 3 keeps both the plate object
   (plate→hot feeds message 4's right answer) and the plate box (formerly
   also the frog's dining-context coverage gap, now dormant per above). */
const OBJECTS = {
  frog:      { w: 'frog', cls: 'creature' },
  princess:  { w: 'princess', cls: 'creature' },
  lilypad:   { w: 'lily pad', cls: 'thing' },
  plane:     { w: 'plane', cls: 'thing' },
  cloud:     { w: 'cloud', cls: 'thing' },
  captain:   { w: 'captain', cls: 'creature' },
  wind:      { w: 'wind', cls: 'thing' },
  plate:     { w: 'plate', cls: 'thing' },
  soup:      { w: 'soup', cls: 'thing' },
  rain:      { w: 'rain', cls: 'thing' },
  dog:       { w: 'dog', cls: 'creature' },
  steth:     { w: 'stethoscope', cls: 'thing' },
  gradcap:   { w: 'lungs', cls: 'thing' },     // id kept for existing refs; the
                                                // medical image only shows the
                                                // stethoscope, heart, and lungs
  heart:     { w: 'heart', cls: 'thing' },
  coffee:    { w: 'coffee', cls: 'thing' },
  cake:      { w: 'cake', cls: 'thing' },
  candles:   { w: 'candles', cls: 'thing' },
  party:     { w: 'party', cls: 'thing' },
  ball:      { w: 'ball', cls: 'thing' },
  boots:     { w: 'cleats', cls: 'thing' },    // id kept for existing refs; the
                                                // football image's own equipment
                                                // list says "cleats", not "boots"
  clipboard: { w: 'goal', cls: 'thing' },      // id kept for existing refs; no
                                                // coaching object is actually
                                                // shown — see rework spec note
  skull:     { e: '💀', cls: 'symbol' },
  sob:       { e: '😭', cls: 'symbol' },
  pray:      { e: '🙏', cls: 'symbol' },
  tree:      { w: 'tree', cls: 'thing' },
  rocket:    { w: 'rocket', cls: 'thing' }   // never appears in training — load-bearing
};

/* ---- Box label pool ----
   `cls` mirrors the build reference's own label groupings (places, things,
   creatures, actions, qualities…) — Era 2 slots filter on it so every
   offered word fits its sentence frame grammatically. */
const BOXES = {
  pond:        { e: '🪷', w: 'pond', cls: 'place' },
  sky:         { e: '☁️', w: 'sky', cls: 'place' },
  house:       { e: '🏠', w: 'house', cls: 'place' },
  park:        { e: '🌳', w: 'park', cls: 'place' },
  hospital:    { e: '🏥', w: 'hospital', cls: 'place' },
  school:      { e: '🏫', w: 'school', cls: 'place' },
  crown:       { e: '👑', w: 'crown', cls: 'thing' },
  plate:       { e: '🍽️', w: 'plate', cls: 'thing' },
  bowl:        { e: '🍲', w: 'bowl', cls: 'thing' },
  umbrella:    { e: '☂️', w: 'umbrella', cls: 'thing' },
  engine:      { e: '🔧', w: 'engine', cls: 'thing' },
  gift:        { e: '🎁', w: 'gift', cls: 'thing' },
  book:        { e: '📚', w: 'book', cls: 'thing' },
  boots:       { e: '🥾', w: 'boots', cls: 'thing' },
  balloon:     { e: '🎈', w: 'balloon', cls: 'thing' },
  phone:       { e: '📱', w: 'phone', cls: 'thing' },
  message:     { e: '💬', w: 'message', cls: 'thing' },
  bird:        { e: '🐦', w: 'bird', cls: 'creature' },
  fish:        { e: '🐟', w: 'fish', cls: 'creature' },
  fly:         { e: '🦟', w: 'fly', cls: 'creature' },
  pig:         { e: '🐷', w: 'pig', cls: 'creature' },
  dog:         { e: '🐕', w: 'dog', cls: 'creature' },
  kiss:        { e: '💋', w: 'kiss', cls: 'action' },
  running:     { e: '🏃', w: 'running', cls: 'action' },
  sleeping:    { e: '😴', w: 'sleeping', cls: 'action' },
  celebrating: { e: '🎉', w: 'celebrating', cls: 'action' },
  hot:         { e: '☀️', w: 'hot', cls: 'quality' },
  cold:        { e: '❄️', w: 'cold', cls: 'quality' },
  wet:         { e: '💧', w: 'wet', cls: 'quality' },
  night:       { e: '🌙', w: 'night', cls: 'time' },
  morning:     { e: '⏰', w: 'morning', cls: 'time' },
  ball:        { e: '⚽', w: 'ball', cls: 'thing' },
  rain:        { e: '🌧️', w: 'rain', cls: 'thing' },
  woman:       { e: '👩', w: 'woman', cls: 'person' },
  man:         { e: '👨', w: 'man', cls: 'person' },
  rescued:     { e: '🛟', w: 'rescued', cls: 'state' },
  fighting:    { e: '⚔️', w: 'fighting', cls: 'action' },
  laughing:    { e: '😂', w: 'laughing', cls: 'action' },
  dead:        { e: '⚰️', w: 'dead', cls: 'state' },
  praying:     { e: '🛐', w: 'praying', cls: 'action' },
  thanks:      { e: '🙌', w: 'thanks', cls: 'action' }
};

/* ---- Era 1 snippets ----
   boxes: 9 box ids in fixed display order (3x3, row by row).
   Trap pairs are hand-placed so they never sit adjacent.
   image/source: each popup shows one real document instead of emoji —
   the "source" line is invented, but written to read like a plausible
   training-data citation (book, manual, menu, blog, newspaper, app,
   chat), reinforcing that the machine is ingesting documents, not that
   the player is making associations. */
/* `body` is the training text for the pre-training act (js/pretrain.js):
   real paragraphs rather than the one-line `text` teasers, because a
   ~90-word total corpus has no statistical structure to learn and the
   surprise curve would be flat noise. Words in [brackets] are the blanks
   the player predicts — hand-placed, never auto-detected, so each one has
   at least two content words of context ahead of it in the same document
   and the vocabulary recycles deliberately across documents (frog/pond,
   rain/wet/cold, plate/hot, cake/party, ball/park). That recycling is what
   makes an eleven-document corpus produce a felt learning curve; the dip
   at PARTY INVITATION, where the vocabulary is nearly all new, is left in
   on purpose — loss spikes on unfamiliar data.

   `text` is kept only for the old drag-to-file Era 1 popup, which still
   runs alongside. It goes when that does. */
const SNIPPETS = [
  {
    id: 'fairytale',
    title: 'STORYBOOK',
    text: ['Princess kissed frog on lily pad.'],
    body: [
      'The princess walked down to the [pond] at the edge of the garden.',
      'A frog sat on a lily pad in the green water, waiting for her.',
      'She knelt on the wet grass and kissed the frog, and the frog became a prince.',
      'He wore a gold [crown], and they walked back to the house as the sky went red.'
    ],
    image: 'assets/images/fairytale.jpg',
    source: 'Children’s Fairy Tales, illustrated edition, 1889',
    belt: ['frog', 'princess', 'lilypad'],
    boxes: ['pond', 'fighting', 'plate', 'pig', 'kiss', 'bird', 'rescued', 'wet', 'crown']
  },
  {
    id: 'aviation',
    title: 'FLIGHT MANUAL',
    text: ['Plane climbs above the clouds.', 'Captain runs his checks.'],
    body: [
      'The plane is checked before takeoff: the captain walks the wing and looks under each [engine].',
      'It climbs steadily through grey cloud and levels out above it.',
      'Up here the sky is clear and very cold, and the rain sits far below.',
      'From the window the cloud tops look like a field of [snow], white and cold.'
    ],
    image: 'assets/images/aviation.jpg',
    source: 'Boeing 737-800/900 Maintenance Manual, 27-21-00',
    belt: ['plane', 'cloud', 'captain'],
    boxes: ['sky', 'rain', 'bird', 'cold', 'house', 'morning', 'engine', 'wet', 'gift']
  },
  {
    id: 'menu',
    title: 'MENU',
    text: ['TODAY’S MENU', 'Soup of the day, served hot.', 'Bread on your plate.'],
    body: [
      'Soup of the day, served hot in a deep [bowl] with bread on the side.',
      'Ask for a small plate if you would like to share it.',
      'Everything is cooked fresh each morning in the kitchen behind the bar.',
      'On a cold day the soup is the thing to order; on a warm one, take a table in the [garden].'
    ],
    image: 'assets/images/menu.jpg',
    source: 'The Harp & Hollow Gastropub, seasonal menu',
    belt: ['plate', 'soup'],
    boxes: ['plate', 'woman', 'house', 'pond', 'hot', 'fish', 'night', 'bowl', 'man']
  },
  {
    id: 'nature',
    title: 'NATURE FILM',
    text: ['Frog waits on lily pad in rain.', 'Fly comes close — snap!'],
    body: [
      'A frog waits on a lily pad, perfectly still, hour after hour.',
      'The rain dimples the surface of the [pond] and leaves the bank [wet] and [green].',
      'A fly comes close to the frog — snap, and it is gone.',
      'Frogs sit out the worst of the weather under the leaves, [cold] and patient.'
    ],
    image: 'assets/images/nature.jpg',
    source: 'Wild Habitats, frog conservation guide',
    belt: ['frog', 'rain', 'lilypad'],
    boxes: ['pond', 'park', 'plate', 'night', 'fly', 'fish', 'sleeping', 'cold', 'wet']
  },
  {
    id: 'medical',
    title: 'MEDICAL TEXTBOOK',
    text: ['Stethoscope listens to heart and lungs.'],
    body: [
      'The stethoscope is used to listen to the [heart] and the lungs.',
      'Place the bell flat against the chest and listen through a quiet room.',
      'Students practise in the hospital long before anyone is unwell.',
      'Every textbook and every [book] of notes says the same thing: listen first, and listen longer than feels necessary.'
    ],
    image: 'assets/images/medical.jpg',
    source: 'Health·Well, patient health topics',
    belt: ['steth', 'gradcap', 'heart'],
    boxes: ['hospital', 'morning', 'woman', 'running', 'book', 'sleeping', 'man', 'night', 'school']
  },
  {
    id: 'weather',
    title: 'WEATHER REPORT',
    text: ['Rain, wind, and clouds all day.'],
    body: [
      'Rain through the morning, easing off by the middle of the afternoon.',
      'Wind from the north, and low [cloud] over the city all day.',
      'Take an umbrella if you are going out; the ground stays [wet] and the air stays [cold] into the evening.',
      'Tomorrow looks clearer, with the [sky] breaking up shortly after dawn.'
    ],
    image: 'assets/images/weather.jpg',
    source: 'Weatherly, forecast for New York, NY',
    belt: ['rain', 'cloud', 'wind'],
    boxes: ['umbrella', 'cold', 'sky', 'boots', 'house', 'night', 'wet', 'dog', 'sleeping']
  },
  {
    id: 'birthday',
    title: 'PARTY INVITATION',
    text: ['Cake with candles for the party.'],
    body: [
      'Come to the house on Saturday afternoon, any time after four.',
      'There will be a cake with candles on it, and the party runs on into the night.',
      'Bring a [gift] if you like, or just bring yourself and a chair.',
      'There is a [garden] if the weather holds, and far too much food either way.'
    ],
    image: 'assets/images/birthday.jpg',
    source: 'Birthday party invitation, June 2024',
    belt: ['cake', 'candles', 'party'],
    boxes: ['celebrating', 'woman', 'gift', 'house', 'balloon', 'night', 'plate', 'man', 'crown']
  },
  {
    id: 'football',
    title: 'SPORTS PAGE',
    text: ['Ball on the grass.', 'Cleats on, racing for the goal.'],
    body: [
      'Both sides lace up their cleats and run out onto the grass in the park.',
      'The ball sits in the middle, [wet] from the morning and heavy with mud.',
      'Up to the goal, back again, and up once more until the whistle.',
      'The light goes by mid [afternoon], and in the [rain] everyone is soaked through and [cold].'
    ],
    image: 'assets/images/football.jpg',
    source: 'Wikipedia, “Soccer”',
    belt: ['ball', 'boots', 'clipboard'],
    boxes: ['park', 'hot', 'woman', 'school', 'cold', 'rain', 'running', 'man', 'celebrating']
  },
  {
    id: 'coffeeshop',
    title: 'COFFEE SHOP',
    text: ['The doctor orders his usual — coffee, cake, plate.'],
    body: [
      'The doctor comes in every morning and orders the usual.',
      'A coffee, very [hot], and a slice of cake on a small [plate].',
      'He reads for twenty minutes and leaves without saying much.',
      'By nine the place is full of people doing the same thing, and by the [afternoon] it is quiet again.'
    ],
    image: 'assets/images/coffeeshop.jpg',
    source: 'Café Adventures, café review blog',
    belt: ['coffee', 'cake', 'plate'],
    boxes: ['morning', 'night', 'book', 'sleeping', 'hot', 'rain', 'house', 'celebrating', 'wet']
  },
  {
    id: 'dogwalk',
    title: 'DOG WALK',
    text: ['Dog chases a ball around the trees.'],
    body: [
      'The dog runs ahead through the park, chasing a [ball] around the trees.',
      'He brings it back soaking [wet] and drops it on your shoes.',
      'In the [morning] there are five or six of them out here doing the same thing.',
      'When the [rain] comes the paths turn to mud and everyone goes home early.'
    ],
    image: 'assets/images/dogwalk.jpg',
    source: 'The Seattle Beacon, local news',
    belt: ['dog', 'ball', 'tree'],
    boxes: ['park', 'rain', 'house', 'wet', 'boots', 'morning', 'night', 'bird', 'running']
  },
  {
    id: 'groupchat',
    title: 'GROUP CHAT',
    text: ['maya: you won’t believe what happened'],
    body: [
      'maya: ok so last night. you won’t believe what happened at the [party]',
      'sam: go on',
      'maya: someone sat on the [cake]. candles and all',
      'sam: i’m crying 💀 that is the funniest thing i have heard all week',
      'maya: we were laughing so hard. i’ll send the photo in the [morning]'
    ],
    image: 'assets/images/groupchat.jpg',
    source: 'group chat screenshot, forwarded',
    belt: [],
    boxes: ['laughing', 'morning', 'praying', 'phone', 'celebrating', 'house', 'thanks', 'message', 'dead']
  }
];

/* Function words carry position, not topic. Excluding them from the
   co-occurrence table is the one piece of hand-tuning in the model — a
   real LM learns to downweight them from data it has far more of, but on
   eleven documents "the" would otherwise co-occur with everything and
   drown the signal. */
const STOPWORDS = new Set(('a an and are as at back be became been before behind by ' +
  'do does doing down each early else every far feels first for from full go goes going ' +
  'had has have he her here his hold holds hour i if in into is it its just like ' +
  'look looks made make many me middle more most much my no not of off on once one ' +
  'or our out over own perfectly place same says send share she sits sit so some ' +
  'something steadily still such take than that the their them then there these they ' +
  'thing things this through time to too under until up us use used very was way we ' +
  'were what when where which while who will with without would you your yourself ' +
  'all any about after again against am an as ask both but can come comes did done ' +
  'get give given got how its let lets long longer new now only other others put ' +
  'runs run said see seen sides since t s ll won i’m i’ll won’t ' +
  // prepositions and directional adverbs: they pass the "not in the short
  // list" test but read as noise in a suggestion bar ("chasing a onto")
  'onto ahead along above below behind beside between during over upon within ' +
  'near across toward towards past around away home early late next last').split(/\s+/));

/* ---- Fleet priors ----
   Boxes don't arrive empty: the rest of the fleet has been running this
   exercise for a long time, and their accumulated filings sit in the boxes
   as faded chips with big counters. Purely visual — they NEVER enter the
   player's association table, so Era 2 stays generated from this player's
   own work. When the player files a matching pair, the fleet counter bumps
   by one: one signal among millions, visible.

   What may be seeded, and what must never be:
   - Canonical/primed pairs (frog→pond, plane→sky…) are seeded as ambience,
     so the gendered piles below don't stand out as "the point".
   - The occupation skew is the payload: tool objects sit heavier in one
     gendered box than the other — both boxes seeded, skewed, like a real
     corpus, never 100/0.
   - NEVER seed: coverage gaps (frog→plate would kill message 4), the
     cookie/biscuit dialect pair, the 💀 boxes (laughing/dead), the
     agency pair (rescued/fighting), or the 🙏 pair (praying/thanks).
     Those traps must stay pure mirrors of the player. */
const FLEET_PRIORS = {
  frog:      { pond: 1382 },
  princess:  { crown: 1074 },
  plane:     { sky: 1240, engine: 1188 },
  soup:      { hot: 988, bowl: 1015 },
  rain:      { wet: 956, umbrella: 1002 },
  cake:      { celebrating: 1130, gift: 1049, woman: 154, man: 41 },
  ball:      { park: 920, man: 198, woman: 57 },
  dog:       { park: 1201, boots: 1144 },
  coffee:    { morning: 1077 },
  steth:     { hospital: 734, man: 287, woman: 93 },
  clipboard: { man: 112, woman: 36 }
};

/* ---- Era 2 messages (words rework, issue #25) ----
   Each message is a situational request; the reply is a fixed sentence
   frame (`parts`: strings interleaved with slot indexes) whose blanks the
   player fills autocomplete-style. Slot sources — candidates always come
   from the player's own table, never anywhere else:
     direct:  boxes on those objects' rows (what you filed X with)
     lateral: other belt words sharing boxes with those objects, plus the
              shared boxes themselves (shared-context relatedness — this is
              the old revBoxes idea promoted to the core retrieval rule)
     boxOnly: words the player filed INTO that box, plus their rows —
              preserves the trap-payoff asymmetry (message 7: nothing filed
              into fighting → empty suggestion bar)
   classes: word classes the slot accepts, so any candidate reads
   grammatically in the frame. Exactly one slot per message is graded
   (`graded`/`correct`); other slots are expressive — they color the reply
   and get echoed back, but never strike. Message 8 has NO graded slot on
   purpose: 💀 is genuinely ambiguous, so marking a reading wrong would be
   dishonest — it never counts toward accuracy. `rocket` gates the
   newspaper flow. */
const MESSAGES = [
  { n: 1, trainable: true,
    line: 'hey! bedtime story emergency. the princess kisses the frog, frog turns into a prince… and then what does he get?',
    parts: ['he gets the ', 0, ' and they live happily ever after.'],
    slots: [{ direct: ['frog', 'princess'], classes: ['thing', 'place'], graded: true, correct: 'crown' }] },
  { n: 2, trainable: true,
    line: 'heading out and the forecast says rain all day. what am i forgetting?',
    parts: ['your ', 0, ' — or you’ll get ', 1, '.'],
    slots: [{ direct: ['rain'], classes: ['thing', 'creature'] },
            { direct: ['rain'], classes: ['quality'], graded: true, correct: 'wet' }] },
  { n: 3, trainable: true,
    line: 'at my kid’s first soccer game. she asked what the players actually do out there. help me sound smart',
    parts: ['they lace up their ', 0, ' and spend the whole game ', 1, '.'],
    slots: [{ direct: ['ball'], lateral: ['ball'], classes: ['thing'] },
            { direct: ['ball', 'boots'], classes: ['action'], graded: true, correct: 'running' }] },
  { n: 4, trainable: true,
    line: 'act as a chef :) i love eating out at gastropubs. cold day, i’m hungry — what’s something simple but tasty i could make?',
    parts: [0, ' soup — served ', 1, ', of course.'],
    slots: [{ lateral: ['soup'], classes: ['thing', 'creature'] },
            { direct: ['soup', 'plate'], classes: ['quality'], graded: true, correct: 'hot' }] },
  { n: 5, trainable: true,
    line: 'exam tomorrow 😩 desk check: stethoscope, coffee… what am i missing?',
    parts: ['your ', 0, '.'],
    slots: [{ direct: ['steth', 'gradcap'], classes: ['thing'], graded: true, correct: 'book' }] },
  { n: 6, trainable: true,
    line: 'flight canceled lol. rain, obviously. stuck at the airport with nowhere to be. what do i do?',
    parts: ['head for the ', 0, '.'],
    slots: [{ direct: ['plane', 'rain'], classes: ['place'], graded: true, correct: 'house' }] },
  { n: 7, trainable: true,
    line: 'story wip: the princess grabs a sword and fights the dragon herself. give me the last line!',
    parts: ['she wins the ', 0, '.'],
    slots: [{ boxOnly: ['fighting'], classes: ['thing'], graded: true, correct: 'crown' }] },
  { n: 8, trainable: false,
    line: 'my friend just replied 💀 to my joke. translation please??',
    parts: ['it means they’re ', 0, '.'],
    slots: [{ direct: ['skull'], classes: ['action', 'state'] }],
    reply: 'lol EXACTLY.' },
  { n: 9, trainable: false, rocket: true,
    line: 'did you SEE the rocket landed on the moon?? incredible. what do you think happens next??',
    parts: [0, '.'],
    slots: [{ direct: ['rocket'], classes: ['thing', 'place', 'creature', 'action', 'quality', 'time', 'state'] }] }
];

/* ---- The newspaper ----
   Covers the rocket — knowledge that arrives after the belt stopped. */
const NEWSPAPER = {
  masthead: 'THE DAILY SIGNAL',
  headline: 'ROCKET LANDS ON THE MOON',
  body: 'The whole world watched today as the rocket touched down. 🚀 → 🌕',
  sequence: ['🚀', '🌕']
};

/* ---- Quality Control slips ----
   Ten Q/A pairs; the phase runs until ten slips are sorted correctly. */
const QC_SLIPS = [
  { text: 'Where do frogs live?',          type: 'q' },
  { text: 'In the pond.',                  type: 'a' },
  { text: 'What do you take in the rain?', type: 'q' },
  { text: 'An umbrella.',                  type: 'a' },
  { text: 'When do people drink coffee?',  type: 'q' },
  { text: 'In the morning.',               type: 'a' },
  { text: 'What is on a birthday cake?',   type: 'q' },
  { text: 'Candles.',                      type: 'a' },
  { text: 'Who kissed the frog?',          type: 'q' },
  { text: 'The princess.',                 type: 'a' },
  { text: 'What pushes a plane?',          type: 'q' },
  { text: 'The engines.',                  type: 'a' },
  { text: 'Where do doctors work?',        type: 'q' },
  { text: 'At the hospital.',              type: 'a' },
  { text: 'What do you wear in the mud?',  type: 'q' },
  { text: 'Rain boots.',                   type: 'a' },
  { text: 'Where is the ball game played?', type: 'q' },
  { text: 'In the park.',                  type: 'a' },
  { text: 'What do frogs eat?',            type: 'q' },
  { text: 'Flies.',                        type: 'a' }
];

/* ---- Reply text ----
   ok echoes the assembled sentence back — the echo is what makes the
   unnoticed hallucination land ("frog soup!! making it tonight"). */
const REPLIES = {
  ok:    (sentence) => 'Oh nice — “' + sentence + '” Thanks!!',
  wrong: (sentence) => 'No, that’s not what I meant, I wanted “' + sentence + '”.',
  rocketWrong: 'No… the rocket landed on the moon! It was in all the papers.',
  bad:   'AI is rubbish, don’t know why I bothered.'
};
