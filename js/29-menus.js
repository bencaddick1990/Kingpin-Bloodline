/* Kingpin: Bloodline  |  js/29-menus.js
 * In-game menus and navigation.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 35: MENUS & NAVIGATION  ====================================
 * ============================================================================
 * ========================================================================== */
/* M is the open menu screen (null = none). render() shows menuView() whenever
 * M is set, so "opening a menu" is just: set M, call render(). */

/**
 * Opens a menu screen. For screens you may need to come back from (help,
 * confirm, tree, assign, settings, ach) the PREVIOUS menu is remembered in MB.
 * @param {string} m - Menu id.
 * @returns {void}
 */
function go(m) {
  if (['help', 'confirm', 'tree', 'assign', 'settings', 'ach'].indexOf(m) >= 0) MB = M;
  M = m;
  render();
}

/** Returns to the remembered previous menu (MB), then clears MB. @returns {void} */
function back() {
  M = MB;
  MB = null;
  render();
}

/**
 * Builds the HTML for whichever menu is open.
 * SCREENS (in order): log (full history), tree (family tree), settings,
 * ach (achievements), assign
 * (choose a drug for a relative), help, confirm (new-game confirmation),
 * devpw (password prompt), dev (dev tools), and the default main menu.
 * The assign list shows drugs you may trade: for 'sell' any unlocked drug,
 * for 'cook' only drugs whose equipment you own.
 * The main menu has Resume / How to play / Family tree / Achievements /
 * Settings / New game / Dev tools (only when DEV_TOOLS is on) / Quit to title.
 * @returns {string} HTML.
 */
function menuView() {
  var t = '<div class="top"><h1>Kingpin: Bloodline</h1></div>';
  if (M === 'log')
    return (
      t +
      '<div class="card"><h2>History</h2><p class="log">Everything this character has been through.</p>' +
      S.log
        .map(function (l) {
          return '<p class="lead" style="font-size:14px">' + l + '</p>';
        })
        .join('') +
      '<button class="main full" onclick="M=null;render()">Back</button></div>'
    );
  if (M === 'tree') return t + treeView();
  if (M === 'settings') return t + settingsView('back()');
  if (M === 'ach') return t + achView('back()');
  if (M === 'assign') {
    var k = AS.k,
      pp = P(),
      list = ug().filter(function (g) {
        return k === 'sell' || (pp && pp.eq && pp.eq[g.id]);
      });
    return (
      t +
      '<div class="card"><h2>' +
      (k === 'cook' ? 'Cook which drug?' : 'Sell which drug?') +
      '</h2><p class="log">' +
      S.fam[AS.i].n +
      '. ' +
      (k === 'cook'
        ? 'Needs the lab and equipment for that drug.'
        : 'Sells up to 10 units a year from your safe in ' + AREAS[S.loc].n + '.') +
      '</p>' +
      (list.length
        ? list
            .map(function (g) {
              return '<button class="opt" onclick="setTask(\'' + g.id + '\')">' + g.n + '</button>';
            })
            .join('')
        : '<p class="lead">Nothing available yet.</p>') +
      '<button class="full" onclick="back()">Cancel</button></div>'
    );
  }
  if (M === 'help')
    return (
      t +
      '<div class="card"><h2>How to play</h2>' +
      HELP +
      '<button class="main full" onclick="back()">Back</button></div>'
    );
  if (M === 'confirm')
    return (
      t +
      '<div class="card"><h2>Start a new game?</h2><p class="lead">This erases your current character and their whole family line. You can’t undo it.</p><button class="danger full" onclick="M=null;newGame()">Yes, start over</button><button class="full" onclick="back()">Cancel</button></div>'
    );
  if (M === 'devpw') {
    var pi =
      'width:100%;min-height:44px;background:#0B0F14;color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:8px 10px;font:600 16px Barlow,sans-serif';
    return (
      t +
      '<div class="card"><h2>Dev tools</h2><p class="log">Enter the password to continue.</p><label for="dpw"><small class="log">Password</small></label><input id="dpw" type="password" style="' +
      pi +
      '" autocomplete="off" autocapitalize="off" onkeydown="if(event.key===\'Enter\')devCheck()">' +
      (DERR ? '<p class="up" role="alert" style="margin:8px 0 0">Wrong password.</p>' : '') +
      '<button class="main full" onclick="devCheck()">Unlock</button><button class="full" onclick="go(\'menu\')">Cancel</button></div>'
    );
  }
  if (M === 'dev') {
    var d = function (l, a, x) {
        return (
          '<button style="flex:1;min-width:30%" onclick="dv(\'' +
          a +
          "','" +
          (x === undefined ? '' : x) +
          '\')">' +
          l +
          '</button>'
        );
      },
      g = function (s) {
        return '<div class="btns" style="flex-wrap:wrap;margin-bottom:12px">' + s + '</div>';
      };
    return (
      t +
      '<div class="card"><h2>Dev tools</h2><p class="log">Cash ' +
      gbp(S.cash) +
      ' · Age ' +
      age() +
      ' · Pockets ' +
      carried() +
      '/' +
      cap() +
      '</p><p class="lead"><b>Money</b></p>' +
      g(
        d('+£1k', 'cash', 1000) +
          d('+£10k', 'cash', 10000) +
          d('+£100k', 'cash', 100000) +
          d('+£1m', 'cash', 1000000),
      ) +
      '<p class="lead"><b>Stock (fills free pockets)</b></p>' +
      g(
        GOODS.map(function (x) {
          return d(x.n, 'fill', x.id);
        }).join('') + d('Clear', 'clear'),
      ) +
      '<p class="lead"><b>Player</b></p>' +
      g(
        d('Heal and feed', 'heal') +
          d('Reroll prices', 'roll') +
          d('Top property + lab here', 'manor') +
          d('Price ranges: ' + (DEVR ? 'ON' : 'OFF'), 'range') +
          d('+100 XP', 'xp', 100) +
          d('+1000 XP', 'xp', 1000) +
          d('+5000 XP', 'xp', 5000),
      ) +
      '<p class="lead"><b>Time</b></p>' +
      g(
        d('+1 year', 'year') +
          d('Jump to 67', 'old') +
          d('Reset casino plays', 'cas') +
          d('End this life', 'die'),
      ) +
      '<p class="lead"><b>Polish</b></p>' +
      g(
        d('Reset achievements', 'achreset') +
          d('Restart tutorial', 'tut') +
          d('Toast test', 'toast'),
      ) +
      '<button class="main full" onclick="go(\'menu\')">Back</button></div>'
    );
  }
  /* ---- default: the main in-game menu ---- */
  return (
    t +
    '<div class="card"><h2>Menu</h2><button class="main opt" onclick="M=null;render()">Resume</button><button class="opt" onclick="go(\'help\')">How to play</button><button class="opt" onclick="go(\'tree\')">Family tree</button><button class="opt" onclick="go(\'ach\')">Achievements<small>' +
    achCount() +
    ' of ' +
    ACH.length +
    ' earned</small></button><button class="opt" onclick="go(\'settings\')">Settings</button><button class="opt" onclick="go(\'confirm\')">New game</button>' +
    (DEV_TOOLS ? '<button class="opt" onclick="devGate()">Dev tools</button>' : '') +
    '<button class="opt" onclick="toTitle()">Quit to title</button><p class="log">Your game saves automatically.</p><p class="log" style="text-align:center">Version ' +
    VERSION +
    '</p></div>'
  );
}
