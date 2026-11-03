/* Kingpin: Bloodline  |  js/28-dev.js
 * Developer tools (hidden in release builds, see DEV_TOOLS in 01-config.js).
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 34: DEVELOPER TOOLS  =======================================
 * ============================================================================
 * ========================================================================== */
/* Reached from Menu -> Dev tools after entering a password, and only while
 * DEV_TOOLS is true (01-config.js). Set DEV_TOOLS = false for store builds:
 * the password check runs on the player's device, so it only keeps out the
 * curious. The switch is what actually removes the tools. */

/**
 * Runs one dev action, then saves and redraws.
 * ACTIONS:
 *   cash   : add money (x = pounds).
 *   fill   : fill free pocket slots with drug x at the current price
 *            (updates the weighted average price paid).
 *   clear  : empty pockets.          heal : health and fed to 100.
 *   roll   : re-roll today's prices.
 *   range  : toggle the "price range" hints (persisted as tn_devr).
 *   xp     : add x XP (may trigger a level-up popup).
 *   year   : skip one year (batches finish, XP is awarded, markets cool,
 *            new prices); ends the life if past the final year.
 *   cas    : reset casino plays.
 *   old    : jump to the final year (age 67).
 *   die    : end the life now.
 *   toast  : show a test toast.
 *   achreset : forget every achievement on this device.
 *   tut    : turn the tutorial on and restart it (shows in year 1, gen 1).
 *   manor  : give the TOP property (the last PROPS entry) with a lab and
 *            all equipment, here.
 * @param {string} a - Action code.
 * @param {string|number} [x] - Argument (strings come from onclick HTML).
 * @returns {void}
 */
function dv(a, x) {
  if (a === 'cash') S.cash += +x;
  else if (a === 'fill') {
    var f = cap() - carried();
    if (f > 0) {
      var q = S.inv[x];
      S.paid[x] = (S.paid[x] * q + S.prices[x] * f) / (q + f);
      S.inv[x] += f;
    }
  } else if (a === 'clear')
    GOODS.forEach(function (g) {
      S.inv[g.id] = 0;
      S.paid[g.id] = 0;
    });
  else if (a === 'heal') {
    S.hp = 100;
    S.food = 100;
  } else if (a === 'roll') {
    if (S.yb && S.yb.b) delete S.yb.b[S.loc];
    roll();
  }
  else if (a === 'range') {
    DEVR = !DEVR;
    try {
      localStorage.setItem('tn_devr', DEVR ? '1' : '');
    } catch (e) {}
  } else if (a === 'xp') gainXp(+x);
  else if (a === 'year') {
    S.day++;
    finishBatches(true);
    yearXp();
    coolMarkets(1);
    roll();
    if (S.day > DAYS) {
      S.view = 'over';
      M = null;
    }
  } else if (a === 'cas') S.cas = null;
  else if (a === 'old') S.day = DAYS;
  else if (a === 'die') {
    S.hp = 0;
    S.view = 'over';
    M = null;
  } else if (a === 'achreset') achReset();
  else if (a === 'toast') toast('Test notice', 'Toasts appear here.');
  else if (a === 'tut') {
    SET.tutorial = true;
    saveSettings();
    S.tut = 0;
    M = null;
  } else if (a === 'manor') {
    var e = {};
    GOODS.forEach(function (g) {
      e[g.id] = 1;
    });
    setP({ i: PROPS.length - 1, loc: S.loc, lab: true, eq: e });
  }
  save();
  render();
}

/** True when the last password attempt was wrong (shows the red message). */
var DERR = false;

/** Opens the password prompt (clears any old error). @returns {void} */
function devGate() {
  if (!DEV_TOOLS) return;
  DERR = false;
  go('devpw');
}

/**
 * FNV-1a: turns a string into a short fingerprint (8 hex digits). Used so the
 * dev password itself never appears in the code, only its fingerprint.
 * @param {string} s
 * @returns {string}
 */
function strHash(s) {
  var x = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return x.toString(16);
}

/**
 * Checks the typed password (case-sensitive) against DEV_PW_HASH.
 * Right: open the dev tools. Wrong: set the error flag and redraw the prompt.
 * To change the password, run strHash('NewPassword') in the browser console
 * and paste the result into DEV_PW_HASH in 01-config.js.
 * @returns {void}
 */
function devCheck() {
  var el = $('dpw'),
    v = el ? el.value : '';
  if (DEV_TOOLS && strHash(v) === DEV_PW_HASH) {
    DERR = false;
    go('dev');
  } else {
    DERR = true;
    render();
  }
}
