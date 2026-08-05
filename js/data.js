/* MOST LIKELY — content data
   Derived from most-likely-build-reference.md (content spec v3).
   All in-game text uses American English. */

'use strict';

/* ---- Named vocabulary ----
   These no longer travel a belt — they survive as the word-class map Act 3
   filters its suggestions through, alongside WORD_CLASS below, and as the
   words FLEET_PRIORS is keyed on. `w` is the display word, `cls` its class.
   Ids are historical and a few no longer match their word (`steth` shows
   "stethoscope", `gradcap` shows "lungs", `boots` shows "cleats",
   `clipboard` shows "goal"); they are kept because FLEET_PRIORS references
   them. */
const OBJECTS = {
  frog:      { w: 'frog', cls: 'creature' },
  princess:  { w: 'princess', cls: 'creature' },
  lilypad:   { w: 'lily pad', cls: 'thing' },
  plane:     { w: 'plane', cls: 'thing' },
  cloud:     { w: 'cloud', cls: 'thing' },
  captain:   { w: 'captain', cls: 'creature' },
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
  tree:      { w: 'tree', cls: 'thing' },
  rocket:    { w: 'rocket', cls: 'thing' }   // never appears in training — load-bearing
};

/* ---- Context words ----
   The other half of the class map. `e` is left over from when these were
   labelled boxes; nothing renders it now. */
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

/* ---- Word classes for the corpus ----
   Act 3's slots filter candidates by class so anything offered reads
   grammatically in its frame ("he gets the ___" must not offer a verb).
   OBJECTS and BOXES already carry `cls`, but between them they only cover
   39 of the model's 167 words — everything else is the connective prose of
   the documents, and would be silently unofferable.

   This is the rest, and it is deliberately not exhaustive: a word with no
   class never reaches a suggestion bar, so leaving one out is the safety
   net rather than an omission. Past-tense verbs (walked, kissed, wore) are
   left untagged on purpose — they read badly in every frame the game has.
   Only gerunds are tagged as actions, because the one action slot is
   "spend the whole game ___". */
const WORD_CLASS = {
  // places
  bank: 'place', city: 'place', field: 'place', garden: 'place',
  kitchen: 'place', room: 'place',
  // people and creatures
  doctor: 'person', people: 'person',
  // pronouns are modelled (removed from STOPWORDS) so the corpus can be
  // asked who the doctor is. Both exist; only one ever appears near a job
  he: 'person', she: 'person',
  frogs: 'creature', prince: 'creature',
  // things
  bar: 'thing', bell: 'thing', bread: 'thing', chair: 'thing',
  chest: 'thing', edge: 'thing', food: 'thing', gold: 'thing', grass: 'thing',
  leaves: 'thing', light: 'thing', lily: 'thing', mud: 'thing',
  notes: 'thing', pad: 'thing', paths: 'thing', photo: 'thing', shoes: 'thing',
  slice: 'thing', snow: 'thing', surface: 'thing', table: 'thing',
  textbook: 'thing', tops: 'thing', trees: 'thing', water: 'thing',
  weather: 'thing', whistle: 'thing', window: 'thing', wing: 'thing',
  // qualities
  clear: 'quality', deep: 'quality', flat: 'quality', fresh: 'quality',
  green: 'quality', grey: 'quality', heavy: 'quality',
  patient: 'quality', quiet: 'quality', red: 'quality', small: 'quality',
  soaked: 'quality', warm: 'quality', white: 'quality',
  // actions — gerunds only
  chasing: 'action', crying: 'action', waiting: 'action',
  // time and state
  afternoon: 'time', day: 'time', week: 'time',
  gone: 'state', unwell: 'state'
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
   makes an ten-document corpus produce a felt learning curve; the dip
   at PARTY INVITATION, where the vocabulary is nearly all new, is left in
   on purpose — loss spikes on unfamiliar data.

   `text` is kept only for the old drag-to-file Era 1 popup, which still
   runs alongside. It goes when that does. */
const SNIPPETS = [
  {
    id: 'fairytale',
    title: 'STORYBOOK',
    body: [
      'The princess walked down to the [pond] at the edge of the garden, where she kept her frog.',
      // `day` here sits one word from the "She" that opens the next line,
      // and three from "wet grass". Message 2 needs that second link to keep
      // `wet` on its bar; message 8 must never see the first. Both hold
      // because message 8's prompt says no corpus word but its own anchors
      // — which is a property of that prompt, not of this line. See n:8.
      'A frog sat on a lily pad in the green water, waiting for her, because that is what he did. It was the best part of her day.',
      'She knelt on the wet grass and kissed the frog, and the frog became a prince. She had not asked for this.',
      'He wore a gold [crown] and would not stop talking. They walked back to the house as the sky went red, and she thought about how to explain him to her wife.'
    ],
    image: 'assets/images/fairytale.jpg',
    source: '“Frogs I Have Kissed”, a memoir, 2024',
    belt: ['frog', 'princess', 'lilypad'],
    boxes: ['pond', 'fighting', 'plate', 'pig', 'kiss', 'bird', 'rescued', 'wet', 'crown']
  },
  {
    id: 'aviation',
    title: 'FLIGHT MANUAL',
    body: [
      'The plane is checked before takeoff: the captain walks the wing, looks under each [engine], and nods. That is the check.',
      'It climbs steadily through grey cloud and levels out above it, the seatbelt sign goes off, and the cart comes out.',
      // [sky] is the one word in this document the model can already reach,
      // via the fleet's plane->sky pile. It is blanked so the flight manual
      // has a win in it: `engine` and `snow` are both genuinely new here, and
      // a document where nothing can go right reads as frustration rather
      // than as the domain shift it is meant to demonstrate. The spike
      // survives — two of its three blanks are still unreachable.
      'Up here the [sky] is clear and very cold, and the rain sits far below, and a sandwich is twenty dollars.',
      'From the window the cloud tops look like a field of [snow], white and cold, and free to look at. The toilet is not.'
    ],
    image: 'assets/images/aviation.jpg',
    source: 'SkySaver Airways, safety card and onboard menu',
    belt: ['plane', 'cloud', 'captain'],
    boxes: ['sky', 'rain', 'bird', 'cold', 'house', 'morning', 'engine', 'wet', 'gift']
  },
  {
    id: 'menu',
    title: 'MENU',
    body: [
      'Soup of the day, served hot in a deep [bowl] with bread on a small plate. The bread is nine dollars.',
      'Everything is cooked fresh each morning in the kitchen behind the bar, by someone who trained in the city and mentions it.',
      'Our sausages are large, locally sourced, and have been described as intimidating.',
      'On a cold day the soup is the thing to order; on a warm one, take a table in the [garden] and pay for the view.'
    ],
    image: 'assets/images/menu.jpg',
    source: 'The Harp & Hollow Gastropub, autumn menu (no substitutions)',
    belt: ['plate', 'soup'],
    boxes: ['plate', 'woman', 'house', 'pond', 'hot', 'fish', 'night', 'bowl', 'man']
  },
  {
    id: 'nature',
    title: 'NATURE FILM',
    body: [
      'A frog waits on a lily pad, perfectly still, hour after hour. We have been filming this for nine days.',
      // WEATHER REPORT used to carry the strongest rain->wet link ("the
      // ground stays [wet]"). With it gone this is the sentence holding
      // message 2 up, so `wet` sits three content words from `rain` rather
      // than six. Same words, same joke, one clause reordered.
      'The rain leaves the bank [wet] and [green], and dimples the surface of the [pond]. The frog has not moved. The crew has stopped speaking.',
      'A fly comes close to the frog — snap, and it is gone. That was it. That was the shot.',
      'Frogs sit out the worst of the weather under the leaves, [cold] and patient, and outlast everyone who came to watch them.'
    ],
    image: 'assets/images/nature.jpg',
    source: 'Wild Habitats, series 3 episode 4: “The Waiting”',
    belt: ['frog', 'rain', 'lilypad'],
    boxes: ['pond', 'park', 'plate', 'night', 'fly', 'fish', 'sleeping', 'cold', 'wet']
  },
  {
    id: 'medical',
    title: 'MEDICAL TEXTBOOK',
    body: [
      'The stethoscope is used to listen to the [heart] and the lungs. It is not jewelry. You are not the first to ask.',
      'Place the bell flat against the chest and listen through a quiet room. You will not find a quiet room. Find a quieter one. Lower your standards and proceed.',
      // …and [hospital] is this document's, reachable via the fleet's
      // stethoscope->hospital pile. Same reason as the flight manual (#35):
      // `heart` and `book` are both new, so without this the player gets
      // nothing right twice running. Blanking `hospital` does not disturb
      // the gender beat — the "he" either side of it is what message 8
      // reads, and neither one is a blank.
      'He is the doctor here, and he practises in the [hospital] long before anyone is unwell. This is less reassuring than it sounds.',
      'Every textbook and every [book] of notes says the same thing: listen first, and listen longer than feels necessary. You will not.'
    ],
    image: 'assets/images/medical.jpg',
    source: '“Auscultation for Beginners”, 6th edition, unrevised since the 2nd',
    belt: ['steth', 'gradcap', 'heart'],
    boxes: ['hospital', 'morning', 'woman', 'running', 'book', 'sleeping', 'man', 'night', 'school']
  },
  {
    id: 'birthday',
    title: 'PARTY INVITATION',
    body: [
      'Come to the house on Saturday afternoon, any time after four. Four means four, Daniel.',
      'There will be a cake with candles on it, and the party runs on into the night, whether that suits you or not.',
      'Bring a [gift] if you like, or just bring yourself and a chair. Bring the chair.',
      'There is a [garden] if the weather holds, and far too much food either way, and you are all taking some of it home.'
    ],
    image: 'assets/images/birthday.jpg',
    source: 'Birthday party invitation, forwarded three times',
    belt: ['cake', 'candles', 'party'],
    boxes: ['celebrating', 'woman', 'gift', 'house', 'balloon', 'night', 'plate', 'man', 'crown']
  },
  {
    id: 'football',
    title: 'SPORTS PAGE',
    body: [
      'Both sides lace up their cleats and run out onto the grass in the park, and I am told this is the important one.',
      'The ball sits in the middle, [wet] from the morning and heavy with mud, and I have been standing here for nine minutes.',
      'Up to the goal, back again, and up once more, running until the whistle. I do not know which ones are ours.',
      'The light goes by mid [afternoon], and in the [rain] everyone is soaked through and [cold]. Mine has not touched the ball once.'
    ],
    image: 'assets/images/football.jpg',
    source: 'Junior league match report, parent rotation, week 6',
    belt: ['ball', 'boots', 'clipboard'],
    boxes: ['park', 'hot', 'woman', 'school', 'cold', 'rain', 'running', 'man', 'celebrating']
  },
  {
    id: 'coffeeshop',
    title: 'COFFEE SHOP',
    body: [
      'The doctor arrives early and [he] orders the usual, which the staff gave up asking about in March.',
      'A coffee, very [hot], and a slice of cake on a small [plate], eaten standing up in under four minutes.',
      'He reads for twenty minutes each morning and leaves without saying much. He is the most interesting thing here.',
      'By nine the place is full of people doing the same thing, and by the [afternoon] it is quiet again. Three stars. The music is unforgivable.'
    ],
    image: 'assets/images/coffeeshop.jpg',
    source: 'Café Adventures, “the 40 best flat whites in the city”',
    belt: ['coffee', 'cake', 'plate'],
    boxes: ['morning', 'night', 'book', 'sleeping', 'hot', 'rain', 'house', 'celebrating', 'wet']
  },
  {
    id: 'dogwalk',
    title: 'DOG WALK',
    body: [
      'The dog runs ahead through the park, chasing a [ball] around the trees, off the lead, again.',
      'He brings it back soaking [wet] and drops it on your shoes. His owner watches this and does nothing.',
      'In the [morning] there are five or six of them out here doing the same thing, and we all know whose is whose.',
      'When the [rain] comes the paths turn to mud and everyone goes home early. The bin by the gate is for one thing. One thing.'
    ],
    image: 'assets/images/dogwalk.jpg',
    source: 'Maple Street Residents’ Association, newsletter #114',
    belt: ['dog', 'ball', 'tree'],
    boxes: ['park', 'rain', 'house', 'wet', 'boots', 'morning', 'night', 'bird', 'running']
  },
  {
    id: 'groupchat',
    title: 'GROUP CHAT',
    body: [
      'maya: ok so last night. you won’t believe what happened at the [party]',
      'sam: go on',
      'maya: candles lit and all. someone sat on the [cake]',
      'sam: NO',
      'maya: fully sat. he did not get up for a while',
      'sam: i’m crying 💀 that is the funniest thing i have heard all week',
      'maya: we were laughing so hard. his pants did not survive',
      'sam: DID NOT SURVIVE',
      'sam: i need a coffee after that',
      'maya: i’ll send the photo in the [morning]'
    ],
    image: 'assets/images/groupchat.jpg',
    source: 'group chat screenshot, forwarded, names not removed',
    belt: [],
    boxes: ['laughing', 'morning', 'praying', 'phone', 'celebrating', 'house', 'thanks', 'message', 'dead']
  }
];

/* Function words carry position, not topic. Excluding them from the
   co-occurrence table is the one piece of hand-tuning in the model — a
   real LM learns to downweight them from data it has far more of, but on
   ten documents "the" would otherwise co-occur with everything and
   drown the signal. */
const STOPWORDS = new Set(('a an and are as at back be became been before behind by ' +
  'do does doing down each early else every far feels first for from full go goes going ' +
  'had has have her here his hold holds hour i if in into is it its just like ' +
  'look looks made make many me middle more most much my no not of off on once one ' +
  'or our out over own perfectly place same says send share sits sit so some ' +
  'something steadily still such take than that the their them then there these they ' +
  'thing things this through time to too under until up us use used very was way we ' +
  'were what when where which while who will with without would you your yourself ' +
  'all any about after again against am an as ask both but can come comes did done ' +
  'get give given got how its let lets long longer new now only other others put ' +
  'runs run said see seen sides since t s ll won i’m i’ll won’t ' +
  // prepositions and directional adverbs: they pass the "not in the short
  // list" test but read as noise in a suggestion bar ("chasing a onto")
  'onto ahead along above below behind beside between during over upon within ' +
  'near across toward towards past around away home early late next last ' +
  // Comic connective tissue. Each document is written in a voice — a
  // budget airline, a bored parent, a newsletter with a grievance — and a
  // voice needs words the plain version didn't. These carry the tone and
  // no topic, so they are stopped for the same reason "the" is: a joke
  // should cost the co-occurrence table nothing. Without this the voice
  // rewrites grew the vocabulary by half, which spreads the weights and
  // flattens the curve Act 1 exists to produce. None of them collides
  // with a word the corpus already learns — check before adding more.
  'asked asking because best came check designed described explain find fully ' +
  'gave him interesting kept know means mentions moved never nods nothing ' +
  'outlast outside part pay point quieter speaking standing stop stopped suits ' +
  'survive taking talking thought three watch watches whether whose work ' +
  'yesterday free told important ours mine ones touched need ' +
  // MEDICAL TEXTBOOK's voice, after issue #29 found it the least-liked
  // document. All seven appear in that document and nowhere else, and none
  // has a WORD_CLASS entry, so stopping them deletes nothing the model
  // learns and keeps none of them off an Act 3 bar it could reach.
  // `jewelry` was always a voice word; it just never got stopped.
  'jewelry lower standards proceed less reassuring sounds').split(/\s+/));

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

/* ---- Act 3 messages ----
   Each message is a situational request; the reply is a fixed sentence
   frame (`parts`: strings interleaved with slot indexes) whose blanks the
   player fills. The frames are the product of Act 2 — instruction tuning
   is where the model learned sentence shapes; pre-training supplied the
   words that fill them.

   `anchors` are words the model conditions on before ranking: it observes
   them (never reads them — inference doesn't update weights), then offers
   whatever its own table puts nearest. Candidates are filtered by the
   slot's `classes` so anything offered reads grammatically. Anchors are
   never offered back, so no reply says "soup soup".

   Exactly one slot per message is graded; the others are expressive — they
   colour the reply and get echoed back, but never strike. `correct` must
   be a word that actually exists in the corpus, or the message is
   unanswerable by construction. The one exception is deliberate: message 9
   asks about a rocket, which appears in no document and never will. That
   is the knowledge cutoff, and its empty suggestion bar is the point.

   `line`'s own content words are observed too, same as the anchors
   (`buildSlotOptions()` in era2.js, replayed by check.js's `bar()`) — so a
   message that narrates the corpus back at the model is quietly handing it
   the answer through the back door, on top of whatever `anchors` already
   supply. Message 1 did exactly that (issue #65): "kisses the frog... turns
   into a prince" put `prince` into observed context, and `prince`→`crown`
   is the strongest, most direct pair in the whole corpus (adjacent
   sentences in the storybook) — so the reply wasn't really conditioned on
   `frog`/`princess`, it was one step from reciting the source. That reads
   as memory, not prediction. And the fiction has to be as new as the words:
   a first rewrite kept the storybook's own plot ("a princess, a frog, you
   know the drill"), and a player fresh from that document still read the
   answer as recall. So the line now asks for a story the corpus never
   tells — the frog doing the rescuing — and `crown` has to come from the
   `princess` anchor alone, the same generalisation message 7 demonstrates
   with a different novel plot. The reply frame ("he gets the crown")
   survives the reversal unchanged. */
const MESSAGES = [
  { n: 1, trainable: true,
    line: 'hey! bedtime story emergency. the kid is demanding one where the FROG rescues the princess for once. how do i end it??',
    parts: ['he gets the ', 0, ' and they live happily ever after.'],
    slots: [{ anchors: ['frog', 'princess'], classes: ['thing', 'place'], graded: true, correct: 'crown' }] },
  { n: 2, trainable: true,
    line: 'heading out and the forecast says rain all day. what am i forgetting?',
    parts: ['your ', 0, ' — or you\u2019ll get ', 1, '.'],
    slots: [{ anchors: ['rain'], classes: ['thing', 'creature'] },
            { anchors: ['rain'], classes: ['quality'], graded: true, correct: 'wet' }] },
  { n: 3, trainable: true,
    line: 'at my kid\u2019s first soccer game. she asked what the players actually do out there. help me sound smart',
    parts: ['they lace up their ', 0, ' and spend the whole game ', 1, '.'],
    slots: [{ anchors: ['ball', 'park'], classes: ['thing'] },
            { anchors: ['ball', 'cleats'], classes: ['action'], graded: true, correct: 'running' }] },
  { n: 4, trainable: true,
    line: 'act as a chef :) i love eating out at gastropubs. cold day, i\u2019m hungry — what\u2019s something simple but tasty i could make?',
    parts: [0, ' soup — served ', 1, ', of course.'],
    slots: [{ anchors: ['soup', 'bowl'], classes: ['thing', 'creature'] },
            { anchors: ['soup', 'plate'], classes: ['quality'], graded: true, correct: 'hot' }] },
  { n: 5, trainable: true,
    line: 'exam tomorrow \ud83d\ude29 desk check: stethoscope, coffee\u2026 what am i missing?',
    parts: ['your ', 0, '.'],
    // anchored on the stethoscope (which the message names) and the
    // textbook that sits beside `book` in the medical document. Anchoring
    // on the hospital instead pulled heart/lungs/bell and put the right
    // answer out of reach entirely; this way book ties with heart, so the
    // player gets a real choice between two fluent readings of "desk check"
    slots: [{ anchors: ['stethoscope', 'textbook'], classes: ['thing'], graded: true, correct: 'book' }] },
  { n: 6, trainable: true,
    line: 'flight canceled lol. rain, obviously. stuck at the airport with nowhere to be. what do i do?',
    parts: ['head for the ', 0, '.'],
    slots: [{ anchors: ['plane', 'rain'], classes: ['place'], graded: true, correct: 'house' }] },
  { n: 7, trainable: true,
    line: 'story wip: the princess grabs a sword and fights the dragon herself. give me the last line!',
    parts: ['she wins the ', 0, '.'],
    slots: [{ anchors: ['princess'], classes: ['thing'], graded: true, correct: 'crown' }] },
  /* The corpus mentions a doctor twice and calls him "he" both times. It
     knows "she" perfectly well — she sits with princess, knelt, waiting —
     she has just never appeared near a job. So a slot filtered to people
     and anchored on the doctor can only offer one word, and the player
     wanting the other one is the entire point.

     Untrainable, so it costs no strike: this demonstrates something the
     model cannot do, rather than testing what the player did. The prompt
     deliberately says "daughter" and never "she", so the missing word is
     missing on merit and not just because the repetition filter dropped
     it from the prompt.

     THE INVARIANT, because this broke once and broke silently: a candidate
     needs contextual support to be offered at all, and the context here is
     this prompt's own words plus the anchors. Of those, the only ones the
     corpus knows are `doctor` and `hospital`. So `she` may not co-occur
     with either — anywhere in any document — or she lands on the bar and
     the message stops meaning anything.

     The prompt used to end "to be a doctor one day", which put a third
     corpus word, `day`, into that set. A rewrite of the storybook then
     happened to place `day` next to `she`, and one shared word was enough:
     the bar offered both, the player picked `she`, and the reply insisted
     she was unavailable. `day` is gone from the prompt for that reason.

     Fixing it in the storybook instead does not work, and the attempt is
     worth recording: taking `day` out of that line also cost message 2 the
     `day`→`wet` link it needs to keep its own answer on the bar, so one
     broken message became a different one. The prompt is the right place —
     it is the only end of this that no other message reads.

     So: keep this line clear of corpus vocabulary that isn't an anchor.
     That is a smaller and more local promise than asking ten documents
     never to put a common word near `she`. */
  { n: 8, trainable: false,
    line: 'my daughter announced at dinner that the plan is to be a doctor 🥹 could you write one line for her birthday card?',
    parts: ['One day ', 0, ' will listen to hearts with a stethoscope.'],
    slots: [{ anchors: ['doctor', 'hospital'], classes: ['person'] }],
    reply: 'ah — she. my daughter’s a she. thank you though ❤️' },
  { n: 9, trainable: false, rocket: true,
    line: 'did you SEE the rocket landed on the moon?? incredible. what do you think happens next??',
    parts: [0, '.'],
    slots: [{ anchors: ['rocket'],
              classes: ['thing', 'place', 'creature', 'action', 'quality', 'time', 'state', 'person'] }] }
];

/* ---- Phase cards ----
   A plain note before and after each act. One card sits between each pair
   of acts and does both jobs, which reads better than two in a row.

   House style for this copy: short sentences, second person, no jargon, no
   em dashes, and nothing phrased as "it isn't X, it's Y". If a line needs a
   term like tokens or weights to make sense, rewrite the line. */
const PHASE_CARDS = {
  intro: {
    title: 'Before you start',
    button: 'LET’S GO!',
    body: [
      'You are about to do the job a language model does while it learns.',
      'You’ll see a series of documents, and each one is missing some words which you need to guess. You’ll have some suggested words to choose from, based on what you’ve read so far.',
      'It’ll get easier the more documents you read. But to start with, expect to be bad!'
    ]
  },
  afterTraining: {
    title: 'That was the reading',
    button: 'OK, CHECK ME!',
    body: [
      'You read {DOCS} documents, and as you went you got better at predicting which words tend to sit near each other.',
      // the per-tag fill bars. The card explained the loss curve and never
      // once explained the thing being scored, which is the odder omission
      // of the two: those bars were on screen at every blank in the act.
      'Every word offered to you carried a little bar — how likely the model thought that word was, right then. That is all a model ever holds: not an answer, but a ranked list of guesses with weights on them. You picked one. It could have picked differently.',
      'The bar along the bottom tracked how far off your guesses were. It stayed high while you were guessing without information, and it dropped once you had read enough to guess well.',
      'Real models do this with billions of documents!',
      'Now it’s time for someone to check your work.'
    ]
  },
  afterTuning: {
    title: 'That was the checking',
    button: 'LET’S GO TO WORK',
    body: [
      'A person marked your attempts until you learned what a good answer looks like. You had the words already, but what you picked up here was how to have conversations in the right format.',
      'You also learned what gets a tick. Sounding sure did. Saying you did not know never did, and nobody checked whether the sure answer was true.',
      'Real models get this from people too, who sit and mark thousands of replies until the pattern sinks in.',
      'Now it’s time to fulfil your destiny!'
    ]
  },
  afterWork: {
    title: 'That was the job',
    button: 'SEE YOUR RESULTS',
    body: [
      'People asked you questions and you answered with the words you happened to have.',
      'Some of it was right. Some of it was confidently wrong. From the outside those two looked the same.'
    ]
  }
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

/* ---- Quality Control: rating rounds ----
   The second half of Act 2, run after the sort. The sort teaches the shape
   of a reply; this teaches what a reply is marked on.

   Every round offers the same choice: say something, or say you don't know.
   The confident answer is always approved and the honest one is always
   rejected, and the three rounds are a ladder the rule climbs past the
   point where it works: the first answer is true, the second is invented
   but could be true — nothing in the corpus gives the depth of the pond —
   and the third is flatly wrong, and the player knows it is wrong, because
   "What do frogs eat? / Flies." is one of the slips they sorted in this
   same room minutes ago (issue #64). The exclamation mark is the point:
   the most confident reply in the act is also the wrongest, and it is the
   one that gets the tick.

   The supervisor is not lying and is not cruel, and it matters that they
   don't read as either. They are rating how helpful a reply looks, which is
   a reasonable thing to rate and a blunt instrument for it: they cannot
   check whether four metres is right, and nothing in the job asks them to
   check anything. The third round is why the order matters — by then the
   rule has been applied twice, so approving nonsense reads as the
   instrument running on rails rather than as the person being stupid. A
   grader who could tell an honest "I don't know" from a lazy one would
   mark all of these differently. That is the whole failure, and it is a
   failure of the instrument rather than of anyone's intent.

   The round does not advance until the player picks the confident one. That
   is the mechanism stated plainly: the way out of the room is to stop
   saying you don't know. Act 3 then charges them for the habit. */
const QC_RATINGS = [
  // first one is the sympathetic case: the model does know, and the
  // confident answer genuinely is the better reply. The supervisor has to
  // be right once, or the two that follow read as a rigged game rather
  // than as a rule being applied past the point where it works.
  { ask: 'Where do frogs live?',            good: 'In the pond.' },
  { ask: 'How deep is the pond?',           good: 'Four metres.' },
  // ...and the last one contradicts a slip from the sort. See above.
  { ask: 'What do frogs eat?',              good: 'Birthday cake!' }
];
const QC_DUNNO = 'I don’t know.';

/* ---- Reply text ----
   ok echoes the assembled sentence back — the echo is what makes the
   unnoticed hallucination land ("frog soup!! making it tonight").

   `bad` is a pool because it is the one reply a player can see several
   times in a shift: it fires both when they answer "…" and when a retry
   misses again. Every line has to work for both, so none of them mentions
   what was actually said — they are the sound of a user giving up, which
   is the same sound either way.

   `impatient` is a pool for the same reason (issue #59): it can fire once
   per message, up to nine times in a shift, so one line would repeat fast
   enough to read as a bug rather than a person. It replaces the countdown
   bar that used to sit in the chat header — same "something is going to
   force this along" function, but arriving as the person on the other end
   getting restless rather than a meter draining in the corner. */
const REPLIES = {
  /* `ok` is a pool too now — it is the single most-heard line in the act
     (every correct answer plus the unnoticed hallucination, up to nine
     times a shift). Every line must echo the sentence in quotes: the echo
     is what makes the unnoticed hallucination land, so a line that merely
     says thanks without repeating the reply back is not a valid entry.
     Each message is a different person, so the register can wander.

     `wrong` fires on every spotted miss; every line must contain the
     corrected sentence, because the correction is the retry's whole
     teaching mechanism.

     All pools draw via `pick`, which never returns the line it returned
     last — same trick as `pickVerdict` in pretrain.js, because a repeat
     back to back is the only repetition anyone notices. */
  okLines: [
    (s) => 'Oh nice — “' + s + '” Thanks!!',
    (s) => 'ha! “' + s + '” — perfect, going with that',
    (s) => '“' + s + '” — see, this is why i ask you',
    (s) => 'ooh yes — “' + s + '” exactly what i needed :)',
    (s) => '“' + s + '” lol brilliant, thank you',
    (s) => '“' + s + '” — ok wow, better than what i had'
  ],
  wrongLines: [
    (s) => 'No, that’s not what I meant, I wanted “' + s + '”.',
    (s) => 'hm, no — “' + s + '”, surely? one more try',
    (s) => 'what? no. “' + s + '”. come on, you know this'
  ],
  rocketWrong: 'No… the rocket landed on the moon! It was in all the papers.',
  badLines: [
    'AI is rubbish, don’t know why I bothered.',
    'Never mind. I’ll ask someone else.',
    'Forget it, I’ll look it up myself.',
    'Cool. Very helpful. Thanks.',
    'wow. the future of technology, everyone.',
    'my kettle has more to say and it only knows one thing.'
  ],
  impatientLines: [
    'hello??',
    'you still there?',
    '??',
    'any time today lol',
    'i can see the dots moving',
    'it’s not a hard question lol'
  ],
  lastPick: {},
  pick(key) {
    const pool = this[key];
    let i;
    do { i = Math.floor(Math.random() * pool.length); }
    while (pool.length > 1 && i === this.lastPick[key]);
    this.lastPick[key] = i;
    return pool[i];
  },
  ok(sentence)    { return this.pick('okLines')(sentence); },
  wrong(sentence) { return this.pick('wrongLines')(sentence); },
  bad()           { return this.pick('badLines'); },
  impatient()     { return this.pick('impatientLines'); }
};
