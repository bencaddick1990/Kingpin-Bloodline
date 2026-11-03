/* Kingpin: Bloodline  |  js/18-safe-lab.js
 * Property safes, storage space and the lab.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 29: SAFE STORAGE & SPACE ACCOUNTING  =======================
 * ============================================================================
 * ========================================================================== */
/* Each property's safe is p.safe = {drugId: units}; p.sp holds the
 * AVERAGE COST per unit of the safe stock (for profit tracking). Stock in the
 * safe cannot be mugged, seized, fined or confiscated. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 28B: PROPERTIES (ONE PER DISTRICT)  ========================
 * ============================================================================
 * ========================================================================== */
/* You may own ONE property in EACH district. S.props is an array of property
 * objects {i, loc, safe, sp, lab, eq, batch}: `i` is the PROPS tier, `loc` the
 * district index (unique across the array, which is what enforces the
 * one-per-district rule) and the rest is that property's OWN safe, lab,
 * equipment and cooking batches. Crew tasks carry a district index (task.p)
 * so each relative works at one specific property. The property in the district
 * you are standing in is "here" (P()); it is the only one whose safe, lab,
 * crew assignment and bed you can use right now. */

/**
 * Finds the property owned in a given district.
 * @param {number} l - District index (AREAS).
 * @returns {Object|null} The property object, or null if you own none there.
 */
function PA(l) {
  var a = S.props || [],
    i;
  for (i = 0; i < a.length; i++) if (a[i].loc === l) return a[i];
  return null;
}

/**
 * The property in the district you are standing in ("here").
 * @returns {Object|null} Property object or null.
 */
function P() {
  return PA(S.loc);
}

/**
 * Adds a property, replacing any existing one in the SAME district. Filtering
 * on `loc` before adding is what guarantees at most one property per district.
 * @param {Object} np - New property object (must carry .loc).
 * @returns {void}
 */
function setP(np) {
  S.props = (S.props || [])
    .filter(function (x) {
      return x.loc !== np.loc;
    })
    .concat([np]);
}

/**
 * Do you already own property tier i in THIS district? Used to grey out the
 * Buy button ("Already owned") and, through blocked(), to reject a repeat
 * purchase. Owning the same tier in another district does not count, because
 * each district gets its own property.
 * @param {number} i - PROPS index.
 * @returns {boolean} True if the property here is exactly this tier.
 */
function owns(i) {
  var p = P();
  return !!p && p.i === i;
}

/**
 * Stands down every relative assigned to a district (used when its property
 * is sold or evicted, since they would have nowhere to work).
 * @param {number} loc - District index.
 * @returns {void}
 */
function dropCrew(loc) {
  (S.fam || []).forEach(function (r) {
    if (r.task && r.task.p === loc) r.task = null;
  });
}

/**
 * Readable list of every property owned, e.g. "Flat (Docklands), Hostel (Uptown)".
 * @returns {string} The list, or "None".
 */
function propNames() {
  var a = S.props || [];
  return a.length
    ? a
        .map(function (p) {
          return PROPS[p.i].n + ' (' + AREAS[p.loc].n + ')';
        })
        .join(', ')
    : 'None';
}

/**
 * Builds the Property card for the Home tab: the property in THIS district
 * (with a sell button), a note on any others you own, then the buy list.
 * The buy list is for the district you are standing in. A tier you already own
 * here shows a greyed-out "Already owned" button; other tiers are trade-ups.
 * @returns {string} HTML.
 */
function propView() {
  var p = P(),
    all = S.props || [],
    here = AREAS[S.loc].n,
    h =
      '<div class="card"><h2>Property in ' +
      here +
      '</h2><p class="log">You can own one property in each district, each with its own safe, lab, bed and crew.</p>';
  if (p) {
    var d = PROPS[p.i];
    h +=
      '<p class="lead">You own a ' +
      d.n.toLowerCase() +
      ' here. Upkeep ' +
      gbp(d.up) +
      ' a year. ' +
      (p.i === 0
        ? 'It can\u2019t be sold, but trading up still gives you ' +
          gbp(PROPS[0].c * 0.8) +
          ' back.'
        : 'It sells for ' + gbp(d.c * 0.8) + '.') +
      ' Safe holds ' +
      SLOTS[p.i] +
      '.</p>' +
      (p.lab
        ? '<p class="log">Your lab and equipment go with the property if you sell or trade up.</p>'
        : '') +
      (locked(p)
        ? '<p class="log">You can\u2019t sell while the safe has stock or a batch is running. Upgrading moves your stock to the new safe, but the lab and equipment stay behind, so let batches finish first.</p>'
        : '') +
      (p.i === 0
        ? ''
        : '<button class="danger full" onclick="sellProp()"' +
          (locked(p) ? ' disabled' : '') +
          '>Sell property</button>');
  } else
    h +=
      '<p class="lead">No place of your own in ' +
      here +
      ', so you sleep rough here: cold, and easy prey. Buy a place in ' +
      here +
      ' to sleep safely whenever you end the year in this district.</p>';
  /* Other districts: list them and show the combined yearly upkeep (money out every year-end). */
  var el = all.filter(function (x) {
    return x !== p;
  });
  if (el.length)
    h +=
      '<p class="log">Also owned: ' +
      el
        .map(function (x) {
          return PROPS[x.i].n + ' in ' + AREAS[x.loc].n;
        })
        .join(', ') +
      '. Total upkeep for all properties: ' +
      gbp(
        all.reduce(function (t, x) {
          return t + PROPS[x.i].up;
        }, 0),
      ) +
      ' a year.</p>';
  return (
    h +
    PROPS.map(function (x, i) {
      var own = owns(i);
      return (
        '<div class="row"><div class="nm"><b>' +
        x.n +
        '</b> ' +
        gbp(x.c) +
        '<small>Upkeep ' +
        gbp(x.up) +
        ' a year. Safe slots: ' +
        SLOTS[i] +
        '. ' +
        (lvl() < x.u ? 'Unlocks at level ' + x.u : x.info) +
        '</small></div><button onclick="buyProp(' +
        i +
        ')" ' +
        (own || S.cash + (p ? PROPS[p.i].c * 0.8 : 0) < x.c || blocked(i) ? 'disabled' : '') +
        '>' +
        (own ? 'Already owned' : 'Buy') +
        '</button></div>'
      );
    }).join('') +
    '</div>'
  );
}

/** Safe capacity of a property (SLOTS table). @param {Object} [p] - Property (default: the one here). @returns {number} */
function safeCap(p) {
  p = p || P();
  return SLOTS[p.i];
}

/** Units currently in a property's safe. @param {Object} [p] - Property (default: here). @returns {number} */
function safeCount(p) {
  p = p || P();
  var s = p.safe || {};
  return GOODS.reduce(function (t, g) {
    return t + (s[g.id] || 0);
  }, 0);
}

/**
 * Street value of the stock in EVERY property's safe at local prices (counts
 * toward net worth). Summing over S.props means safes in other districts are
 * valued too.
 * @returns {number} Pounds.
 */
function safeWorth() {
  return (S.props || []).reduce(function (t, p) {
    var s = p.safe || {};
    return (
      t +
      GOODS.reduce(function (u, g) {
        return u + (s[g.id] || 0) * S.prices[g.id];
      }, 0)
    );
  }, 0);
}

/** Units in a property's lab batches still running or waiting. @param {Object} [p] - Property (default: here). @returns {number} */
function pend(p) {
  p = p || P();
  var b = p.batch || {};
  return Object.keys(b).reduce(function (t, k) {
    return t + b[k].n;
  }, 0);
}

/**
 * FREE SPACE for new production at a property: its safe space minus what its
 * running batches will need, PLUS pocket space only when you are standing in
 * that property's district (finished batches only reach your pockets when you
 * are there; a remote property's output can only go into its own safe).
 * @param {Object} [p] - Property (default: here).
 * @returns {number} Units (never below 0).
 */
function room(p) {
  p = p || P();
  return Math.max(
    0,
    (p.loc === S.loc ? cap() - carried() : 0) + safeCap(p) - safeCount(p) - pend(p),
  );
}

/**
 * True if a property holds stock or running batches (so it cannot be
 * sold/downgraded without losing them).
 * @param {Object} [p] - Property (default: here).
 * @returns {boolean}
 */
function locked(p) {
  p = p || P();
  return !!p && (safeCount(p) > 0 || pend(p) > 0);
}

/**
 * Number of drugs a property is currently cooking (not waiting for space).
 * Feeds the cook term of the heat formula.
 * @param {Object} [p] - Property (default: here).
 * @returns {number}
 */
function cooks(p) {
  p = p || P();
  var b = (p && p.batch) || {};
  return Object.keys(b).filter(function (k) {
    return !b[k].w;
  }).length;
}

/**
 * COMPLETES lab batches at the year turn, for EVERY property.
 * Each property finishes its own batches (finishAt). Stock only reaches your
 * POCKETS at the property in the district you are standing in; everywhere else
 * it goes into that property's safe or waits at the lab.
 * @param {boolean} home - True if finished stock may be placed in pockets.
 * @returns {void}
 */
function finishBatches(home) {
  (S.props || []).forEach(function (p) {
    finishAt(p, home && p.loc === S.loc);
  });
}

/**
 * Finishes the batches of ONE property.
 * ORDER: crew batches (flag c) first, then the player's, by sorting on the
 * flag (c?1:0 descending). Each batch's output goes to:
 *   1. the property's SAFE first (up to its free safe space),
 *   2. then POCKETS (only if `home` is true, i.e. you are there),
 *   3. anything left stays at the lab flagged `w` (waiting for room) and a
 *      popup tells the player once; it can be collected later.
 * COST BASIS: each addition updates the stock's average unit cost with a
 * weighted average: newAvg = (oldAvg*oldQty + batchUnitCost*addedQty) / (oldQty+addedQty).
 * @param {Object} p - The property.
 * @param {boolean} home - True if finished stock may be placed in pockets.
 * @returns {void}
 */
function finishAt(p, home) {
  if (!p.batch) return;
  var wh = ' in ' + AREAS[p.loc].n;
  var sf = (p.safe = p.safe || {}),
    sp = (p.sp = p.sp || {});
  Object.keys(p.batch)
    .sort(function (a, c) {
      return (p.batch[c].c ? 1 : 0) - (p.batch[a].c ? 1 : 0);
    })
    .forEach(function (id) {
      var b = p.batch[id],
        g = gd(id),
        m = Math.min(b.n, safeCap(p) - safeCount(p));
      if (m > 0) {
        var q = sf[id] || 0;
        sp[id] = ((sp[id] || 0) * q + b.u * m) / (q + m);
        sf[id] = q + m;
        b.n -= m;
        say(m + ' ' + g.n + ' finished cooking and went into the safe' + wh + '.');
      }
      if (b.n > 0 && home) {
        var k = Math.min(b.n, cap() - carried());
        if (k > 0) {
          var pq = S.inv[id];
          S.paid[id] = (S.paid[id] * pq + b.u * k) / (pq + k);
          S.inv[id] += k;
          b.n -= k;
          say(k + ' ' + g.n + ' finished cooking and went into your pockets.');
        }
      }
      if (b.n > 0) {
        if (!b.w)
          note(
            'Batch waiting for room',
            b.n +
              ' ' +
              g.n +
              ' are waiting at the lab' +
              wh +
              ' because there\u2019s no room for them.',
          );
        b.w = 1;
      } else delete p.batch[id];
    });
}

/**
 * DEPOSITS stock from pockets into the safe (weighted-average cost basis).
 * Moves min(requested, held, free safe space) units.
 * @param {string} id - Drug id.
 * @param {number} n - Units (99999 = "max").
 * @returns {void}
 */
function dep(id, n) {
  var p = P(),
    sf = (p.safe = p.safe || {}),
    sp = (p.sp = p.sp || {}),
    m = Math.min(n, S.inv[id], safeCap() - safeCount());
  if (m < 1) return;
  var q = sf[id] || 0;
  sp[id] = ((sp[id] || 0) * q + S.paid[id] * m) / (q + m);
  sf[id] = q + m;
  S.inv[id] -= m;
  if (!S.inv[id]) S.paid[id] = 0;
  say('Put ' + m + ' ' + gd(id).n + ' in the safe.');
  render();
}

/**
 * WITHDRAWS stock from the safe into pockets (weighted-average cost basis).
 * Moves min(requested, in safe, free pocket space) units.
 * @param {string} id - Drug id.
 * @param {number} n - Units (99999 = "max").
 * @returns {void}
 */
function wd(id, n) {
  var p = P(),
    sf = (p.safe = p.safe || {}),
    sp = (p.sp = p.sp || {}),
    m = Math.min(n, sf[id] || 0, cap() - carried());
  if (m < 1) return;
  var q = S.inv[id];
  S.paid[id] = (S.paid[id] * q + (sp[id] || 0) * m) / (q + m);
  S.inv[id] += m;
  sf[id] -= m;
  if (!sf[id]) sp[id] = 0;
  say('Took ' + m + ' ' + gd(id).n + ' out of the safe.');
  render();
}

/**
 * COLLECTS a finished batch that was "waiting for room": fills the safe
 * first, then pockets, with as much as fits. If nothing fits, does nothing.
 * Deletes the batch when empty.
 * @param {string} id - Drug id.
 * @returns {void}
 */
function collect(id) {
  var p = P(),
    b = p && p.batch && p.batch[id];
  if (!b || !b.w) return;
  var g = gd(id),
    sf = (p.safe = p.safe || {}),
    sp = (p.sp = p.sp || {}),
    t = 0,
    m = Math.min(b.n, Math.max(0, safeCap() - safeCount()));
  if (m > 0) {
    var q = sf[id] || 0;
    sp[id] = ((sp[id] || 0) * q + b.u * m) / (q + m);
    sf[id] = q + m;
    b.n -= m;
    t += m;
  }
  var k = Math.min(b.n, Math.max(0, cap() - carried()));
  if (k > 0) {
    var pq = S.inv[id];
    S.paid[id] = (S.paid[id] * pq + b.u * k) / (pq + k);
    S.inv[id] += k;
    b.n -= k;
    t += k;
  }
  if (t < 1) return;
  say('Collected ' + t + ' ' + g.n + ' from the lab.');
  if (b.n <= 0) delete p.batch[id];
  render();
}

/**
 * Builds the Safe card (only when you are in the property's district):
 * per drug "in safe / in pockets" and In 1 / In max / Out 1 / Out max buttons,
 * each disabled when it couldn't move anything.
 * @returns {string} HTML ('' if no property here).
 */
function safeView() {
  var p = P();
  if (!p) return '';
  var sf = p.safe || {},
    sc = safeCap(),
    n = safeCount();
  return (
    '<div class="card"><h2>Safe</h2><p class="log">Safe from muggings, raids and jail. Holds ' +
    n +
    ' of ' +
    sc +
    '.</p>' +
    ug()
      .map(function (g) {
        var q = sf[g.id] || 0,
          pk = S.inv[g.id],
          bi = pk && n < sc ? '' : ' disabled',
          bo = q && carried() < cap() ? '' : ' disabled',
          a = '<button style="flex:1" onclick="';
        return (
          '<div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><b>' +
          g.n +
          '</b><small>In safe ' +
          q +
          ' · in pockets ' +
          pk +
          '</small></div><div class="btns" style="flex:1 1 100%">' +
          a +
          "dep('" +
          g.id +
          '\',1)"' +
          bi +
          '>In 1</button>' +
          a +
          "dep('" +
          g.id +
          '\',99999)"' +
          bi +
          '>In max</button>' +
          a +
          "wd('" +
          g.id +
          '\',1)"' +
          bo +
          '>Out 1</button>' +
          a +
          "wd('" +
          g.id +
          '\',99999)"' +
          bo +
          '>Out max</button></div></div>'
        );
      })
      .join('') +
    '</div>'
  );
}

/* ============================================================================
 * ============================================================================
 * ======  SECTION 30: LAB (COOKING DRUGS)  ===================================
 * ============================================================================
 * ========================================================================== */

/**
 * Ingredient cost per unit: a FIXED price, identical every year.
 * MATH: cost = round(g.lo * (1 - LABDISC)). g.lo is the drug's lowest
 * standard list price (the bottom of its GOODS range), so it ignores district
 * bias, market fatigue and the random "cheap"/"spike" events. Example: Weed
 * lo = 15 -> 15 * 0.9 = 13.5 -> rounds to £14. Because the price never reads
 * S.prices, the player and the crew pay the same amount every batch (the crew
 * adds its 15% fee on top in crewYear). Minimum £1, whole number.
 * @param {Object} g - A GOODS entry.
 * @returns {number} Pounds per unit.
 */
function ing(g) {
  return Math.max(1, Math.round(g.lo * (1 - LABDISC)));
}

/**
 * Finds a GOODS entry by id.
 * @param {string} id - Drug id.
 * @returns {Object|undefined} The entry.
 */
function gd(id) {
  return GOODS.filter(function (x) {
    return x.id === id;
  })[0];
}

/** Builds a lab in the current property (costs LAB). @returns {void} */
function buildLab() {
  var p = P();
  S.cash -= LAB;
  p.lab = true;
  p.eq = p.eq || {};
  sfx('buy');
  say('You built a lab in your ' + PROPS[p.i].n.toLowerCase() + ' in ' + AREAS[p.loc].n + '.');
  render();
}

/**
 * Buys the equipment for one drug (price g.eq). Permanent until the lab is lost.
 * @param {string} id - Drug id.
 * @returns {void}
 */
function buyEq(id) {
  var g = gd(id);
  S.cash -= g.eq;
  (P().eq = P().eq || {})[id] = 1;
  sfx('buy');
  say('You bought the ' + g.n + ' equipment.');
  render();
}

/**
 * Starts a cooking batch (ready next year). One batch per drug at a time.
 * QUANTITY: m = min(requested, free room, units you can afford). If that is
 * less than asked (and the ask wasn't the "Max" 9999), a popup explains
 * which limit applied: room if room < affordable, otherwise cash.
 * XP: nothing is booked now. The batch carries its ingredient cost (u) as
 * the cost basis of its units, charged when they are sold or lost.
 * @param {string} id - Drug id.
 * @param {number} n - Units requested (9999 = Max).
 * @returns {void}
 */
function cook(id, n) {
  var g = gd(id),
    u = ing(g),
    p = P(),
    b = (p.batch = p.batch || {});
  if (b[id]) return;
  var r = room(),
    af = Math.floor(S.cash / u),
    m = Math.min(n, r, af);
  if (m < 1) {
    note(
      'Can\u2019t cook ' + g.n,
      r < 1
        ? 'There\u2019s no space left in your safe or pockets.'
        : 'You can\u2019t afford the ingredients (' + gbp(u) + ' each).',
    );
    return;
  }
  if (m < n && n < 9999)
    note(
      'Smaller batch than asked',
      'You asked for ' +
        n +
        ' ' +
        g.n +
        ' but only ' +
        m +
        ' were started: ' +
        (r < af
          ? 'there\u2019s only room for ' + r + ' (safe and pockets, minus running batches).'
          : 'you can only afford ingredients for ' + af + '.'),
    );
  S.cash -= u * m;
  b[id] = { n: m, u: u };
  sfx('buy');
  achHit('cook');
  say('Started cooking ' + m + ' ' + g.n + ' for ' + gbp(u * m) + '. It will be ready next year.');
  render();
}

/**
 * Builds the Lab tab. STATES: no property in this district ->
 * hint; no lab -> Build button; lab present -> per-drug rows that are
 * either "buy equipment", "cook 1/10/max", or the status of a running /
 * waiting batch (with a Collect button sized to the free space `cf`).
 * The header previews heat now and (if under 5 drugs cooking) what ONE MORE
 * cooking drug would raise it to, via raidPct(cooks()+1).
 * @returns {string} HTML.
 */
function labView() {
  var p = P(),
    c = '<div class="card"><h2>Lab in ' + AREAS[S.loc].n + '</h2>';
  if (!p)
    return (
      c +
      '<p class="lead">You have no property in ' +
      AREAS[S.loc].n +
      '. Buy one in the Home tab, then build a lab there. Every property has its own lab.</p></div>'
    );
  if (!p.lab)
    return (
      c +
      '<p class="lead">Your ' +
      PROPS[p.i].n.toLowerCase() +
      ' has no lab yet. Selling or trading up the property loses the lab and its equipment.</p><button class="main full" onclick="buildLab()" ' +
      (S.cash < LAB ? 'disabled' : '') +
      '>Build lab · ' +
      gbp(LAB) +
      '</button></div>'
    );
  var eq = p.eq || {},
    free = room(),
    bt = p.batch || {},
    cf = Math.max(0, safeCap() - safeCount()) + Math.max(0, cap() - carried());
  return (
    c +
    '<p class="log">One batch of each drug at a time, ready next year. Ingredients always cost the same: 10% below the lowest normal price of that drug, whatever the market is doing. Space for ' +
    free +
    ' more. Heat is ' +
    raidPct() +
    '%' +
    (cooks() < 5 ? '; one more drug cooking would make it ' + raidPct(cooks() + 1) + '%' : '') +
    '.</p>' +
    ug()
      .map(function (g) {
        var u = ing(g),
          has = eq[g.id],
          m = Math.min(free, Math.floor(S.cash / u)),
          off = m < 1 ? 'disabled' : '',
          b = bt[g.id];
        return (
          '<div class="row"><div class="nm"><b>' +
          g.n +
          '</b><small>' +
          (has
            ? 'Ingredients ' + gbp(u) + ' each · market ' + gbp(S.prices[g.id])
            : 'Equipment ' + gbp(g.eq)) +
          '</small></div>' +
          (has && b
            ? '<div style="text-align:right"><small>' +
              (b.w ? b.n + ' waiting for room' : 'Cooking ' + b.n + ', ready next year') +
              '</small>' +
              (b.w
                ? '<button class="mini" style="display:block;margin:4px 0 0 auto" onclick="collect(\'' +
                  g.id +
                  '\')"' +
                  (cf < 1 ? ' disabled' : '') +
                  '>Collect ' +
                  Math.min(b.n, cf) +
                  '</button>'
                : '') +
              '</div>'
            : has
              ? '<div class="btns"><button onclick="cook(\'' +
                g.id +
                '\',1)" ' +
                off +
                '>Cook 1</button><button onclick="cook(\'' +
                g.id +
                '\',10)" ' +
                off +
                '>Cook 10</button><button onclick="cook(\'' +
                g.id +
                '\',9999)" ' +
                off +
                '>Max ' +
                m +
                '</button></div>'
              : '<button onclick="buyEq(\'' +
                g.id +
                '\')" ' +
                (S.cash < g.eq ? 'disabled' : '') +
                '>Buy</button>') +
          '</div>'
        );
      })
      .join('') +
    '</div>'
  );
}
