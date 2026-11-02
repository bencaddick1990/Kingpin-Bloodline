/* Kingpin: Bloodline  |  js/08-gear-jobs.js
 * Guns, bags, odd jobs, muggings and character helper functions.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * =========================  SECTION 15: GUNS & BAGS  ========================
 * ========================================================================== */

/** Index of the best (highest) gun owned. @returns {number} -1 if unarmed. */
function gunI() {
  return S.guns && S.guns.length ? Math.max.apply(null, S.guns) : -1;
}

/** Fight-odds bonus of the best gun (0 if unarmed). @returns {number} */
function gunB() {
  var i = gunI();
  return i < 0 ? 0 : GUNS[i].b;
}

/** Extra sentence years from the best gun (0 if unarmed). @returns {number} */
function gunY() {
  var i = gunI();
  return i < 0 ? 0 : GUNS[i].y;
}

/**
 * Buys a gun. GUARDS: enough cash, level high enough, not already owned.
 * @param {number} i - GUNS index.
 * @returns {void}
 */
function buyGun(i) {
  var g = GUNS[i];
  if (S.cash < g.c || lvl() < g.u || (S.guns || []).indexOf(i) >= 0) return;
  S.cash -= g.c;
  (S.guns = S.guns || []).push(i);
  sfx('buy');
  say('You bought a ' + g.n.toLowerCase() + '.');
  render();
}

/**
 * Builds the Guns card (rows for each gun with Buy/Owned/locked state).
 * @returns {string} HTML.
 */
function gunView() {
  var o = S.guns || [];
  return (
    '<div class="card"><h2>Guns</h2><p class="log">Your best weapon boosts your odds in fights with police and muggers. If police find it on you, it adds years to your sentence and is taken. ' +
    (gunI() >= 0 ? 'You carry: ' + GUNS[gunI()].n.toLowerCase() + '.' : 'You are unarmed.') +
    '</p>' +
    GUNS.map(function (g, i) {
      var own = o.indexOf(i) >= 0,
        lk = lvl() < g.u;
      return (
        '<div class="row"><div class="nm"><b>' +
        g.n +
        ' \u00b7 ' +
        gbp(g.c) +
        '</b><small>' +
        (lk
          ? 'Unlocks at level ' + g.u
          : 'Fights +' +
            Math.round(g.b * 100) +
            '% \u00b7 +' +
            g.y +
            ' year' +
            (g.y > 1 ? 's' : '') +
            ' if found') +
        '</small></div><button onclick="buyGun(' +
        i +
        ')"' +
        (own || lk || S.cash < g.c ? ' disabled' : '') +
        '>' +
        (own ? 'Owned' : 'Buy') +
        '</button></div>'
      );
    }).join('') +
    '</div>'
  );
}

/** Index of the owned bag, or -1 if none (S.bag may be null in old saves). @returns {number} */
function bagN() {
  return S.bag == null ? -1 : S.bag;
}

/**
 * Pocket capacity = base CAP (15) + the owned bag's extra slots.
 * @returns {number}
 */
function cap() {
  return CAP + (bagN() < 0 ? 0 : BAGS[bagN()].s);
}

/**
 * Buys/upgrades a bag. TRADE-IN MATH: the player gets 50% of the old bag's
 * price off, so cost = new price - round(0.5 * old price).
 * GUARDS: must be strictly better than the owned bag (i > owned), level
 * high enough, enough cash.
 * @param {number} i - BAGS index.
 * @returns {void}
 */
function buyBag(i) {
  var b = BAGS[i],
    o = bagN(),
    cost = b.c - (o >= 0 ? Math.round(BAGS[o].c * 0.5) : 0);
  if (i <= o || lvl() < b.u || S.cash < cost) return;
  S.cash -= cost;
  S.bag = i;
  sfx('buy');
  say('You bought a ' + b.n.toLowerCase() + ' (+' + b.s + ' slots).');
  render();
}

/**
 * Builds the Bags card. For each bag shows locked / price after trade-in /
 * owned; downgrades and the owned bag have a disabled button.
 * @returns {string} HTML.
 */
function bagView() {
  var o = bagN();
  return (
    '<div class="card"><h2>Bags</h2><p class="log">A bigger bag means more pocket slots. You carry ' +
    cap() +
    ' items. A bigger bag gives you half of the old one back.</p>' +
    BAGS.map(function (b, i) {
      var lk = lvl() < b.u,
        cost = b.c - (o >= 0 ? Math.round(BAGS[o].c * 0.5) : 0),
        own = i === o,
        low = i < o;
      return (
        '<div class="row"><div class="nm"><b>' +
        b.n +
        ' \u00b7 ' +
        gbp(b.c) +
        '</b><small>' +
        (lk
          ? 'Unlocks at level ' + b.u
          : '+' + b.s + ' slots' + (own || low ? '' : ' \u00b7 you pay ' + gbp(cost))) +
        '</small></div><button onclick="buyBag(' +
        i +
        ')"' +
        (own || low || lk || S.cash < cost ? ' disabled' : '') +
        '>' +
        (own ? 'Owned' : 'Buy') +
        '</button></div>'
      );
    }).join('') +
    '</div>'
  );
}

/* ============================================================================
 * ==========  SECTION 16: ODD JOBS, MUGGINGS & CHARACTER HELPERS  ============
 * ========================================================================== */

/** True if the player has already done their one odd job this year. @returns {boolean} */
function worked() {
  return S.worked === S.day;
}

/**
 * Does an odd job (one per year).
 * FLOW: lock the job for this year -> roll pay (lo..hi) -> job-specific risk:
 *  - Delivery: police-stop chance = base * district heat * (1 - bribe cut).
 *    WHY multiply by (1 - cut): a bribe of 30% removes 30% of that risk.
 *    On a stop you get no pay and face a full arrest popup.
 *  - Debt collection: `hurt` chance (30%) of a beating: -15 health, half pay.
 * Otherwise you simply get paid. (Jobs no longer cost "fed".)
 * @param {number} i - JOBS index.
 * @returns {void}
 */
function work(i) {
  var j = JOBS[i];
  if (worked()) return;
  S.worked = S.day;
  var pay = Math.round(rnd(j.lo, j.hi));
  if (j.arr && pick() < j.arr * AREAS[S.loc].heat * (1 - (S.bribe ? PROT[S.bribe.l].cut : 0))) {
    say('Police stopped you on a delivery. You got no pay.');
    arrest(
      false,
      0,
      'Caught on the job',
      'Officers stop you with the package. You get no pay for the job.',
    );
    return;
  }
  if (j.hurt && pick() < j.hurt) {
    hurt(15, 'a debt collection gone wrong');
    pay = Math.round(pay * 0.5);
    S.cash += pay;
    say('The debt collection went bad. You lost 15 health and only got ' + gbp(pay) + '.');
    note(
      'The job went wrong',
      'The debt collection turned nasty. You took a beating and lost 15 health, and only came away with ' +
        gbp(pay) +
        '.',
    );
    after();
    return;
  }
  S.cash += pay;
  say(j.n + ': you earned ' + gbp(pay) + '.');
  render();
}

/**
 * Builds the Odd jobs card (buttons disabled once the yearly job is used).
 * @returns {string} HTML.
 */
function jobsView() {
  var w = worked();
  return (
    '<div class="card"><h2>Odd jobs</h2><p class="log">' +
    (w
      ? 'You\u2019ve already worked this year.'
      : 'One job a year, paid in cash. Handy when you\u2019re broke.') +
    '</p>' +
    JOBS.map(function (j, i) {
      return (
        '<div class="row"><div class="nm"><b>' +
        j.n +
        '</b> ' +
        gbp(j.lo) +
        ' to ' +
        gbp(j.hi) +
        '<small>' +
        j.info +
        '</small></div><button onclick="work(' +
        i +
        ')"' +
        (w ? ' disabled' : '') +
        '>Work</button></div>'
      );
    }).join('') +
    '</div>'
  );
}

/**
 * Formats a 0..1 probability as a whole-number percentage string.
 * @param {number} p - e.g. 0.45
 * @returns {string} e.g. "45%".
 */
function pc(p) {
  return Math.round(p * 100) + '%';
}

/**
 * Applies a robbery loss: takes a fraction of POCKET cash only (the bank and
 * safe are untouched), counts the stat, books the cash as an XP loss and
 * shows a popup. A night-time robbery resolves after the year's XP payout,
 * so it lands in the following year's ledger.
 * @param {number} f - Fraction of cash lost (0..1).
 * @param {string} t - Popup title.
 * @param {number} [h] - Health lost, for the message only (applied by the caller).
 * @returns {void}
 */
function lose(f, t, h) {
  var l = Math.round(S.cash * f);
  S.cash -= l;
  xpLoss(l);
  stat().rob++;
  sfx('bad');
  note(t, 'You were robbed of ' + gbp(l) + (h ? ' and lost ' + h + ' health' : '') + '.');
}

/**
 * Raises a mugging/burglary choice popup with three options:
 *  - Fight: win chance = min(0.85, 0.40 + gun bonus). The 0.85 cap means even
 *    a heavy machine gun can't make a fight a sure thing. WIN: -5 health,
 *    loot £1-£50, plus a 0.5% chance the robber drops a gun you could unlock
 *    but don't own. LOSE: -20 health and lose fraction f of cash.
 *  - Run: 50% escape (costs 10 fed); fail = -10 health and lose f of cash.
 *  - Give up: certain, but only 60% of f is taken and nobody is hurt.
 * RISK/REWARD: the stakes text previews the exact pound amounts.
 * @param {number} f - Fraction of cash at risk (e.g. 0.2-0.6).
 * @param {string} t - Event title.
 * @param {string} d - Event description.
 * @returns {void}
 */
function robbery(f, t, d) {
  sfx('danger');
  vib([80, 40, 80]);
  ask(t, d, [
    {
      l: 'Fight',
      s:
        'Win odds ' +
        pc(Math.min(0.85, 0.4 + gunB())) +
        '. Lose and you lose about ' +
        gbp(S.cash * f) +
        ' and 20 health.',
      k: 'danger',
      fn: function () {
        if (pick() < Math.min(0.85, 0.4 + gunB())) {
          hurt(5, 'a mugging');
          var lc = Math.round(rnd(1, 50)),
            wp = '',
            ok = [];
          S.cash += lc;
          GUNS.forEach(function (g, i) {
            if (g.u <= lvl() && (S.guns || []).indexOf(i) < 0) ok.push(i);
          });
          if (ok.length && pick() < 0.005) {
            var wi = ok[Math.floor(Math.random() * ok.length)];
            (S.guns = S.guns || []).push(wi);
            wp = ' They also dropped a ' + GUNS[wi].n.toLowerCase() + ', which you kept.';
          }
          sfx('good');
          say('You beat off a robber and took ' + gbp(lc) + ' from them.' + wp);
          note(
            'You fought them off',
            'You drove them away' +
              (gunI() >= 0 ? ' with your ' + GUNS[gunI()].n.toLowerCase() : '') +
              ', lost 5 health and took ' +
              gbp(lc) +
              ' off them.' +
              wp,
          );
        } else {
          hurt(20, 'a mugging');
          lose(f, 'You lost the fight', 20);
        }
      },
    },
    {
      l: 'Run',
      s: 'Escape odds 50%. Fail and you lose about ' + gbp(S.cash * f) + ' and 10 health.',
      fn: function () {
        if (pick() < 0.5) {
          S.food = clamp(S.food - 10, 0, 100);
          sfx('good');
          note('You got away', 'You ran and they didn\u2019t follow. You lost nothing.');
        } else {
          hurt(10, 'a mugging');
          lose(f, 'They caught you', 10);
        }
      },
    },
    {
      l: 'Give up',
      s: 'Certain, but you only lose about ' + gbp(S.cash * f * 0.6) + ' and nobody gets hurt.',
      fn: function () {
        lose(f * 0.6, 'You handed it over');
      },
    },
  ]);
}

/**
 * Picks a random first name for a gender. @param {string} x - 'M' or 'F'. @returns {string}
 */
function pickName(x) {
  var a = NM[x];
  return a[Math.floor(Math.random() * a.length)];
}

/** Picks a random family surname. @returns {string} */
function famName() {
  return SN[Math.floor(Math.random() * SN.length)];
}

/**
 * Creates a relative (crew member).
 * @param {string} kind - 'Sibling' or 'Cousin'.
 * @param {number} g - Generation number they belong to.
 * @param {string} sn - Family name.
 * @returns {{n:string,kind:string,sex:string,g:number,task:null,jail:number}}
 */
function mkRel(kind, g, sn) {
  var x = Math.random() < 0.5 ? 'M' : 'F';
  return { n: pickName(x) + ' ' + sn, kind: kind, sex: x, g: g, task: null, jail: 0 };
}

/** Lifetime statistics object (created lazily). @returns {{sold:number,jail:number,arr:number,rob:number,peak:number}} */
function stat() {
  return S.st || (S.st = { sold: 0, jail: 0, arr: 0, rob: 0, peak: 0 });
}

/**
 * Applies health damage and remembers the cause for the death screen.
 * (Death itself is checked later in after()/sleep().)
 * @param {number} n - Health points lost.
 * @param {string} why - Cause text, e.g. "a mugging".
 * @returns {void}
 */
function hurt(n, why) {
  S.hp -= n;
  S.why = why;
}

/**
 * NET WORTH = pocket cash + bank + pocket stock value + safe stock value.
 * This is the score at death.
 * @returns {number} Pounds, rounded.
 */
function net() {
  return Math.round(S.cash + (S.bank || 0) + worth() + safeWorth());
}

/**
 * Family relationship label as seen by the current character: same
 * generation = Sibling/Cousin; older generation = Aunt/Uncle.
 * @param {Object} r - Relative.
 * @returns {string}
 */
function relLabel(r) {
  return r.g === S.gen ? r.kind : r.sex === 'F' ? 'Aunt' : 'Uncle';
}

/**
 * Builds the life record stored in the family tree when a character dies.
 * `died` is AGE0+DAYS+1 (= 68) for old age, otherwise the age at death.
 * `peak` = the best of tracked peak and final net worth.
 * @returns {Object} Life record.
 */
function lifeRec() {
  var nat = S.hp > 0,
    t = stat();
  return {
    n: S.name + ' ' + S.sn,
    look: S.look,
    g: S.gen,
    sx: S.sex || 'Founder',
    died: nat ? AGE0 + DAYS + 1 : AGE0 + S.day,
    cause: nat ? 'old age' : S.why || 'injuries',
    net: net(),
    lvl: lvl(),
    sold: t.sold,
    jail: t.jail,
    arr: t.arr,
    rob: t.rob,
    peak: Math.max(t.peak, net()),
  };
}

/**
 * Prepares the relatives list for the next generation: keep relatives of
 * the current generation or newer, add a new sibling and cousin of the NEXT
 * generation, and cap the list at 6 by dropping the oldest first (shift()).
 * @returns {Object[]} New relatives array.
 */
function nextFam() {
  var G = S.gen,
    f = (S.fam || []).filter(function (r) {
      return r.g >= G;
    });
  f.push(mkRel('Sibling', G + 1, S.sn), mkRel('Cousin', G + 1, S.sn));
  while (f.length > 6) f.shift();
  return f;
}
