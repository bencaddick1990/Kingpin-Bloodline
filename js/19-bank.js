/* Kingpin: Bloodline  |  js/19-bank.js
 * The bank.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 31: BANK  ==================================================
 * ============================================================================
 * ========================================================================== */
/* Bank money (S.bank) is immune to robbery, raids and fines, counts toward
 * net worth, and half of it passes to the heir. */

/** Current bank balance (0 for old saves without the field). @returns {number} */
function bk() {
  return S.bank || 0;
}

/**
 * Deposits cash. Amount is limited to whole pounds you actually hold, so
 * "All" can pass a huge number (1e15) safely.
 * @param {number} n - Pounds requested.
 * @returns {void}
 */
function bankIn(n) {
  var m = Math.min(n, Math.floor(S.cash));
  if (m < 1) return;
  S.cash -= m;
  S.bank = bk() + m;
  sfx('sell');
  say('Deposited ' + gbp(m) + ' in the bank.');
  render();
}

/**
 * Withdraws cash, limited to the balance.
 * @param {number} n - Pounds requested.
 * @returns {void}
 */
function bankOut(n) {
  var m = Math.min(n, bk());
  if (m < 1) return;
  S.bank = bk() - m;
  S.cash += m;
  sfx('sell');
  say('Withdrew ' + gbp(m) + ' from the bank.');
  render();
}

/**
 * Builds the Bank card with Deposit and Withdraw button rows (£100, £1k,
 * £10k, All). A button is disabled when the source (cash or balance) is
 * below that amount. `a` is a small helper that renders one button.
 * @returns {string} HTML.
 */
function bankView() {
  var b = bk(),
    a = function (f, n, l, off) {
      return (
        '<button style="flex:1" onclick="' +
        f +
        '(' +
        n +
        ')"' +
        (off ? ' disabled' : '') +
        '>' +
        l +
        '</button>'
      );
    };
  return (
    '<div class="card"><h2>Bank</h2><p class="log">Balance ' +
    gbp(b) +
    '. Money in the bank can\u2019t be robbed, seized or fined. Only the cash in your pocket is at risk. Your heir inherits half the balance.</p><div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><small>Deposit</small></div><div class="btns" style="flex:1 1 100%">' +
    a('bankIn', 100, '\u00a3100', S.cash < 100) +
    a('bankIn', 1000, '\u00a31k', S.cash < 1000) +
    a('bankIn', 10000, '\u00a310k', S.cash < 10000) +
    a('bankIn', 1e15, 'All', S.cash < 1) +
    '</div></div><div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><small>Withdraw</small></div><div class="btns" style="flex:1 1 100%">' +
    a('bankOut', 100, '\u00a3100', b < 100) +
    a('bankOut', 1000, '\u00a31k', b < 1000) +
    a('bankOut', 10000, '\u00a310k', b < 10000) +
    a('bankOut', 1e15, 'All', b < 1) +
    '</div></div></div>'
  );
}
