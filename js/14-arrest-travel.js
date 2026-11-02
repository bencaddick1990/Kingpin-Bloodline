/* Kingpin: Bloodline  |  js/14-arrest-travel.js
 * Arrests, jail sentences and travelling between districts.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 24: ARREST, JAIL & TRAVEL  =================================
 * ============================================================================
 * ========================================================================== */

/**
 * Base prison years from the value of the stock you carry.
 * MATH: nothing carried (v<1) = 1 year; otherwise 1 + one extra year per
 * £1,000 of stock (floor), limited to 1..8.
 * @param {number} v - Street value of carried stock in pounds.
 * @returns {number} Years 1..8.
 */
function jailDays(v) {
  return v < 1 ? 1 : clamp(1 + Math.floor(v / 1000), 1, 8);
}

/**
 * Raises the ARREST popup with up to four options.
 * SENTENCE ESTIMATE: days = min(10, base years + `ex` (extra years, e.g. +3
 * for an FBI raid) + best-gun years). The actual sentence is recomputed in
 * jail(), so this is a preview.
 * ODDS USED:
 *   Run   (hidden if noRun): 45% escape. Success: you drop HALF your stock
 *         (the half that is "ceil" is dropped, "floor" is kept, and the
 *         dropped half is booked as an XP loss at cost) and lose 10 fed.
 *   Fight : win = min(0.85, 0.35 + gun bonus). Win: -10 health, keep stock.
 *           Lose: -20 health, then jail.
 *   Give up: certain jail, but `ex - 1` so the sentence is one year shorter.
 *   Bribe : costs max(£100, 30% of cash). Success chance bp = 0.20 for FBI
 *           level (ex >= 3), 0.40 when you can't run (raids), else 0.75.
 *           Disabled if you can't afford it. Failure = jail.
 * @param {boolean} noRun - True to remove the Run option (raids).
 * @param {number} [ex=0] - Extra sentence years.
 * @param {string} [title] - Popup title.
 * @param {string} [desc] - Extra description sentence.
 * @returns {void}
 */
function arrest(noRun, ex, title, desc) {
  ex = ex || 0;
  var v = Math.round(worth()),
    days = Math.min(10, jailDays(v) + ex + gunY()),
    c = [],
    bribe = Math.max(100, Math.round(S.cash * 0.3)),
    bp = ex >= 3 ? 0.2 : noRun ? 0.4 : 0.75,
    fp = Math.min(0.85, 0.35 + gunB()),
    y1 = Math.max(1, days - 1);
  if (!noRun)
    c.push({
      l: 'Run',
      s: 'Escape odds 45%. You drop half your stock to get clear. Fail and you\u2019re jailed.',
      fn: function () {
        if (pick() < 0.45) {
          var dt = [];
          GOODS.forEach(function (g) {
            var h = Math.ceil(S.inv[g.id] / 2);
            if (h > 0) {
              dt.push(h + ' ' + g.n);
              xpLoss(h * S.paid[g.id]);
            }
            S.inv[g.id] = Math.floor(S.inv[g.id] / 2);
          });
          S.food = clamp(S.food - 10, 0, 100);
          sfx('good');
          achHit('getaway');
          say('You ditched ' + dt.join(', ') + ' to get clear.');
          note('You got away', 'You ditched ' + dt.join(', ') + ' and got clear.');
        } else {
          say('They caught you.');
          jail(v, ex);
        }
      },
    });
  c.push({
    l: 'Fight',
    s: 'Win odds ' + pc(fp) + '. Win and you keep your stock. Lose and you\u2019re jailed.',
    k: 'danger',
    fn: function () {
      if (pick() < fp) {
        hurt(10, 'a fight with police');
        sfx('good');
        achHit('getaway');
        note('You fought your way free', 'You kept your stock but lost 10 health.');
      } else {
        S.hp -= 20;
        say('You lost the fight.');
        jail(v, ex);
      }
    },
  });
  c.push({
    l: 'Give up',
    s:
      'Certain jail, but only about ' +
      y1 +
      ' year' +
      (y1 > 1 ? 's' : '') +
      '. A year less than losing.',
    fn: function () {
      say('You gave yourself up.');
      jail(v, ex - 1);
    },
  });
  c.push({
    l: 'Bribe ' + gbp(bribe),
    s: 'Success odds ' + pc(bp) + '. Fail and you\u2019re jailed.',
    d: S.cash < bribe,
    fn: function () {
      if (S.cash >= bribe && pick() < bp) {
        S.cash -= bribe;
        sfx('good');
        achHit('getaway');
        note('The bribe worked', 'You paid ' + gbp(bribe) + ' and walked away.');
      } else {
        say('The bribe was refused.');
        jail(v, ex);
      }
    },
  });
  sfx('siren');
  vib([200, 100, 200]);
  ask(
    title || 'You\u2019re under arrest',
    (desc ? desc + ' ' : '') +
      (v
        ? 'You\u2019re carrying about ' +
          gbp(v) +
          ' of stock, which means roughly ' +
          days +
          ' year' +
          (days > 1 ? 's' : '') +
          ' inside.'
        : 'You\u2019re clean, so it should only be about a year in the cells.'),
    c,
  );
}

/**
 * SENTENCES the player. Time passes as a block of years.
 * STEPS:
 *  1. Sentence d = clamp(base + x + gun years, 1, 10).
 *  2. List confiscated stock and its value; book its COST as an XP loss.
 *  3. Convert this year's ledger into XP (yearXp) before time jumps, so the
 *     confiscation counts in the year it happened. Update arrest stats.
 *  4. Confiscate ALL guns and ALL pocket stock/average prices (the safe is
 *     untouched: that is its purpose). Evictions while inside book their
 *     losses into the next year's ledger.
 *  5. For each year inside: pay upkeep on every property via payUp (pocket
 *     first, then bank), totalling each source for the log; if neither can
 *     cover it the property is evicted (it leaves S.props, so later years skip it).
 *  6. Fast-forward the calendar: day += d (limited to DAYS+1 = life over),
 *     finish lab batches without moving them to pockets (finishBatches(false)),
 *     restore health to 100 and fed to 70, cool markets d years, new prices.
 *  7. Log and popup; if the calendar ran past the last year, show the death
 *     screen ("died of old age").
 * @param {number} v - Value of stock carried at arrest (for the sentence).
 * @param {number} x - Extra sentence years (can be -1 for "give up").
 * @returns {void}
 */
function jail(v, x) {
  var gi = gunI(),
    gy = gunY(),
    d = clamp(jailDays(v) + x + gy, 1, 10),
    up = { c: 0, b: 0 },
    lost = [],
    lv = 0;
  GOODS.forEach(function (g) {
    var n = S.inv[g.id];
    if (n) {
      lost.push(n + ' ' + g.n);
      lv += n * S.prices[g.id];
      xpLoss(n * S.paid[g.id]);
    }
  });
  sfx('bad');
  yearXp();
  stat().arr++;
  stat().jail += d;
  S.guns = [];
  GOODS.forEach(function (g) {
    S.inv[g.id] = 0;
    S.paid[g.id] = 0;
  });
  var evt = '';
  for (var i = 0; i < d; i++) {
    (S.props || []).slice().forEach(function (p) {
      var r = payUp(PROPS[p.i].up);
      if (r) {
        up.c += r.c;
        up.b += r.b;
      } else evt += (evt ? ' ' : '') + evict(p, true);
    });
  }
  S.day = Math.min(S.day + d, DAYS + 1);
  finishBatches(false);
  S.hp = 100;
  S.food = 70;
  coolMarkets(d);
  roll();
  var cl = up.c + up.b,
    lt =
      (lost.length
        ? 'Confiscated: ' + lost.join(', ') + ' (about ' + gbp(lv) + ')'
        : 'You had no stock on you') +
      (cl > 0
        ? '. You also paid ' + gbp(cl) + ' in property upkeep while inside (' + upSrc(up) + ')'
        : '');
  say('Sentenced to ' + d + ' year' + (d > 1 ? 's' : '') + '. ' + lt + '.');
  note(
    'Sentenced to ' + d + ' year' + (d > 1 ? 's' : ''),
    lt +
      (gi >= 0
        ? ' and the ' +
          GUNS[gi].n.toLowerCase() +
          ' found on you added ' +
          gy +
          ' year' +
          (gy > 1 ? 's' : '') +
          ' to the sentence'
        : '') +
      '. You come out with full health and 70 fed.' +
      (evt ? ' ' + evt : ''),
  );
  if (S.day > DAYS && S.hp > 0) S.view = 'over';
}

/**
 * TRAVELS to another district.
 * FLOW: pay the fare (or walk if you can't afford it) -> move + lose 10 fed
 * (WALK_FED when walking) -> new local prices (a tip-off board if you bought
 * one, see 26-intel.js) -> jump to Trade tab -> log.
 * Then two dice rolls:
 *  1. POLICE: only if you carry stock AND heat is at least 5%. `pick()*100 < heat`
 *     turns the heat percentage into a probability (heat 20% = 20% chance).
 *     The police action tier is chosen from the heat band (see heatBand).
 *     If that opened a popup, stop here (so a mugging doesn't stack on top).
 *  2. MUGGER: flat 10% chance of a robbery popup taking 20-40% of cash.
 * Heat here is computed WITHOUT the bed/lab terms (heat() with no `full`)
 * because you're travelling, not sleeping.
 * @param {number} i - AREAS index to move to.
 * @returns {void}
 */
function travel(i) {
  if (i === S.loc) return;
  var f = fare(),
    walk = S.cash < f,
    a = AREAS[i];
  if (!walk) S.cash -= f;
  S.loc = i;
  S.food = clamp(S.food - (walk ? WALK_FED : 10), 0, 100);
  roll();
  S.tab = 'trade';
  sfx('travel');
  say(
    walk
      ? 'You couldn\u2019t afford the fare, so you walked to ' + a.n + '.'
      : 'You paid ' + gbp(f) + ' to get to ' + a.n + '.',
  );
  var th = heat(),
    hit = carried() > 0 && th >= 5 && pick() * 100 < th;
  if (hit) {
    runTier(heatBand(th));
    if (S.ev) return;
  }
  if (pick() < 0.1) {
    robbery(rnd(0.2, 0.4), 'Mugger', 'Someone steps out of a doorway with a hand in their pocket.');
    return;
  }
  render();
}
