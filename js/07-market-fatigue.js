/* Kingpin: Bloodline  |  js/07-market-fatigue.js
 * How your own trading moves prices in a district (market fatigue).
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ====================  SECTION 14: MARKET FATIGUE  ==========================
 * ========================================================================== */
/* Your own trades move prices. S.fat[districtIndex][drugId] is a MULTIPLIER
 * (1 = normal). Buying multiplies it up, selling multiplies it down, and it
 * relaxes back toward 1 each year. It only ever works AGAINST you: buyAt uses
 * max(fatigue, 1) and sellAt uses min(fatigue, 1), so no buy-sell loop (in
 * one visit, across visits or across years) can profit from your own moves. */

/**
 * Reads the fatigue multiplier for a drug in a district.
 * @param {number} l - District index.
 * @param {string} id - Drug id.
 * @returns {number} Multiplier (1 if never traded there).
 */
function fatOf(l, id) {
  return ((S.fat || {})[l] || {})[id] || 1;
}

/**
 * Stores a fatigue multiplier, limited to 0.25x..4x so prices can never
 * collapse to nothing or explode.
 * @param {number} l - District index.
 * @param {string} id - Drug id.
 * @param {number} f - New multiplier.
 * @returns {void}
 */
function fatSet(l, id, f) {
  S.fat = S.fat || {};
  S.fat[l] = S.fat[l] || {};
  S.fat[l][id] = clamp(f, 0.25, 4);
}

/**
 * Cools every market toward normal. Each year closes HALF the gap to 1.
 * MATH: k = 0.5^n (n years passed). new = 1 + (old - 1) * k.
 *   e.g. old = 2.0, one year: 1 + (2-1)*0.5 = 1.5; two years: 1.25 ...
 * Values within 2% of 1 are deleted to keep the save file tidy.
 * @param {number} [n=1] - Years elapsed (jail time passes several at once).
 * @returns {void}
 */
function coolMarkets(n) {
  if (!S.fat) return;
  var k = Math.pow(0.5, n || 1);
  Object.keys(S.fat).forEach(function (l) {
    var o = S.fat[l];
    Object.keys(o).forEach(function (id) {
      var v = 1 + (o[id] - 1) * k;
      if (Math.abs(v - 1) < 0.02) delete o[id];
      else o[id] = v;
    });
  });
}

/**
 * Developer helper text: this district's no-spike price range for a drug.
 * Only shown when the dev "Price ranges" toggle is on.
 * @param {Object} g - A GOODS entry.
 * @returns {string}
 */
function rng(g) {
  var b = AREAS[S.loc].b[g.id];
  return 'Range here ' + gbp(g.lo * b) + ' to ' + gbp(g.hi * b) + ' (no spikes)';
}
