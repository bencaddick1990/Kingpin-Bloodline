/* Kingpin: Bloodline  |  js/02-utils.js
 * Small helpers: random numbers, clamping, money formatting, inventory totals.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * =====================  SECTION 4: BASIC UTILITIES  =========================
 * ========================================================================== */

/**
 * Short alias for document.getElementById.
 * @param {string} i - Element id.
 * @returns {HTMLElement|null} The element, or null if it doesn't exist.
 */
var $ = function (i) {
  return document.getElementById(i);
};

/**
 * Random decimal in [a, b).
 * MATH: Math.random() gives 0..1; scaling by (b - a) stretches the range
 * and adding a shifts it to start at a.
 * @param {number} a - Lower bound (inclusive).
 * @param {number} b - Upper bound (exclusive).
 * @returns {number}
 */
function rnd(a, b) {
  return a + Math.random() * (b - a);
}

/**
 * Random probability roll in [0, 1). Compare with a chance: `pick()<0.3`
 * is true 30% of the time.
 * @returns {number}
 */
function pick() {
  return Math.random();
}

/**
 * Limits a value to a range ("clamping"), e.g. keeps health within 0..100.
 * MATH: min(v, b) caps the top, then max(a, ...) lifts the bottom.
 * @param {number} v - Value to limit.
 * @param {number} a - Minimum.
 * @param {number} b - Maximum.
 * @returns {number}
 */
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

/**
 * Formats a number as British pounds with thousands separators.
 * @param {number} n - Amount (rounded to whole pounds).
 * @returns {string} e.g. 12345 -> "£12,345".
 */
function gbp(n) {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

/**
 * Short money format for tight spaces (the Cash stat tile).
 * MATH: for n >= 1,000,000, n/1e4 shifts the decimal four places, round()
 * drops the remainder, and /100 gives millions to two decimals
 * (e.g. 1,234,567 -> 123.4567 -> 123 -> 1.23).
 * @param {number} n - Amount in pounds.
 * @returns {string} "£1.23m" for millions, otherwise normal gbp().
 */
function gbpS(n) {
  return n >= 1e6 ? '£' + Math.round(n / 1e4) / 100 + 'm' : gbp(n);
}

/**
 * The character's current age. day 1 -> 18; capped at day DAYS (age 67)
 * so the display never exceeds the life span.
 * @returns {number}
 */
function age() {
  return AGE0 + Math.min(S.day, DAYS);
}

/**
 * Total items in the player's pockets (all drugs, not the safe).
 * @returns {number}
 */
function carried() {
  return GOODS.reduce(function (t, g) {
    return t + S.inv[g.id];
  }, 0);
}

/**
 * Street value of pocket stock at today's local prices. Drives sentence
 * length and heat. MATH: sum of (units held x current price) per drug.
 * @returns {number} Pounds.
 */
function worth() {
  return GOODS.reduce(function (t, g) {
    return t + S.inv[g.id] * S.prices[g.id];
  }, 0);
}

/**
 * Builds an object with every drug id set to 0 (empty inventory / cleared
 * "average paid" table).
 * @returns {Object<string, number>}
 */
function zero() {
  var o = {};
  GOODS.forEach(function (g) {
    o[g.id] = 0;
  });
  return o;
}
