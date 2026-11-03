/* Kingpin: Bloodline  |  js/21-settings.js
 * Player settings: sound, volume, vibration, tutorial and intro animation.
 * Settings belong to the DEVICE, not to a save game, so they live in their own
 * localStorage key ("kb_settings") and survive New Game and every heir.
 * The same settings card is shown from the in-game Menu and the start screen. */

/** Default for every setting. A stored value is only used if it has the same
 *  type as the default here, so a damaged or old value can never break the game. */
var SETTINGS_DEFAULT = {
  sound: true /* sound effects on/off */,
  volume: 70 /* 0..100 */,
  vibrate: true /* buzz on danger (phones that support it) */,
  tutorial: true /* show the first-year tutorial in a new game */,
  intro: true /* play the logo animation on the start screen */,
};

/** SET: the live settings object, read everywhere (e.g. SET.sound). */
var SET = loadSettings();

/**
 * Reads settings from localStorage, falling back to the defaults.
 * @returns {Object} A complete settings object.
 */
function loadSettings() {
  var o = Object.assign({}, SETTINGS_DEFAULT);
  try {
    var j = JSON.parse(localStorage.getItem('kb_settings') || 'null');
    if (j && typeof j === 'object')
      Object.keys(SETTINGS_DEFAULT).forEach(function (k) {
        if (typeof j[k] === typeof SETTINGS_DEFAULT[k]) o[k] = j[k];
      });
  } catch (e) {}
  return o;
}

/** Writes SET to localStorage (errors, e.g. private mode, are ignored). @returns {void} */
function saveSettings() {
  try {
    localStorage.setItem('kb_settings', JSON.stringify(SET));
  } catch (e) {}
}

/**
 * Flips an on/off setting, saves it and redraws whichever screen is showing.
 * Turning the tutorial back ON during a first-generation first year restarts
 * it straight away; otherwise it shows at the start of the next new game.
 * @param {string} k - Setting key (sound, vibrate, tutorial, intro).
 * @returns {void}
 */
function setOpt(k) {
  SET[k] = !SET[k];
  saveSettings();
  if (k === 'tutorial' && SET.tutorial && S && S.gen === 1 && S.day === 1) S.tut = 0;
  if (k === 'sound' && SET.sound) sfx('good');
  if (k === 'vibrate' && SET.vibrate) vib(60);
  refreshSettings();
}

/**
 * Volume slider handler. While dragging ('input') it only updates the number
 * label, because a full redraw would replace the slider under your finger.
 * @param {string|number} v - New volume 0..100.
 * @returns {void}
 */
function setVol(v) {
  SET.volume = clamp(Math.round(+v || 0), 0, 100);
  var l = $('vol-n');
  if (l) l.textContent = SET.volume + '%';
}

/** Slider released ('change'): save, and play a sample so you hear the level. @returns {void} */
function volDone() {
  saveSettings();
  sfx('sell', true);
}

/** Redraws the settings card wherever it is open (start screen or game menu). @returns {void} */
function refreshSettings() {
  if (ST && ST.style.display !== 'none') stPanel('settings');
  else render();
}

/**
 * Builds the settings card.
 * @param {string} backJs - JavaScript for the Back button's onclick.
 * @returns {string} HTML.
 */
function settingsView(backJs) {
  var row = function (k, name, info) {
    var on = !!SET[k];
    return (
      '<div class="row"><div class="nm"><b>' +
      name +
      '</b><small>' +
      info +
      '</small></div><button class="toggle' +
      (on ? ' sel' : '') +
      '" role="switch" aria-checked="' +
      on +
      '" onclick="setOpt(\'' +
      k +
      '\')">' +
      (on ? 'On' : 'Off') +
      '</button></div>'
    );
  };
  return (
    '<div class="card"><h2>Settings</h2>' +
    row('sound', 'Sound effects', 'Taps, trades, sirens and the casino.') +
    '<div class="row"><div class="nm"><b>Volume</b> <span id="vol-n">' +
    SET.volume +
    '%</span><input class="slider" type="range" min="0" max="100" step="5" value="' +
    SET.volume +
    '" aria-label="Volume" oninput="setVol(this.value)" onchange="volDone()"' +
    (SET.sound ? '' : ' disabled') +
    '></div></div>' +
    row('vibrate', 'Vibration', 'Buzz when you are robbed or the police show up.') +
    row('tutorial', 'First-year tutorial', 'Short tips during your first year of a new game.') +
    row('intro', 'Intro animation', 'The logo and title sequence when the game opens.') +
    '<button class="main full" onclick="' +
    backJs +
    '">Back</button></div>'
  );
}
