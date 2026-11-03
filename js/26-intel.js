/* Kingpin: Bloodline  |  js/26-intel.js
 * Market intelligence (tip-offs) and travel fares. Shown on the Travel tab.
 *
 * TIP-OFFS: pay a contact to learn another district's prices for this year.
 * Every district has one price board per year (yearBoard in 10-state.js), so
 * a tip simply reveals that board and is exactly right all year. It is
 * marked in S.pre[district] = {d: year} and goes stale (ignored and cleared)
 * when the year turns.
 *
 * FARES: travelling costs a small fare from your pocket. If you can't afford
 * it you walk instead, which costs more fed (WALK_FED) but nothing else, so a
 * broke player can never get stuck. */

/** Fare to another district at your level. @returns {number} Pounds. */
function fare() {
  return FARE_BASE + FARE_LVL * lvl();
}

/** Price of a tip-off at your level. @returns {number} Pounds. */
function tipCost() {
  return Math.round(TIP_BASE * Math.pow(lvl(), TIP_EXP));
}

/**
 * The still-valid tip-off board for a district, if you bought one this year.
 * @param {number} loc - District index.
 * @returns {Object|null} The board, or null.
 */
function tipFor(loc) {
  var t = S.pre && S.pre[loc];
  return t && t.d === S.day ? yearBoard(loc) : null;
}

/**
 * Buys a tip-off on a district (not the one you're in, and only once a year).
 * @param {number} loc - District index.
 * @returns {void}
 */
function buyTip(loc) {
  var c = tipCost();
  if (loc === S.loc || tipFor(loc) || S.cash < c) return;
  S.cash -= c;
  (S.pre = S.pre || {})[loc] = { d: S.day };
  say('Paid a contact ' + gbp(c) + ' for this year’s prices in ' + AREAS[loc].n + '.');
  sfx('buy');
  achHit('insider');
  render();
}

/**
 * The price a tip-off shows for one drug: the board's base price times the
 * current market fatigue there, the same sum roll() will use on arrival.
 * @param {Object} t - Tip board.
 * @param {number} loc - District index.
 * @param {string} id - Drug id.
 * @returns {number} Pounds.
 */
function tipPrice(t, loc, id) {
  return Math.max(1, Math.round(t.base[id] * fatOf(loc, id)));
}

/**
 * Builds the tip-off price list shown under a district on the Travel tab.
 * Each unlocked drug shows its price there, the spike/cheap tag, whether it
 * beats what you'd get for it here (for stock you're holding), and any news.
 * @param {number} loc - District index.
 * @returns {string} HTML.
 */
function tipView(loc) {
  var t = tipFor(loc);
  if (!t) return '';
  return (
    '<div class="tip">' +
    ug()
      .map(function (g) {
        var p = tipPrice(t, loc, g.id),
          f = t.flag[g.id],
          here = sellAt(g.id),
          q = S.inv[g.id];
        return (
          '<div class="tip-row"><span>' +
          g.n +
          (f
            ? ' <span class="' +
              (f > 0 ? 'up' : 'down') +
              '">' +
              (f > 0 ? 'spike' : 'cheap') +
              '</span>'
            : '') +
          '</span><b>' +
          gbp(p) +
          '</b>' +
          (q
            ? '<small>' +
              (p > here
                ? 'Sells for ' + gbp(p - here) + ' more than here'
                : p < here
                  ? 'Sells for ' + gbp(here - p) + ' less than here'
                  : 'Same as here') +
              '</small>'
            : '') +
          newsLine(g.id, f, t.news && t.news[g.id], loc) +
          '</div>'
        );
      })
      .join('') +
    '</div>'
  );
}

/**
 * Builds the Travel tab: every district with its police level, a tip-off
 * button and a Go/Walk button showing the fare.
 * @returns {string} HTML.
 */
function travelView() {
  var f = fare(),
    tc = tipCost(),
    walk = S.cash < f;
  return (
    '<div class="card"><h2>Move to another district</h2><p class="log">Travelling costs ' +
    gbp(f) +
    ' and 10 fed' +
    (walk ? '. You can’t afford the fare, so you’ll walk and lose ' + WALK_FED + ' fed' : '') +
    '. Every trip risks a police stop or a mugging, and busier districts mean more police. A contact will tip you off about a district’s prices this year for ' +
    gbp(tc) +
    '.</p>' +
    AREAS.map(function (x, i) {
      var here = i === S.loc,
        has = !!tipFor(i);
      return (
        '<div class="row travel"><div class="nm"><b>' +
        x.n +
        '</b><small>Police ' +
        (x.heat < 0.7 ? 'light' : x.heat < 1.1 ? 'moderate' : 'heavy') +
        (has ? ' · tip-off bought' : '') +
        '</small></div><div class="btns">' +
        (here
          ? '<button disabled>You’re here</button>'
          : '<button onclick="buyTip(' +
            i +
            ')"' +
            (has || S.cash < tc ? ' disabled' : '') +
            '>Tip-off ' +
            gbp(tc) +
            '</button><button class="main" onclick="travel(' +
            i +
            ')">' +
            (walk ? 'Walk' : 'Go ' + gbp(f)) +
            '</button>') +
        '</div></div>' +
        (here ? '' : tipView(i))
      );
    }).join('') +
    '</div>'
  );
}
