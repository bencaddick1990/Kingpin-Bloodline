/* Kingpin: Bloodline  |  js/13-actions.js
 * Tab switching, buying, selling, eating, healing and the event popup system.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 22: TAB SWITCHING & MARKET / CARE ACTIONS  =================
 * ============================================================================
 * ========================================================================== */

/**
 * Switches the active tab of the day view and redraws.
 * @param {string} t - 'trade' | 'food' | 'go' | 'home' | 'lab' | 'guns' | 'crew' | 'casino'.
 * @returns {void}
 */
function tab(t) {
  S.tab = t;
  render();
}

/**
 * This board's price for a drug BEFORE market fatigue.
 * Normally read from S.base (written by roll). A save from before v0.53 has no
 * S.base, so it is rebuilt from the market price: base = price / fatigue.
 * @param {string} id - Drug id.
 * @returns {number} Unrounded base price.
 */
function baseOf(id) {
  return S.base && S.base[id] != null ? S.base[id] : S.prices[id] / fatOf(S.loc, id);
}

/**
 * The whole-pound price you PAY per unit right now (what the Buy buttons use).
 * RULE: base * max(fatigue, 1).
 * WHY: fatigue is YOUR footprint on this district. Above 1 (you bought here)
 * it makes your next purchases dearer, as intended. Below 1 (you sold here)
 * it would let you buy back cheaply from a market you crashed yourself, so
 * for buying it is floored at 1: your own selling never discounts your buying.
 * This holds across visits and across years, which is what closes every
 * round-trip loop (same visit, hop away and back, or wait a year).
 * Rounded because the board shows whole pounds; never below £1.
 * @param {string} id - Drug id.
 * @returns {number} Unit buy price in whole pounds.
 */
function buyAt(id) {
  return Math.max(1, Math.round(baseOf(id) * Math.max(fatOf(S.loc, id), 1)));
}

/**
 * The whole-pound price you RECEIVE per unit right now (what Sell buttons use).
 * RULE: base * min(fatigue, 1), the mirror of buyAt: your own buying never
 * lifts your own selling price, while your selling still depresses it.
 * CONSEQUENCE: on any one board, sellAt <= buyAt always, and across boards the
 * only thing left to profit from is the random roll and district bias, i.e.
 * genuine "buy cheap here, sell dear there" trading.
 * @param {string} id - Drug id.
 * @returns {number} Unit sell price in whole pounds.
 */
function sellAt(id) {
  return Math.max(1, Math.round(baseOf(id) * Math.min(fatOf(S.loc, id), 1)));
}

/**
 * Moves a district's fatigue for a drug and keeps the market price in step.
 * The multiplier is applied to fatigue first (which fatSet clamps to
 * 0.25..4), then the market price is recomputed as base * fatigue, so price
 * and fatigue can never drift apart when the clamp bites.
 * @param {string} id - Drug id (in the current district).
 * @param {number} k - Multiplier (>1 after buying, <1 after selling).
 * @returns {void}
 */
function pushMarket(id, k) {
  fatSet(S.loc, id, fatOf(S.loc, id) * k);
  S.prices[id] = Math.max(1, baseOf(id) * fatOf(S.loc, id));
}

/**
 * BUYS units of a drug at ONE FLAT PRICE for the whole purchase, then applies
 * MARKET FATIGUE once the purchase is complete.
 * WHY FLAT: "Buy max" at a shown £15 must cost exactly £15 a unit. Fatigue is
 * still applied for every unit bought, just AFTER the purchase instead of
 * unit by unit, so the next purchase (and the next "Buy 1") is dearer.
 * MATH (step by step):
 *   u = buyAt(id)          the whole-pound price shown on the button row.
 *   m = min(n, free pocket room, floor(cash / u))   units actually bought.
 *   paid = m * u           every unit costs the same.
 *   r = e^(KB / cap)       per-unit fatigue factor. KB = 0.5, so m = a full
 *                          bag multiplies fatigue by e^0.5 (about 1.65x);
 *                          dividing by cap spreads the same pressure over a
 *                          bigger bag. Total factor = r^m (exponents add, so
 *                          ten 1-unit buys and one 10-unit buy end at exactly
 *                          the same price).
 *   new average paid = (oldAvg * oldQty + paid) / (oldQty + m)  (weighted mean)
 *                          This is the COST BASIS that sell() charges against
 *                          the sale, so it is what XP is measured from.
 * XP: buying books nothing. The spend is counted when the units are sold
 * (or lost), so holding stock over the year end no longer costs XP.
 * @param {string} id - Drug id.
 * @param {number} n - Units wanted (1 for "Buy 1", a huge number for "Buy max").
 * @returns {void} (does nothing if not even one unit can be bought)
 */
function buy(id, n) {
  var u = buyAt(id),
    m = Math.min(n, cap() - carried(), Math.floor(S.cash / u));
  if (m < 1) return;
  var paid = m * u,
    q = S.inv[id];
  S.paid[id] = (S.paid[id] * q + paid) / (q + m);
  S.inv[id] += m;
  S.cash -= paid;
  pushMarket(id, Math.pow(Math.exp(KB / cap()), m)); /* r^m: the combined fatigue of all m units */
  sfx('buy');
  say('Bought ' + m + ' ' + id + ' at ' + gbp(u) + ' each for ' + gbp(paid) + '.');
  render();
}

/**
 * SELLS units of a drug at ONE FLAT PRICE for the whole sale, then pushes the
 * market price DOWN once the sale is complete.
 * MATH:
 *   m = n units ("Sell 1") or everything held ("Sell max", n omitted).
 *   u = sellAt(id)         the whole-pound price shown on the button row.
 *   total = m * u          every unit sells at the shown price.
 *   margin = total - m * average price paid (the average is unchanged by a
 *            partial sale; it resets to 0 when the stack is gone).
 *   d = e^(-KS / cap)      per-unit fall (KS = 0.7, so a full bag cuts
 *                          fatigue to e^-0.7, about 0.50x). Combined fall d^m.
 * XP: the MARGIN (not the takings) goes into this year's ledger, so only
 * real profit earns XP and a losing sale counts against it.
 * @param {string} id - Drug id.
 * @param {number} [n] - Units to sell; omit to sell the whole stack.
 * @returns {void}
 */
function sell(id, n) {
  var q = S.inv[id];
  if (!q) return;
  var m = Math.min(n || q, q),
    u = sellAt(id),
    t = m * u,
    pr = t - m * S.paid[id];
  S.cash += t;
  yp().p += pr;
  S.inv[id] -= m;
  if (!S.inv[id]) S.paid[id] = 0;
  pushMarket(id, Math.pow(Math.exp(-KS / cap()), m));
  say(
    'Sold ' +
      m +
      ' ' +
      id +
      ' at ' +
      gbp(u) +
      ' each for ' +
      gbp(t) +
      (pr >= 0 ? ' (+' + gbp(pr) + ' profit).' : ' (a loss of ' + gbp(-pr) + ').'),
  );
  stat().sold += m;
  sfx('sell');
  render();
}

/**
 * Buys medicine: pays and restores health (capped at 100). The button is
 * already disabled when you can't afford it or are at full health, so no
 * extra guards are needed here.
 * @param {number} i - MEDS index.
 * @returns {void}
 */
function heal(i) {
  var m = MEDS[i],
    b = S.hp;
  S.cash -= m.c;
  S.hp = clamp(S.hp + m.h, 0, 100);
  sfx('heal');
  say('You used ' + m.n.toLowerCase() + ' and recovered ' + Math.round(S.hp - b) + ' health.');
  render();
}

/**
 * Buys food: restores "fed" (0..100) and, for proper meals, some health.
 * @param {number} i - FOOD index.
 * @returns {void}
 */
function eat(i) {
  var f = FOOD[i];
  S.cash -= f.c;
  S.food = clamp(S.food + f.f, 0, 100);
  S.hp = clamp(S.hp + f.h, 0, 100);
  sfx('eat');
  say('Ate at the ' + f.n.toLowerCase() + '.');
  render();
}

/* ============================================================================
 * ============================================================================
 * ======  SECTION 23: EVENT SYSTEM (POPUPS & CHOICES)  =======================
 * ============================================================================
 * ========================================================================== */
/* An EVENT is {t: title, d: description, c: [choices]}. Each choice is
 * {l: label, s: sub-text, k: css class, d: disabled?, fn: callback}.
 * Only ONE event shows at a time (S.ev); extras wait in the queue Q. */

/**
 * Shows an event popup, or queues it if one is already open.
 * @param {string} t - Title.
 * @param {string} d - Description.
 * @param {Object[]} c - Choices.
 * @returns {void}
 */
function ask(t, d, c) {
  var e = { t: t, d: d, c: c };
  if (S.ev) Q.push(e);
  else S.ev = e;
  render();
}

/**
 * Handles the player tapping choice number i.
 * ORDER MATTERS: (1) clear S.ev first, so that the callback can raise a NEW
 * event (e.g. a failed escape triggers a jail notice) without it being
 * queued behind the old one; (2) run the callback; (3) if the callback did
 * not open another event and others are waiting, show the next one;
 * (4) after() checks for death and redraws.
 * @param {number} i - Index of the chosen option.
 * @returns {void}
 */
function choose(i) {
  var c = S.ev.c[i];
  S.ev = null;
  c.fn();
  if (!S.ev && Q.length) S.ev = Q.shift();
  after();
}

/**
 * Post-action check: if health is zero or below, clamp it to 0 and switch to
 * the death screen; then redraw.
 * @returns {void}
 */
function after() {
  if (S.hp <= 0) {
    S.hp = 0;
    S.view = 'over';
  }
  render();
}
