/* Kingpin: Bloodline  |  js/25-news.js
 * Street news: a headline explaining every "spike" or "cheap" price.
 * When rollBoard() (10-state.js) gives a drug a price spike or a crash, it
 * also picks a headline number for it, stored with the board (S.news, or a
 * tip-off's board). The headline is shown under that drug in the market and
 * in tip-offs. {d} becomes the drug name and {a} the district name. */

/** Headlines for a SPIKE (price x2.2): busts, shortages and demand. */
var NEWS_SPIKE = [
  'Police seize a huge {d} shipment at the port. Supply in {a} has dried up.',
  'Big bust in {a}: three {d} suppliers were lifted overnight.',
  'Festival weekend in {a}. Everyone wants {d} and nobody has enough.',
  'Customs crackdown at the border. {d} is scarce across {a}.',
  'A {d} supplier was arrested on the motorway. Dealers in {a} are running dry.',
  'Students are back in {a}, and demand for {d} has gone through the roof.',
  'Dock workers are on strike. No {d} is getting into {a}.',
];

/** Headlines for a CHEAP price (x0.4): bulk deals and oversupply. */
var NEWS_CHEAP = [
  'A bulk shipment of {d} has landed in {a}. Dealers are dumping stock.',
  'Oversupply: a new lab is flooding {a} with cheap {d}.',
  'Police are busy elsewhere, and {d} is pouring into {a}.',
  'A wholesaler in {a} is clearing {d} at knock-down prices.',
  'Rumours of a raid have dealers in {a} selling off their {d} cheap.',
  'A {d} shipment came in twice the size anyone ordered. {a} is awash with it.',
  'Quiet month in {a}. Nobody’s buying {d}, so the price has crashed.',
];

/**
 * Picks a random headline number for a spike (f > 0) or a cheap price (f < 0).
 * @param {number} f - The price flag: 1 spike, -1 cheap.
 * @returns {number} Index into NEWS_SPIKE / NEWS_CHEAP.
 */
function newsPick(f) {
  return Math.floor(Math.random() * (f > 0 ? NEWS_SPIKE : NEWS_CHEAP).length);
}

/**
 * The headline text for one drug on one board.
 * Saves from before v0.60 have flags but no headline numbers, so a stable
 * fallback number is derived from the drug and the year.
 * @param {string} id - Drug id.
 * @param {number} f - The price flag (1 spike, -1 cheap; 0 = no news).
 * @param {number|undefined} n - Stored headline number.
 * @param {number} loc - District index (for the {a} name).
 * @returns {string} The headline, or '' when there's no news.
 */
function headline(id, f, n, loc) {
  if (!f) return '';
  var list = f > 0 ? NEWS_SPIKE : NEWS_CHEAP;
  if (n == null) n = (id.length + S.day) % list.length;
  return list[n % list.length].replace('{d}', gd(id).n).replace('{a}', AREAS[loc].n);
}

/**
 * HTML for a headline line under a market row (empty when there's no news).
 * @param {string} id - Drug id.
 * @param {number} f - The price flag.
 * @param {number|undefined} n - Stored headline number.
 * @param {number} loc - District index.
 * @returns {string} HTML.
 */
function newsLine(id, f, n, loc) {
  var t = headline(id, f, n, loc);
  return t ? '<small class="news"><b>News</b> ' + t + '</small>' : '';
}
