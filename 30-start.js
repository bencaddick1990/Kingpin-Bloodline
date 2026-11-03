/* Kingpin: Bloodline  |  js/30-start.js
 * The animated start screen.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 36: START SCREEN & BOOT SEQUENCE  ==========================
 * ============================================================================
 * ========================================================================== */
/* The start screen (#start in index.html) is a separate UI from the in-game
 * menus. Its animation is class-driven (see style.css section 7):
 *   (none) -> p1 -> p2 -> p3 -> p4, timed by stIntro(). */

/** ST: the #start overlay element. STT: pending intro timer ids (so they can be cancelled). */
var ST = document.getElementById('start'),
  STT = [];

/** Is there a valid saved game? @returns {boolean} */
function hasSave() {
  return !!load();
}

/**
 * Fills the start-screen panel with one of its views and scrolls it to the top.
 * VIEWS: 'main' (New / Load / How to play / Achievements / Settings / Quit
 * + version), 'confirm' (erase existing save?), 'help', 'settings', 'ach',
 * anything else = the "Thanks for playing"
 * quit message. The `.sub` class hides the big title on every sub-view so
 * they have room.
 * @param {string} v - View id.
 * @returns {void}
 */
function stPanel(v) {
  var p = document.getElementById('st-panel'),
    h = '';
  ST.classList.toggle('sub', v !== 'main');
  if (v === 'main') {
    var hs = hasSave();
    h =
      '<button class="main opt" onclick="stNew()">New Game</button><button class="opt" onclick="stLoad()"' +
      (hs ? '' : ' disabled') +
      '>Load Game' +
      (hs ? '' : '<small>No saved game found</small>') +
      '</button><button class="opt" onclick="stPanel(\'help\')">How to Play</button><button class="opt" onclick="stPanel(\'ach\')">Achievements</button><button class="opt" onclick="stPanel(\'settings\')">Settings</button><button class="opt" onclick="stQuit()">Quit</button><p class="log" style="text-align:center;margin-top:14px">Version ' +
      VERSION +
      '</p>';
  } else if (v === 'confirm')
    h =
      '<div class="card"><h2>Start a new game?</h2><p class="lead">This erases your saved character and their whole family line. You can\u2019t undo it.</p><button class="danger full" onclick="stBegin()">Yes, start over</button><button class="full" onclick="stPanel(\'main\')">Cancel</button></div>';
  else if (v === 'settings') h = settingsView("stPanel('main')");
  else if (v === 'ach') h = achView("stPanel('main')");
  else if (v === 'help')
    h =
      '<div class="card"><h2>How to play</h2>' +
      HELP +
      '<button class="main full" onclick="stPanel(\'main\')">Back</button></div>';
  else
    h =
      '<div class="card"><h2>Thanks for playing</h2><p class="lead">You can close this tab or window now. Your game saves automatically.</p><button class="main full" onclick="stPanel(\'main\')">Back to menu</button></div>';
  p.innerHTML = h;
  document.getElementById('st-main').scrollTop = 0;
}

/** Hides the start overlay and reveals the game (#app). @returns {void} */
function stHide() {
  ST.style.display = 'none';
  $('app').style.display = '';
}

/** "New Game": asks for confirmation first if a save exists (it would be erased). @returns {void} */
function stNew() {
  if (hasSave()) stPanel('confirm');
  else stBegin();
}

/** Starts a fresh game: clears any open menu, hides the start screen, builds new state. @returns {void} */
function stBegin() {
  M = null;
  stHide();
  newGame();
}

/**
 * "Load Game": loads the validated save into S, clears any stale event, and
 * settles any casino game that was mid-spin when the page closed.
 * @returns {void}
 */
function stLoad() {
  var s = load();
  if (!s) return;
  S = s;
  S.ev = null;
  M = null;
  casResolve();
  stHide();
  render();
}

/**
 * "Quit": browsers only allow window.close() on windows a script opened, so
 * this usually does nothing; the panel then tells the player to close the tab.
 * @returns {void}
 */
function stQuit() {
  try {
    window.close();
  } catch (e) {}
  stPanel('quit');
}

/**
 * "Quit to title" from the in-game menu: saves, shows the start overlay again
 * (already in its final state: classes p3 and p4) and displays the main panel.
 * @returns {void}
 */
function toTitle() {
  M = null;
  try {
    save();
  } catch (e) {}
  ST.style.display = 'flex';
  $('app').style.display = 'none';
  ST.className = 'p3 p4';
  stPanel('main');
}

/** Skips the intro animation: cancels timers and jumps to the final state. @returns {void} */
function stSkip() {
  STT.forEach(clearTimeout);
  STT = [];
  ST.className = 'p3 p4';
}

/**
 * Plays the intro. Timeline (milliseconds after start):
 *   60 -> p1: logo fades in (and slowly zooms)     3500 -> p2: logo fades out
 *   4600 -> p3: title fades up                     6400 -> p4: menu appears
 * Players who turned the intro off in Settings, or whose device asks for
 * reduced motion, skip straight to the final state. Every
 * timer id is stored in STT so a click (stSkip) can cancel the rest.
 * @returns {void}
 */
function stIntro() {
  STT.forEach(clearTimeout);
  STT = [];
  ST.className = '';
  stPanel('main');
  if (!SET.intro || (window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches)) {
    ST.className = 'p3 p4';
    return;
  }
  [
    [60, 'p1'],
    [3500, 'p2'],
    [4600, 'p3'],
    [6400, 'p4'],
  ].forEach(function (s) {
    STT.push(
      setTimeout(function () {
        ST.classList.add(s[1]);
      }, s[0]),
    );
  });
}
