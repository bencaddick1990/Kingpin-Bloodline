/* Kingpin: Bloodline  |  js/15-heirs-property.js
 * Inheritance, property buying/selling and eviction.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 25: HEIRS, PROPERTY & EVICTION  ============================
 * ============================================================================
 * ========================================================================== */

/**
 * Creates the NEXT GENERATION after a death. Replaces S entirely.
 * INHERITANCE RULES:
 *  - Stock: take the most valuable drugs first (sort by current price,
 *    descending), half of each stack (rounded UP) until the heir's pockets
 *    (`left` = cap()) are full. Average prices travel with the stock (and
 *    safes keep their sp), so the heir's XP counts only the MARGIN on
 *    inherited stock, not its full sale value.
 *  - Cash and bank: floor(half) of each.
 *  - Kept as-is: property, bag, XP/level, generation +1 etc., family surname,
 *    relatives (nextFam), life record appended to the family line.
 *  - Property safe stock: halved (rounded up) in place.
 *  - NOT carried over: guns (reset to none), bribes, market fatigue, casino
 *    plays, yearly XP ledger and any carried shortfall, lifetime stats (reset).
 * The heir starts at day 1 with 100 health and 70 fed, a new random name
 * (temporary until confirmHeir) and a face from heirLook(). View becomes
 * 'heirname'. The new log starts with ONE inheritance entry (heirLog): it is
 * written first, so it is both the earliest and the top entry of the new run.
 * @param {string} sx - 'Son' or 'Daughter'.
 * @returns {void}
 */
function heir(sx) {
  var st = {},
    pd = {},
    left = cap();
  GOODS.slice()
    .sort(function (a, b) {
      return S.prices[b.id] - S.prices[a.id];
    })
    .forEach(function (g) {
      var n = Math.min(Math.ceil(S.inv[g.id] / 2), left);
      st[g.id] = n;
      pd[g.id] = n ? S.paid[g.id] : 0;
      left -= n;
    });
  var c = Math.floor(S.cash / 2),
    bk2 = Math.floor(bk() / 2);
  Q = [];
  S = {
    day: 1,
    gen: S.gen + 1,
    bank: bk2,
    xp: S.xp || 0,
    guns: [],
    bag: S.bag,
    name: pickName(sx === 'Son' ? 'M' : 'F'),
    sn: S.sn,
    fam: nextFam(),
    line: (S.line || []).concat([lifeRec()]),
    st: { sold: 0, jail: 0, arr: 0, rob: 0, peak: 0 },
    sex: sx,
    gender: sx === 'Son' ? 'M' : 'F',
    look: heirLook(S.look, sx === 'Son' ? 'M' : 'F'),
    cash: c,
    hp: 100,
    food: 70,
    loc: S.loc,
    inv: st,
    paid: pd,
    props: S.props || [],
    tab: 'trade',
    view: 'day',
    ev: null,
    log: [],
    prices: S.prices,
    flag: S.flag,
  };
  (S.props || []).forEach(function (p) {
    if (p.safe)
      Object.keys(p.safe).forEach(function (k) {
        p.safe[k] = Math.ceil(p.safe[k] / 2);
      });
  });
  say(heirLog(sx, c, bk2));
  S.view = 'heirname';
  S.n0 = S.name;
  S.named = false;
  roll();
  render();
}

/**
 * Builds the INHERITANCE log entry for a new heir, read from the NEW state S
 * (so it must run after heir() has built S and halved the safes). Lists who
 * takes over and the traits they kept, cash in pocket and in the bank, every
 * property with its district, each safe's (halved) stock, and the stock the
 * heir carries. The heir's full name is included so confirmHeir() can swap it
 * if the player renames them.
 * @param {string} sx - 'Son' or 'Daughter'.
 * @param {number} c - Cash inherited into the pocket.
 * @param {number} b - Money inherited into the bank.
 * @returns {string} The log text.
 */
function heirLog(sx, c, b) {
  /* "3 Weed, 2 Cocaine" from any {id:qty} map, skipping empty stacks. */
  var list = function (o) {
    return GOODS.filter(function (g) {
      return (o || {})[g.id] > 0;
    })
      .map(function (g) {
        return o[g.id] + ' ' + g.n;
      })
      .join(', ');
  };
  var ps = (S.props || []).map(function (p) {
      var sf = list(p.safe);
      return (
        PROPS[p.i].n + ' in ' + AREAS[p.loc].n + (sf ? ' (safe: ' + sf + ')' : ' (safe empty)')
      );
    }),
    pk = list(S.inv),
    n = GOODS.reduce(function (t, g) {
      return t + (S.inv[g.id] || 0);
    }, 0);
  return (
    'Inheritance: ' +
    S.name +
    ' ' +
    S.sn +
    ', your ' +
    sx.toLowerCase() +
    ', takes over at 18 with their parent\u2019s ' +
    KEPT.join(' and ').toLowerCase() +
    '. ' +
    'Money: ' +
    gbp(c) +
    ' cash and ' +
    gbp(b) +
    ' in the bank. ' +
    'Properties: ' +
    (ps.length ? ps.join('; ') : 'none') +
    '. ' +
    'Drugs carried: ' +
    (pk ? pk + ' (' + n + ' units)' : 'none') +
    '.'
  );
}

/**
 * Where you sleep tonight, and its risks.
 * RULE: only if you own a property IN THE CURRENT DISTRICT do you sleep in it
 * (safe, no cold). Anywhere else you sleep rough (ROUGH). Each district's
 * property is its own bed.
 * @returns {{n:string,rob:number,arr:number,cold:number}} Bed description.
 */
function tonight() {
  var p = P();
  if (p) {
    var d = PROPS[p.i];
    return { n: 'your ' + d.n.toLowerCase(), rob: d.rob, arr: d.arr, cold: 0 };
  }
  return ROUGH;
}

/**
 * Buys a property in the district you are standing in (also used to trade UP
 * from the property already here). One property per district: blocked() refuses
 * the tier you already own, and setP() replaces rather than adds when you trade.
 * TRADE-UP MATH: the old property here is credited at 80% of its price, so the
 * purchase needs cash + credit >= price; net cost = price - credit. The safe
 * (and its cost basis) moves with you; the lab, equipment and batches are LEFT
 * BEHIND (and lost) -- the UI warns about this. Properties in other districts
 * are never touched.
 * @param {number} i - PROPS index.
 * @returns {void}
 */
function buyProp(i) {
  var d = PROPS[i];
  if (blocked(i)) return;
  var old = P(),
    credit = old ? Math.round(PROPS[old.i].c * 0.8) : 0;
  if (S.cash + credit < d.c) return;
  S.cash += credit - d.c;
  var np = { i: i, loc: S.loc };
  if (old && old.safe) {
    np.safe = old.safe;
    np.sp = old.sp;
  }
  setP(np);
  sfx('buy');
  say('You bought a ' + d.n.toLowerCase() + ' in ' + AREAS[S.loc].n + '.');
  render();
}

/**
 * EVICTS the player from ONE property (unpaid upkeep): everything in that
 * property's safe, its running lab batches, and its lab are lost. Builds the
 * message, removes the property from S.props, stands down any crew assigned
 * there, logs it and returns the text so callers can also show it in a popup.
 * Your other properties are unaffected.
 * XP: the safe stock (at its cost basis) and every batch (at ingredient cost)
 * are booked as losses.
 * @param {Object} p - The property being lost.
 * @param {boolean} [jl] - True if it happened while the player was in jail.
 * @returns {string} The eviction message.
 */
function evict(p, jl) {
  var d = PROPS[p.i],
    l = [],
    v = 0,
    sf = p.safe || {},
    sp = p.sp || {},
    bt = p.batch || {},
    bl = [];
  GOODS.forEach(function (g) {
    var n = sf[g.id] || 0;
    if (n) {
      l.push(n + ' ' + g.n);
      v += n * S.prices[g.id];
      xpLoss(n * (sp[g.id] || 0));
    }
  });
  Object.keys(bt).forEach(function (k) {
    if (bt[k].n > 0) {
      bl.push(bt[k].n + ' ' + gd(k).n);
      xpLoss(bt[k].n * bt[k].u);
    }
  });
  var t =
    'You were evicted from your ' +
    d.n.toLowerCase() +
    ' in ' +
    AREAS[p.loc].n +
    ' for unpaid upkeep' +
    (jl ? ' while you were inside' : '') +
    '. ' +
    (l.length
      ? 'You lost everything in the safe: ' + l.join(', ') + ' (about ' + gbp(v) + ')'
      : 'The safe was empty') +
    (bl.length ? ', plus the batches cooking in your lab: ' + bl.join(', ') : '') +
    (p.lab ? ', and your lab and equipment' : '') +
    '.';
  S.props = S.props.filter(function (x) {
    return x !== p;
  });
  dropCrew(p.loc);
  say(t);
  return t;
}

/**
 * Sells the property HERE for 80% of its price (properties in other districts
 * are untouched). Refused if it is the Hostel (cannot be sold) or if its safe
 * holds stock / a batch is running. Crew assigned to it are stood down.
 * @returns {void}
 */
function sellProp() {
  var p = P();
  if (!p) return;
  var d = PROPS[p.i];
  if (locked(p) || p.i === 0) return;
  S.cash += Math.round(d.c * 0.8);
  S.props = S.props.filter(function (x) {
    return x !== p;
  });
  dropCrew(p.loc);
  sfx('sell');
  say('You sold the ' + d.n.toLowerCase() + ' in ' + AREAS[p.loc].n + '.');
  render();
}

/**
 * Whether the Buy button for property i must be disabled (rules beyond cash).
 * RULES (all about the property in THIS district; other districts never matter):
 * the tier you already own here is blocked ("Already owned"); level too low is
 * blocked; if you own one here, upgrading (i higher) is blocked while its
 * batches are running (they'd be lost) and buying anything else is blocked
 * while its safe or lab is in use (locked()).
 * @param {number} i - PROPS index.
 * @returns {boolean}
 */
function blocked(i) {
  var p = P();
  return owns(i) || lvl() < PROPS[i].u || (!!p && (i > p.i ? pend(p) > 0 : locked(p)));
}
