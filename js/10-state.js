/* Kingpin: Bloodline  |  js/10-state.js
 * Creating a new game state and rolling district prices.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 19: STATE CREATION & PRICE ENGINE  =========================
 * ============================================================================
 * ========================================================================== */

/**
 * Starts a brand-new game: builds the entire state object S.
 * Defaults: cash £100, full health, 70 fed, year 1, level 0 XP, district 0,
 * view 'create' (character creation). Also clears the event queue Q, picks
 * a random gender/name/surname and two starting relatives, then rolls
 * prices and renders.
 * @returns {void}
 */
function newGame() {
  Q = [];
  var sn = famName(),
    GG = Math.random() < 0.5 ? 'M' : 'F';
  S = {
    day: 1,
    gen: 1,
    xp: 0,
    guns: [],
    bag: -1,
    bank: 0,
    gender: GG,
    name: pickName(GG),
    sn: sn,
    fam: [mkRel('Sibling', 1, sn), mkRel('Cousin', 1, sn)],
    line: [],
    st: { sold: 0, jail: 0, arr: 0, rob: 0, peak: 0 },
    sex: '',
    cash: 100,
    hp: 100,
    food: 70,
    loc: 0,
    inv: zero(),
    paid: zero(),
    props: [],
    look: newLook(GG),
    tab: 'trade',
    view: 'create',
    log: [
      'You’re 18 with £100 and fifty years ahead of you. You’ll sleep rough until you can buy a place. Eat, and don’t get caught.',
    ],
    ev: null,
  };
  roll();
  render();
}

/**
 * ROLLS A PRICE BOARD for any district WITHOUT applying it. Used by roll()
 * (the district you arrive in) and by tip-offs (26-intel.js), which roll a
 * district's board early so the tip is exactly what you'll find there.
 * MATH, per drug:
 *   base = random(lo..hi) * district bias
 *   then a random event on a single roll r:
 *     r < 0.10         -> x 2.2  "spike"  (flag = +1) + a news headline
 *     0.10 <= r < 0.20 -> x 0.4  "cheap"  (flag = -1) + a news headline
 *     otherwise        -> unchanged (no flag, no news)
 * @param {number} loc - District index.
 * @returns {{base:Object, flag:Object, news:Object}} The board.
 */
function rollBoard(loc) {
  var a = AREAS[loc],
    b = { base: {}, flag: {}, news: {} };
  GOODS.forEach(function (g) {
    var p = rnd(g.lo, g.hi) * a.b[g.id],
      r = pick();
    if (r < 0.1) {
      p *= 2.2;
      b.flag[g.id] = 1;
    } else if (r < 0.2) {
      p *= 0.4;
      b.flag[g.id] = -1;
    }
    if (b.flag[g.id]) b.news[g.id] = newsPick(b.flag[g.id]);
    b.base[g.id] = p;
  });
  return b;
}

/**
 * SETS TODAY'S PRICES for the current district. Called on a new year,
 * travel, jail release, a new heir and the dev "reroll".
 * Uses this year's tip-off board for the district if you bought one (then
 * uses it up), otherwise rolls a fresh board. Tip-offs from earlier years
 * are cleared. Then, per drug:
 *   S.base   = the board price with NO fatigue
 *   S.prices = base * market fatigue, at least £1, whole pounds
 * @returns {void}
 */
function roll() {
  var t = tipFor(S.loc),
    b = t || rollBoard(S.loc);
  S.pre = S.pre || {};
  Object.keys(S.pre).forEach(function (k) {
    if (+k === S.loc || S.pre[k].d !== S.day) delete S.pre[k];
  });
  delete S.mk; /* mk = the pre-0.53 per-visit guard, replaced by base */
  S.base = b.base;
  S.flag = b.flag;
  S.news = b.news || {};
  S.prices = {};
  GOODS.forEach(function (g) {
    S.prices[g.id] = Math.max(1, Math.round(b.base[g.id] * fatOf(S.loc, g.id)));
  });
}

/**
 * Adds a line to the top of the history log, stamped with the current age.
 * The log keeps only the newest 300 lines (slice) to bound save size.
 * @param {string} t - Message.
 * @returns {void}
 */
function say(t) {
  S.log.unshift('Age ' + age() + ': ' + t);
  S.log = S.log.slice(0, 300);
}
