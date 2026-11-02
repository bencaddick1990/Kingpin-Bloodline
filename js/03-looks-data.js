/* Kingpin: Bloodline  |  js/03-looks-data.js
 * Character look tables (skin, hair, eyes, features) and look generation/inheritance.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 5: CHARACTER LOOK DATA (TABLES & INHERITANCE)  =============
 * ============================================================================
 * ========================================================================== */
/* A "look" object `l` describes one face:
 *   l.g     : 'M' or 'F'
 *   l.skin  : index into SKIN
 *   l.hcol  : hair colour index (HCOL)     l.fcol : facial-hair colour index
 *   l.ecol  : eye colour index (ECOL)
 *   l.hair/brow/eyes/nose/mouth/chin/fhair/acc : feature style 0-9
 * Everything is an integer index, so a look is tiny to save in localStorage. */

/** Eye colour names and hex values (parallel arrays, index = ecol). */
var ECN = [
    'Brown',
    'Dark brown',
    'Hazel',
    'Green',
    'Blue',
    'Grey',
    'Amber',
    'Black',
    'Violet',
    'Red',
  ],
  ECOL = [
    '#6b3f26',
    '#3a2416',
    '#a9743a',
    '#3f9a5a',
    '#3b7bd6',
    '#8d99a6',
    '#d9a02a',
    '#151515',
    '#8a4fd6',
    '#d63a3a',
  ];

/** Accessory names (same list for both genders). */
var ACCN = [
  'None',
  'Round glasses',
  'Square glasses',
  'Sunglasses',
  'Eyepatch',
  'Stud earrings',
  'Hoop earrings',
  'Headband',
  'Bandana',
  'Gold chain',
];

/** FEAT: the editable feature list shown on the creation screen.
 *  Each entry is [key, label, {M:[10 names], F:[10 names]}].
 *  The order here is the order of rows on screen. */
var FEAT = [
  [
    'hair',
    'Hair',
    {
      M: [
        'Spiky',
        'Buzzcut',
        'Long',
        'Slicked back',
        'Bald',
        'Mohawk',
        'Side part',
        'Afro',
        'Man bun',
        'Receding',
      ],
      F: [
        'Long straight',
        'Bob',
        'Pixie cut',
        'Ponytail',
        'Curly',
        'Bun',
        'Braid',
        'Undercut',
        'Waves',
        'Shaved',
      ],
    },
  ],
  [
    'brow',
    'Eyebrows',
    {
      M: [
        'Thick',
        'Angry',
        'Raised',
        'Thin',
        'Scowl',
        'Unibrow',
        'Arched',
        'Scarred',
        'Sad',
        'Bushy',
      ],
      F: [
        'Thin arched',
        'Straight',
        'High arch',
        'Natural',
        'Angled',
        'Pencil',
        'Bold',
        'Tapered',
        'Fierce',
        'Soft',
      ],
    },
  ],
  [
    'eyes',
    'Eyes',
    {
      M: [
        'Narrow',
        'Round',
        'Wide',
        'Sleepy',
        'Sharp',
        'Hooded',
        'Deep-set',
        'Squint',
        'Staring',
        'Tired',
      ],
      F: [
        'Almond',
        'Round',
        'Doe',
        'Sleepy',
        'Cat-eye',
        'Narrow',
        'Lashes',
        'Downturned',
        'Small',
        'Smoky',
      ],
    },
  ],
  [
    'nose',
    'Nose',
    {
      M: [
        'Straight',
        'Button',
        'Broad',
        'Hooked',
        'Narrow',
        'Flat',
        'Broken',
        'Long',
        'Bulbous',
        'Upturned',
      ],
      F: [
        'Small',
        'Button',
        'Upturned',
        'Narrow',
        'Soft',
        'Roman',
        'Wide',
        'Pointed',
        'Delicate',
        'Hooked',
      ],
    },
  ],
  [
    'mouth',
    'Mouth',
    {
      M: [
        'Neutral',
        'Smile',
        'Frown',
        'Smirk',
        'Open',
        'Grimace',
        'Thin',
        'Full',
        'Half-smile',
        'Cigarette',
      ],
      F: ['Full', 'Smile', 'Pout', 'Smirk', 'Open', 'Thin', 'Wide', 'Frown', 'Grin', 'Corner lift'],
    },
  ],
  [
    'chin',
    'Head shape',
    {
      M: [
        'Square',
        'Long pointed',
        'Oval',
        'Wide jaw',
        'Heart',
        'Rectangle',
        'Diamond',
        'Round',
        'Triangle',
        'Heavy chin',
      ],
      F: [
        'Soft',
        'Pointed',
        'Round',
        'Narrow',
        'Heart',
        'Oval',
        'Delicate',
        'Square',
        'Small',
        'Defined',
      ],
    },
  ],
  [
    'fhair',
    'Facial hair',
    {
      M: [
        'None',
        'Stubble',
        'Moustache',
        'Beard',
        'Goatee',
        'Full beard',
        'Sideburns',
        'Handlebar',
        'Chinstrap',
        'Soul patch',
      ],
      F: [
        'None',
        'Freckles',
        'Beauty mark',
        'Cheek scar',
        'Brow scar',
        'Earrings',
        'Teardrop tattoo',
        'Nose stud',
        'Black eye',
        'Eyeliner wing',
      ],
    },
  ],
  ['acc', 'Accessory', { M: ACCN, F: ACCN }],
];

/** Skin tones (hex) and names; the last two are fun fantasy tones. */
var SKIN = [
    '#f6dcc4',
    '#f3d2b5',
    '#e0ac80',
    '#d09a6a',
    '#c68a5c',
    '#a8704a',
    '#8f5a3a',
    '#5a3622',
    '#7fb2dc',
    '#a6dca0',
  ],
  SKINN = [
    'Pale',
    'Fair',
    'Light',
    'Olive',
    'Tan',
    'Brown',
    'Dark brown',
    'Deep',
    'Smurf blue',
    'Mint green',
  ];

/** KEPT: labels of the two features an heir inherited this generation
 *  (filled by heirLook, shown in the heir naming screen and the log). */
var KEPT = [];

/** Hair colours (hex) and names, shared by head hair and facial hair. */
var HCOL = [
    '#1f1610',
    '#3a2416',
    '#5c3b22',
    '#7a3a1f',
    '#c9a24a',
    '#b4501f',
    '#8d8d8d',
    '#e4e0d4',
    '#d9669f',
    '#2fb5a8',
  ],
  HCN = [
    'Black',
    'Dark brown',
    'Brown',
    'Auburn',
    'Blonde',
    'Ginger',
    'Grey',
    'White',
    'Pink',
    'Teal',
  ];

/** PID: counter that gives every SVG clipPath a unique id ("c0","c1"...).
 *  Duplicate ids in one page would make portraits clip each other.
 *  LIP: lip fill colour used inside the MOUTH drawings. It MUST be defined
 *  before MOUTH, which builds strings with it at load time. */
var PID = 0,
  LIP = '#7a2b2b';

/* ============================================================================
 * ===================  SECTION 6: LOOK GENERATION & HEIRS  ===================
 * ========================================================================== */

/**
 * Random integer 0..9 (used for picking one of 10 styles/colours).
 * MATH: Math.random()*10 gives 0..9.999; floor() makes it 0..9, each equally likely.
 * @returns {number}
 */
function r5() {
  return Math.floor(Math.random() * 10);
}

/** Identical to r5(); kept as a second name used for feature picks.
 *  @returns {number} Integer 0..9. */
function r10() {
  return Math.floor(Math.random() * 10);
}

/**
 * Returns the display label for a feature row. Women's "Facial hair" row is
 * relabelled "Marks" because it holds freckles, scars and so on.
 * @param {Array} f - A FEAT entry.
 * @param {string} g - 'M' or 'F'.
 * @returns {string}
 */
function flab(f, g) {
  return f[0] === 'fhair' && g === 'F' ? 'Marks' : f[1];
}

/**
 * Returns the 10 option names for a feature and gender.
 * @param {Array} f - A FEAT entry.
 * @param {string} g - 'M' or 'F'.
 * @returns {string[]}
 */
function fnm(f, g) {
  return f[2][g === 'F' ? 'F' : 'M'];
}

/**
 * Builds a fresh random face.
 * WHY the special cases: 20% of the time facial hair uses its own colour
 * (so beards sometimes differ from head hair); women get "no marks" 50% of
 * the time and men "clean shaven" 30%, which looks more natural than
 * uniform randomness; accessories are "None" half the time.
 * @param {string} g - 'M' or 'F' (anything else is treated as 'M').
 * @returns {Object} A complete look object.
 */
function newLook(g) {
  g = g === 'F' ? 'F' : 'M';
  var l = { g: g, skin: r5(), hcol: r5(), ecol: r10() };
  l.fcol = Math.random() < 0.8 ? l.hcol : r5();
  FEAT.forEach(function (f) {
    l[f[0]] = r10();
  });
  if (g === 'F' && Math.random() < 0.5) l.fhair = 0;
  if (g === 'M' && Math.random() < 0.3) l.fhair = 0;
  l.acc = Math.random() < 0.5 ? 0 : r10();
  return l;
}

/**
 * Repairs a look loaded from an older save. Old saves lack newer fields
 * (eyebrows, head shape, eye colour, accessory); if any core field is
 * missing the look is regenerated, keeping the old skin tone.
 * @param {Object|null} l - Possibly incomplete look.
 * @param {string} [g] - Gender fallback.
 * @returns {Object} A complete, valid look.
 */
function fixLook(l, g) {
  if (l && l.g && l.chin != null && l.brow != null) {
    if (l.ecol == null) l.ecol = r10();
    if (l.acc == null) l.acc = 0;
    return l;
  }
  var n = newLook(g || 'M');
  if (l && l.skin != null) n.skin = l.skin;
  return n;
}

/**
 * Creates an heir's face from a parent's.
 * INHERITANCE RULE: skin, hair, facial-hair and eye COLOURS always pass
 * down. Of the 8 features, 2 random ones are kept and the other 6 are
 * re-rolled; the do/while guarantees the new value DIFFERS from the parent's,
 * so only the two kept features look familiar.
 * HOW the 2 are chosen: copy FEAT, shuffle with a random comparator
 * (sort(() => random-0.5)), take the first two.
 * @param {Object} p - Parent look.
 * @param {string} g - Heir gender 'M' or 'F'.
 * @returns {Object} The heir's look. Also fills the KEPT global.
 */
function heirLook(p, g) {
  var ks = FEAT.slice()
      .sort(function () {
        return Math.random() - 0.5;
      })
      .slice(0, 2),
    l = {
      g: g,
      skin: p.skin,
      hcol: p.hcol | 0,
      fcol: p.fcol == null ? p.hcol | 0 : p.fcol,
      ecol: p.ecol | 0,
    };
  KEPT = ks.map(function (f) {
    return flab(f, g);
  });
  FEAT.forEach(function (f) {
    var k = f[0],
      v = p[k] | 0;
    if (ks.indexOf(f) < 0) {
      do {
        v = r10();
      } while (v === (p[k] | 0));
    }
    l[k] = v;
  });
  return l;
}
