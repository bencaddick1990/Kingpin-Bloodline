/* Kingpin: Bloodline  |  js/17-police.js
 * Police heat, raid tiers and police bribes.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 27: POLICE HEAT & RAIDS  ===================================
 * ============================================================================
 * ========================================================================== */

/**
 * Converts a heat percentage into a police-action TIER 0..5.
 * Thresholds: <5 nothing, <16 stop & search, <31 pulled over, <56 sting,
 * <90 police raid, otherwise FBI raid.
 * @param {number} h - Heat percent.
 * @returns {number} Tier 0..5.
 */
function heatBand(h) {
  return h < 5 ? 0 : h < 16 ? 1 : h < 31 ? 2 : h < 56 ? 3 : h < 90 ? 4 : 5;
}

/**
 * HEAT = the chance (in %) police act against you this year. Components:
 *   stock : if carrying anything: 4 + 10 * (carried/capacity)
 *           + min(20, stockValue/2000). So a baseline 4, up to +10 for full
 *           pockets, up to +20 when carrying £40,000+ of stock.
 *   bed   : (only when `full`) tonight's arrest chance as a percent
 *           (arr*100), x1.6 if carrying stock, x0.3 if clean. Sleeping rough
 *           (arr=0.16) is therefore far worse than a Safehouse.
 *   cook  : (only when `full`) EVERY property with a lab adds its own term.
 *           With n drugs cooking at one property the term is
 *           (2n + n*(n-1)) * 1.5 = n*(n+1)*1.5, which grows faster than
 *           linearly (1 drug = 3, 2 = 9, 3 = 18, 5 = 45), scaled by THAT
 *           property's district heat. Terms from different labs simply add up.
 *   Combine: ((stock + bed) * districtHeat + cook) * (1 - bribeCut).
 *   Then clamp to 1..100 and round to one decimal (x10, round, /10).
 * @param {number} [k] - Hypothetical number of drugs cooking at the property HERE (default: actual).
 * @param {boolean} [full] - Include the sleeping and lab terms.
 * @returns {number} Heat percent 1..100.
 */
function heat(k, full) {
  var cut = S.bribe ? PROT[S.bribe.l].cut : 0,
    hl = AREAS[S.loc].heat,
    c = carried(),
    stock = c > 0 ? 4 + (10 * c) / cap() + Math.min(20, worth() / 2000) : 0,
    bed = 0,
    cook = 0;
  if (full) {
    bed = tonight().arr * 100 * (c > 0 ? 1.6 : 0.3);
    var here = P();
    (S.props || []).forEach(function (p) {
      if (!p.lab) return;
      var n = p === here && k !== undefined ? k : cooks(p);
      cook += (2 * n + n * (n - 1)) * 1.5 * AREAS[p.loc].heat;
    });
  }
  return Math.round(Math.max(1, Math.min(100, ((stock + bed) * hl + cook) * (1 - cut))) * 10) / 10;
}

/**
 * Heat including bed and lab, optionally for a hypothetical cook count
 * (the Lab tab uses this to preview "one more drug would make it X%").
 * @param {number} [k] - Hypothetical drugs cooking.
 * @returns {number} Heat percent.
 */
function raidPct(k) {
  return heat(k, true);
}

/**
 * TIER 1: stop and search. Clean = nothing happens. Otherwise police take
 * ceil(30%) of every drug stack and fine 3% of pocket cash. The stock (at
 * cost basis) and the fine are both booked as XP losses.
 * @returns {void}
 */
function searched() {
  var c = carried();
  if (c < 1) {
    say('Police stopped and searched you. You were clean.');
    return;
  }
  var fine = Math.round(S.cash * 0.03),
    tk = [];
  xpLoss(fine);
  GOODS.forEach(function (g) {
    var t = Math.ceil(S.inv[g.id] * 0.3);
    if (t > 0) {
      tk.push(t + ' ' + g.n);
      xpLoss(t * S.paid[g.id]);
    }
    S.inv[g.id] -= t;
    if (!S.inv[g.id]) S.paid[g.id] = 0;
  });
  S.cash -= fine;
  say('Stopped and searched. They took ' + tk.join(', ') + ' and fined you ' + gbp(fine) + '.');
  note('Stopped and searched', 'They took ' + tk.join(', ') + ' and fined you ' + gbp(fine) + '.');
}

/**
 * TIER 2: pulled over. Clean = waved on. Carrying stock = arrest popup
 * (with Run available).
 * @returns {void}
 */
function stopped() {
  if (carried() < 1) {
    say('Pulled over and searched. They found nothing and moved you on.');
    return;
  }
  arrest(false, 0, 'Pulled over', 'Officers stop you and want to search your things.');
}

/**
 * Seizes every RUNNING lab batch at one property (batches already finished and
 * "waiting" for room are not touched). Each seized batch is booked as an XP
 * loss at its ingredient cost (crew batches include the 15% fee).
 * @param {Object|null} p - The property being raided.
 * @returns {number} How many batches were seized.
 */
function seize(p) {
  var n = 0;
  if (p && p.batch)
    Object.keys(p.batch).forEach(function (id) {
      var b = p.batch[id];
      if (!b.w) {
        xpLoss(b.n * b.u);
        delete p.batch[id];
        n++;
      }
    });
  return n;
}

/**
 * Chooses which property a raid hits: the one with the MOST batches cooking
 * (the biggest heat source; the first one wins a tie). With nothing cooking
 * anywhere it falls back to the property you are standing at, if any.
 * @returns {Object|null} A property, or null if you own none.
 */
function raidTarget() {
  var best = null,
    bn = 0;
  (S.props || []).forEach(function (p) {
    var n = cooks(p);
    if (n > bn) {
      best = p;
      bn = n;
    }
  });
  return best || P();
}

/**
 * Dispatches a heat tier to its police action.
 * @param {number} t - Tier 1..5 (0 does nothing).
 * @returns {void}
 */
function runTier(t) {
  if (t >= 1) {
    sfx('siren');
    vib([200, 100, 200]);
  }
  if (t === 1) searched();
  else if (t === 2) stopped();
  else if (t === 3) sting();
  else if (t === 4) policeRaid();
  else if (t >= 5) fbi();
}

/**
 * TIER 3: undercover sting. A "buyer" is a cop; arrest only if you carry stock.
 * @returns {void}
 */
function sting() {
  if (carried() < 1) {
    say('A buyer turned out to be an undercover officer, but you had nothing on you.');
    return;
  }
  say('Undercover sting! The “buyer” was a police officer.');
  arrest();
}

/**
 * TIER 4: police raid on the raid target property (see raidTarget). Seizes its
 * running batches. You are arrested (NO running) if you carry stock OR you are
 * standing at the raided property after losing batches.
 * @returns {void}
 */
function policeRaid() {
  var p = raidTarget(),
    n = seize(p),
    w = p ? ' at your ' + PROPS[p.i].n.toLowerCase() + ' in ' + AREAS[p.loc].n : '';
  note(
    'Police raid!',
    n
      ? 'They seized ' + n + ' running batch' + (n > 1 ? 'es' : '') + w + '.'
      : 'They searched the place' + w + ' and found nothing running.',
  );
  if (carried() > 0 || (n && p && S.loc === p.loc)) arrest(true);
}

/**
 * TIER 5: FBI raid on the raid target property. Seizes its batches, DESTROYS
 * its lab and equipment, fines 25% of cash (booked as an XP loss), and
 * arrests you with +3 extra years and no escape. Your other properties keep
 * their labs.
 * @returns {void}
 */
function fbi() {
  var p = raidTarget(),
    n = seize(p),
    fine = Math.round(S.cash * 0.25),
    lab = p && p.lab;
  S.cash -= fine;
  xpLoss(fine);
  if (p) {
    p.lab = false;
    p.eq = {};
  }
  note(
    'FBI raid!',
    (p ? 'They hit your ' + PROPS[p.i].n.toLowerCase() + ' in ' + AREAS[p.loc].n + '. ' : '') +
      (n ? 'They seized ' + n + ' batch' + (n > 1 ? 'es' : '') + ', ' : '') +
      (lab ? 'wrecked your lab and equipment, ' : '') +
      'and fined you ' +
      gbp(fine) +
      '.',
  );
  arrest(true, 3);
}

/**
 * Yearly police check (run in sleep()). Rolls once against the full heat
 * (bed and lab included); a hit fires that heat band's action. Then ticks
 * down any active bribe by one year and removes it when it expires.
 * @param {boolean} skip - True to skip the police roll (a robbery already happened).
 * @returns {void}
 */
function raid(skip) {
  var h = heat(undefined, true);
  if (!skip && h >= 5 && pick() * 100 < h) runTier(heatBand(h));
  if (S.bribe) {
    S.bribe.y--;
    if (S.bribe.y <= 0) {
      S.bribe = null;
      say('Your police protection has run out.');
    }
  }
}

/* ============================================================================
 * ============================================================================
 * ======  SECTION 28: POLICE BRIBES  =========================================
 * ============================================================================
 * ========================================================================== */

/**
 * Builds the Police bribes card. A tier is disabled if you can't afford it,
 * its level isn't unlocked, or you already hold a STRONGER one (b.l > i).
 * @returns {string} HTML.
 */
function bribeView() {
  var b = S.bribe;
  return (
    '<div class="card"><h2>Police bribes</h2><p class="log">' +
    (b
      ? 'Protected by ' +
        PROT[b.l].n.toLowerCase() +
        ' for ' +
        b.y +
        ' more year' +
        (b.y > 1 ? 's' : '') +
        '.'
      : 'No protection. A bribe lowers your heat for a few years, so fewer stops, arrests and raids.') +
    '</p>' +
    PROT.map(function (x, i) {
      var off = S.cash < x.c || (b && b.l > i) || lvl() < x.u ? ' disabled' : '';
      return (
        '<div class="row"><div class="nm"><b>' +
        x.n +
        ' · ' +
        gbp(x.c) +
        '</b><small>' +
        (lvl() < x.u
          ? 'Unlocks at level ' + x.u
          : (x.cut >= 1 ? 'No police trouble' : 'Heat down ' + Math.round(x.cut * 100) + '%') +
            ' for ' +
            x.y +
            ' years') +
        '</small></div><button onclick="bribe(' +
        i +
        ')"' +
        off +
        '>Pay</button></div>'
      );
    }).join('') +
    '</div>'
  );
}

/**
 * Pays a bribe: replaces any weaker (or equal) protection and sets its
 * duration in years. Guards repeat the button's disabled rules.
 * @param {number} i - PROT index.
 * @returns {void}
 */
function bribe(i) {
  var x = PROT[i];
  if (S.cash < x.c || lvl() < x.u || (S.bribe && S.bribe.l > i)) return;
  S.cash -= x.c;
  S.bribe = { l: i, y: x.y };
  sfx('buy');
  say('You paid off the ' + x.n.toLowerCase() + '. Protection for ' + x.y + ' years.');
  render();
}
