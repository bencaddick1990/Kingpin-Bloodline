/* Kingpin: Bloodline  |  js/16-year.js
 * The year turn: upkeep, sleep, hunger, raids, XP and death checks.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 26: THE YEAR TURN (CORE GAME LOOP)  ========================
 * ============================================================================
 * ========================================================================== */

/**
 * PAYS one property's yearly upkeep, choosing the source automatically.
 * ORDER OF PREFERENCE (keeps pocket cash for food/medicine where possible):
 *   1. Pocket covers it in full     -> all from pocket.
 *   2. Otherwise bank covers it     -> all from the bank.
 *   3. Otherwise pocket + bank do   -> empty the pocket, the bank pays the rest.
 *   4. Otherwise                    -> nothing is taken; returns null and the
 *                                      caller evicts.
 * @param {number} a - Upkeep amount due.
 * @returns {?{c:number,b:number}} Amount taken from pocket (c) and bank (b), or null if unaffordable.
 */
function payUp(a) {
  var c = 0,
    b = 0;
  if (S.cash >= a) c = a;
  else if (bk() >= a) b = a;
  else if (S.cash + bk() >= a) {
    c = Math.max(0, S.cash);
    b = a - c;
  } else return null;
  S.cash -= c;
  S.bank = bk() - b;
  return { c: c, b: b };
}

/**
 * Describes where an upkeep payment came from, for the log.
 * @param {{c:number,b:number}} r - Result of payUp (or a running total).
 * @returns {string} e.g. "from your pocket", "from the bank", or "£40 from your pocket and £460 from the bank".
 */
function upSrc(r) {
  return r.c && r.b
    ? gbp(r.c) + ' from your pocket and ' + gbp(r.b) + ' from the bank'
    : r.b
      ? 'from the bank'
      : 'from your pocket';
}

/**
 * "Let the year pass" button. Pays upkeep for EVERY property you own (each is
 * charged separately via payUp: pocket first, then the bank; one that pocket
 * and bank together can't cover is evicted while the others stay). Every
 * payment is logged with its amount and source. Then runs the night via sleep().
 * @returns {void}
 */
function endDay() {
  sfx('year');
  var ev = [];
  (S.props || []).slice().forEach(function (p) {
    var d = PROPS[p.i],
      r = payUp(d.up);
    if (r)
      say(
        'You paid ' +
          gbp(d.up) +
          ' in upkeep for your ' +
          d.n.toLowerCase() +
          ' in ' +
          AREAS[p.loc].n +
          ' (' +
          upSrc(r) +
          ').',
      );
    else ev.push(evict(p));
  });
  if (ev.length) {
    sfx('bad');
    note('Evicted', ev.join('<br>'));
  }
  sleep(tonight());
}

/**
 * RUNS ONE YEAR'S END. This is the main simulation step.
 * ORDER OF EVENTS:
 *  1. Burglary/robbery roll using the bed's `rob` chance (popup).
 *  2. Cold exposure (only when sleeping rough): 20% chance of losing b.cold health.
 *  3. Hunger: fed -30. At 0: health -15 (starvation). Otherwise, if fed is
 *     still 40+ AND you slept indoors (cold === 0), heal +10.
 *  4. Show one combined "Health lost" popup if anything hurt you.
 *  5. Calendar: day++. Police raid roll (skipped if a robbery just happened,
 *     so two bad things don't land in one turn).
 *  6. Lab batches finish (moved to pockets only when no popup is open).
 *  7. Markets cool one year, NEW PRICES, relatives do their jobs, yearly
 *     profit converts to XP (may level up).
 *  8. Log lines. DEATH CHECK: health <= 0 -> death screen; day past the last
 *     year -> death screen (old age). Then render.
 * @param {{n:string,rob:number,arr:number,cold:number}} b - Tonight's bed.
 * @returns {void}
 */
function sleep(b) {
  var msgs = [],
    hl = [],
    bad = false;
  if (pick() < b.rob) {
    bad = true;
    robbery(
      rnd(0.3, 0.6),
      'Robbed in the night',
      b.cold
        ? 'Someone found you sleeping rough and went through your things.'
        : 'Someone broke into your place while you slept.',
    );
  }

  if (b.cold && pick() < 0.2) {
    hurt(b.cold, 'exposure to the cold');
    hl.push([b.cold, 'the cold']);
    msgs.push('The cold got into your bones.');
  }
  S.food -= 30;
  if (S.food <= 0) {
    S.food = 0;
    hurt(15, 'starvation');
    hl.push([15, 'starvation']);
    msgs.push('Starving. Health took a hit.');
  } else if (S.food >= 40 && b.cold === 0) {
    S.hp = clamp(S.hp + 10, 0, 100);
  }
  if (hl.length) {
    var tot = hl.reduce(function (t, x) {
      return t + x[0];
    }, 0);
    note(
      'Health lost',
      'You lost ' +
        tot +
        ' health this year: ' +
        hl
          .map(function (x) {
            return x[0] + ' from ' + x[1];
          })
          .join(' and ') +
        '. You\u2019re on ' +
        Math.max(0, Math.round(S.hp)) +
        '.',
    );
  }
  S.day++;
  raid(bad);
  finishBatches(!S.ev);
  S.view = 'day';
  coolMarkets(1);
  roll();
  crewYear();
  yearXp();
  msgs.forEach(function (m) {
    if (m) say(m);
  });
  if (!msgs.filter(Boolean).length) say('A quiet year. Nothing went wrong.');
  if (S.hp <= 0) {
    S.hp = 0;
    S.view = 'over';
  } else if (S.day > DAYS) {
    S.view = 'over';
  }
  render();
}
