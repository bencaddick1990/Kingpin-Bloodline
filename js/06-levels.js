/* Kingpin: Bloodline  |  js/06-levels.js
 * Levels, XP, the yearly XP ledger and unlock lists.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 13: LEVELS, XP & UNLOCKS  ==================================
 * ============================================================================
 * ========================================================================== */

/**
 * Title for a level number.
 * @param {number} l - Level 1..20.
 * @returns {string} e.g. 1 -> "Street Kid", 20 -> "Kingpin"; '' if out of range.
 */
function lvlName(l) {
  return LVLN[l - 1] || '';
}

/**
 * Current player level from total XP.
 * LOGIC: walk the XPT thresholds; every threshold the player's XP has
 * reached bumps the level to (index + 1). Because XPT is ascending, the last
 * threshold reached wins.
 * @returns {number} Level 1..20.
 */
function lvl() {
  var x = S.xp || 0,
    l = 1;
  XPT.forEach(function (t, i) {
    if (x >= t) l = i + 1;
  });
  return l;
}

/**
 * Drugs the player may trade right now (level gate).
 * @returns {Object[]} Subset of GOODS where g.u <= current level.
 */
function ug() {
  return GOODS.filter(function (g) {
    return g.u <= lvl();
  });
}

/**
 * Lists everything that unlocks at exactly level `l` (drugs, properties,
 * bribes, guns, bags). Used by the level-up popup and the How-To-Play table.
 * @param {number} l - Level to inspect.
 * @returns {string[]} Display names (empty if nothing unlocks).
 */
function unlocksAt(l) {
  var t = [];
  GOODS.forEach(function (g) {
    if (g.u === l) t.push(g.n);
  });
  PROPS.forEach(function (p) {
    if (p.u === l) t.push(p.n);
  });
  PROT.forEach(function (p) {
    if (p.u === l) t.push(p.n + ' (bribe)');
  });
  GUNS.forEach(function (p) {
    if (p.u === l) t.push(p.n);
  });
  BAGS.forEach(function (p) {
    if (p.u === l) t.push(p.n + ' (bag)');
  });
  return t;
}

/**
 * Builds the HTML reference table "what unlocks at each level" (1..20).
 * @returns {string} HTML paragraphs, one per level.
 */
function levelList() {
  var h = '<p class="lead"><b>Level unlocks.</b> Everything you unlock at each level:</p>';
  for (var l = 1; l <= XPT.length; l++) {
    var u = unlocksAt(l);
    h +=
      '<p class="lead" style="font-size:14px;margin-bottom:6px"><b>Level ' +
      l +
      ' \u00b7 ' +
      lvlName(l) +
      ':</b> ' +
      (u.length ? u.join(', ') : 'Nothing new') +
      '</p>';
  }
  return h;
}

/**
 * Shows a simple one-button "OK" popup.
 * @param {string} t - Title.
 * @param {string} d - Body text (may contain simple HTML like <br>).
 * @returns {void}
 */
function note(t, d) {
  ask(t, d, [{ l: 'OK', fn: function () {} }]);
}

/**
 * YEARLY XP LEDGER (YP). XP is earned on REALISED PROFIT, not on cash flow:
 *   p = sum of sale MARGINS this year: for every sale, money received minus
 *       what those exact units cost you (their average cost basis). Losing
 *       sales are negative. Buying stock or ingredients does NOT touch the
 *       ledger, because the cost is charged when the units are sold.
 *   l = LOSSES this year: anything taken from you, valued at what it cost you
 *       (stock and lab batches at cost basis, cash at face value). See xpLoss.
 *   c = shortfall CARRIED from earlier years (a year whose losses beat its
 *       profit hands the rest on, so a loss can never be dodged by timing).
 *   v = ledger format (2). An older save's cash-flow tracker {i,o} cannot be
 *       converted (it never recorded what unsold stock cost), so it is
 *       replaced by an empty ledger once, the first time it is read.
 * @returns {{p:number,l:number,c:number,v:number}} The live ledger.
 */
function yp() {
  if (!S.yp || S.yp.v !== 2) S.yp = { p: 0, l: 0, c: 0, v: 2 };
  return S.yp;
}

/**
 * Books a LOSS against this year's XP ledger. Called by every way stock,
 * batches or cash can be taken: muggings and burglaries, stop and search
 * (stock and fine), stock ditched while running from police, confiscation on
 * arrest, crew busts, raid seizures, the FBI fine, and eviction. Guns, labs
 * and equipment are not trading stock, so they are never booked here.
 * @param {number} v - Value lost in pounds (cost basis for goods, face value for cash).
 * @returns {void}
 */
function xpLoss(v) {
  if (v > 0) yp().l += v;
}

/**
 * Converts this year's ledger into XP, then opens a new ledger.
 * Called at every year turn and when jailed (before the time jump).
 * MATH (step by step):
 *   1. net     = margins - losses - carried shortfall.
 *   2. cost    = XPD * level^XPK   -> "profit needed per XP" grows with level
 *                (XPD=1.2649, XPK=1.965), so high levels need far more profit.
 *   3. XP      = floor( sqrt(net) / cost )
 *                The square root makes XP grow slowly with profit (diminishing
 *                returns): 4x the profit only gives 2x the XP.
 *   4. +1e-9   guards against floating-point error (e.g. 24.99999999 instead
 *                of 25 would otherwise floor down by one).
 *   5. If net <= 0 no XP is paid and -net is CARRIED into next year's ledger
 *      (c). WHY: XP is a square root, so splitting gains and losses into
 *      separate years would otherwise pay more XP than the same trades in one
 *      year (a loss year simply "disappeared" at zero). Carrying the shortfall
 *      makes every pound lost count exactly once, whenever it happens. It also
 *      catches losses booked after the year-turn XP payout (e.g. a night-time
 *      robbery or a year-end arrest), which land in the following year.
 * EXAMPLE: level 1, net 1,000 -> sqrt = 31.62 / 1.2649 = 25.0 XP.
 * @returns {void}
 */
function yearXp() {
  var p = yp(),
    net = p.p - p.l - p.c;
  if (!p.p && !p.l && !p.c) return;
  /* Plain-English breakdown, only listing parts that are non-zero. */
  var why =
    gbp(p.p) +
    ' made on sales' +
    (p.l ? ', minus ' + gbp(p.l) + ' taken in thefts, police action and raids' : '') +
    (p.c ? ', minus ' + gbp(p.c) + ' carried over from earlier losses' : '');
  var x = net > 0 ? Math.floor(Math.sqrt(net) / (XPD * Math.pow(lvl(), XPK)) + 1e-9) : 0;
  S.yp = { p: 0, l: 0, c: net < 0 ? -net : 0, v: 2 }; /* new ledger; a shortfall rolls forward */
  if (x > 0) {
    say('Trading profit this year: ' + why + ' = ' + gbp(net) + '. That earned you ' + x + ' XP.');
    gainXp(x);
  } else if (net > 0)
    say(
      'Trading profit this year: ' +
        why +
        ' = ' +
        gbp(net) +
        '. Not quite enough for 1 XP at this level.',
    );
  else
    say(
      'No trading profit this year (' +
        why +
        '), so no XP.' +
        (net < 0 ? ' The ' + gbp(-net) + ' shortfall carries into next year.' : ''),
    );
}

/**
 * Adds XP and shows a popup listing new unlocks if a level was gained
 * (possibly several levels at once, e.g. via dev tools).
 * @param {number} n - XP to add.
 * @returns {void}
 */
function gainXp(n) {
  var a = lvl();
  S.xp = (S.xp || 0) + n;
  var b = lvl();
  if (b > a) {
    sfx('level');
    var t = [];
    for (var l = a + 1; l <= b; l++) t = t.concat(unlocksAt(l));
    note(
      'Level ' + b + ': ' + lvlName(b),
      t.length
        ? 'Unlocked: ' + t.join(', ') + '.'
        : 'Nothing new this level, but you\u2019re getting well known.',
    );
  }
}

/**
 * HUD card showing the current level and a progress bar to the next level.
 * MATH: progress % = (xp - startOfLevel) / (nextLevelStart - startOfLevel) * 100.
 * @returns {string} HTML.
 */
function levelChip() {
  var l = lvl(),
    x = S.xp || 0,
    a = XPT[l - 1],
    b = XPT[l];
  return (
    '<div class="card" style="padding:8px 12px"><b>Level ' +
    l +
    ' \u00b7 ' +
    lvlName(l) +
    '</b> <span class="log">' +
    (b === undefined ? 'Max level' : x - a + ' / ' + (b - a) + ' XP') +
    '</span>' +
    (b === undefined ? '' : bar(((x - a) / (b - a)) * 100, 'var(--ok)')) +
    '</div>'
  );
}
