/* Kingpin: Bloodline  |  js/22-audio.js
 * Sound effects and vibration.
 * Every sound is SYNTHESISED with the Web Audio API (oscillators and filtered
 * noise), so there are no audio files to download, license or load, and it all
 * works offline. Call sfx('name') from game code; vib(ms) for a buzz.
 * Browsers only allow audio after the player has tapped something, so the
 * audio engine is created lazily on the first sound (always inside a tap). */

/** AC: the shared AudioContext (null until first used, or if unsupported).
 *  MASTER: the master volume node every sound goes through.
 *  SFX_AT: when each sound last played (stops the same sound stacking up).
 *  SFX_LAST: when ANY sound last played (used by the automatic tap sound). */
var AC = null,
  MASTER = null,
  SFX_AT = {},
  SFX_LAST = 0;

/**
 * SOUND RECIPES. Each sound is a list of notes, played together or in turn:
 *   [start (s), frequency (Hz), length (s), wave type, loudness 0..1, slide-to Hz]
 * A note with frequency 0 is a burst of NOISE instead (frequency in the
 * 6th slot is the filter centre, so noise can "whoosh" from one pitch to another).
 * Wave types: sine (soft), triangle (mellow), square (retro), sawtooth (harsh).
 */
var SOUNDS = {
  tap: [[0, 1250, 0.035, 'sine', 0.1]],
  buy: [
    [0, 660, 0.06, 'square', 0.06],
    [0.06, 990, 0.08, 'square', 0.06],
  ],
  sell: [
    [0, 1320, 0.07, 'triangle', 0.16],
    [0.07, 1760, 0.14, 'triangle', 0.16],
  ],
  eat: [
    [0, 420, 0.08, 'sine', 0.2],
    [0.08, 520, 0.1, 'sine', 0.2],
  ],
  heal: [
    [0, 523, 0.1, 'sine', 0.18],
    [0.1, 784, 0.2, 'sine', 0.18],
  ],
  travel: [
    [0, 0, 0.45, 'bandpass', 0.35, 300, 1600],
    [0.05, 220, 0.3, 'sine', 0.05, 330],
  ],
  year: [
    [0, 196, 0.9, 'sine', 0.28],
    [0, 294, 0.8, 'sine', 0.12],
    [0, 392, 1.0, 'triangle', 0.05],
  ],
  level: [
    [0, 523, 0.12, 'square', 0.07],
    [0.1, 659, 0.12, 'square', 0.07],
    [0.2, 784, 0.12, 'square', 0.07],
    [0.3, 1047, 0.4, 'square', 0.07],
  ],
  ach: [
    [0, 784, 0.1, 'triangle', 0.2],
    [0.09, 988, 0.1, 'triangle', 0.2],
    [0.18, 1175, 0.1, 'triangle', 0.2],
    [0.27, 1568, 0.5, 'triangle', 0.2],
    [0.27, 2350, 0.3, 'sine', 0.05],
  ],
  siren: [
    [0, 650, 0.35, 'sawtooth', 0.05, 950],
    [0.35, 950, 0.35, 'sawtooth', 0.05, 650],
    [0.7, 650, 0.35, 'sawtooth', 0.05, 950],
    [1.05, 950, 0.35, 'sawtooth', 0.05, 650],
  ],
  danger: [
    [0, 110, 0.4, 'sawtooth', 0.12, 70],
    [0, 155, 0.4, 'square', 0.04, 100],
  ],
  good: [
    [0, 523, 0.1, 'triangle', 0.2],
    [0.1, 784, 0.25, 'triangle', 0.2],
  ],
  bad: [
    [0, 392, 0.18, 'triangle', 0.2],
    [0.16, 311, 0.18, 'triangle', 0.2],
    [0.32, 233, 0.45, 'triangle', 0.2],
  ],
  card: [[0, 0, 0.06, 'highpass', 0.3, 2500, 2500]],
  spin: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (i) {
    return [i * 0.07 + i * i * 0.004, 1500, 0.02, 'square', 0.03];
  }),
  win: [
    [0, 784, 0.08, 'square', 0.07],
    [0.08, 1047, 0.08, 'square', 0.07],
    [0.16, 1319, 0.08, 'square', 0.07],
    [0.24, 1568, 0.35, 'square', 0.07],
  ],
  lose: [
    [0, 330, 0.15, 'sawtooth', 0.05],
    [0.15, 247, 0.35, 'sawtooth', 0.05],
  ],
  death: [
    [0, 220, 0.7, 'sine', 0.25],
    [0.55, 196, 0.7, 'sine', 0.25],
    [1.1, 147, 1.4, 'sine', 0.25],
  ],
};

/**
 * Returns the audio engine, creating it on first use. Returns null when the
 * browser has no Web Audio support, so callers simply stay silent.
 * @returns {AudioContext|null}
 */
function audio() {
  if (!AC) {
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try {
      AC = new C();
      MASTER = AC.createGain();
      MASTER.connect(AC.destination);
    } catch (e) {
      AC = null;
      return null;
    }
  }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}

/** One white-noise buffer, made once and reused by every noise note. */
var NOISE = null;
function noiseBuf(ac) {
  if (!NOISE) {
    NOISE = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    var d = NOISE.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return NOISE;
}

/**
 * Plays one note of a recipe (see SOUNDS).
 * The volume envelope ramps up in 10 ms and fades out exponentially, which
 * avoids clicks at the start and end of each note.
 * @param {AudioContext} ac
 * @param {number} t0 - Absolute start time (seconds, AudioContext clock).
 * @param {Array} n - [start, freq, length, type, loudness, slideTo/filterFrom, filterTo]
 * @returns {void}
 */
function playNote(ac, t0, n) {
  var t = t0 + n[0],
    len = n[2],
    g = ac.createGain(),
    src;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(n[4], t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  if (n[1] === 0) {
    /* noise burst through a sweeping filter */
    src = ac.createBufferSource();
    src.buffer = noiseBuf(ac);
    var f = ac.createBiquadFilter();
    f.type = n[3];
    f.frequency.setValueAtTime(n[5], t);
    f.frequency.exponentialRampToValueAtTime(n[6], t + len);
    src.connect(f);
    f.connect(g);
  } else {
    src = ac.createOscillator();
    src.type = n[3];
    src.frequency.setValueAtTime(n[1], t);
    if (n[5]) src.frequency.exponentialRampToValueAtTime(n[5], t + len);
    src.connect(g);
  }
  g.connect(MASTER);
  src.start(t);
  src.stop(t + len + 0.03);
}

/**
 * PLAYS A SOUND EFFECT by name, if sound is on.
 * The same sound can't restart within 120 ms, so several things happening in
 * one tap (e.g. two police tiers) don't stack into a racket.
 * @param {string} name - A key of SOUNDS.
 * @param {boolean} [force] - Play even if the same sound just played.
 * @returns {void}
 */
function sfx(name, force) {
  if (!SET.sound || !SOUNDS[name]) return;
  var now = Date.now();
  if (!force && now - (SFX_AT[name] || 0) < 120) return;
  SFX_AT[name] = SFX_LAST = now;
  var ac = audio();
  if (!ac) return;
  try {
    MASTER.gain.setValueAtTime(Math.pow(SET.volume / 100, 2), ac.currentTime);
    var t0 = ac.currentTime + 0.01;
    SOUNDS[name].forEach(function (n) {
      playNote(ac, t0, n);
    });
  } catch (e) {}
}

/**
 * Vibrates the phone, if vibration is on and the device supports it.
 * @param {number|number[]} p - Milliseconds, or an on/off pattern.
 * @returns {void}
 */
function vib(p) {
  if (!SET.vibrate || !navigator.vibrate) return;
  try {
    navigator.vibrate(p);
  } catch (e) {}
}

/**
 * Wires up the automatic sounds. Called once from 99-boot.js.
 *  - TAP: every enabled button click plays a soft tap, UNLESS the action it
 *    ran already played its own sound (inline onclick handlers run before this
 *    listener, so SFX_LAST tells us whether they did).
 *  - Audio pauses while the app is in the background and resumes on return.
 * @returns {void}
 */
function audioInit() {
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (b && !b.disabled && Date.now() - SFX_LAST > 60) sfx('tap');
  });
  document.addEventListener('visibilitychange', function () {
    if (!AC) return;
    if (document.hidden) AC.suspend();
    else AC.resume();
  });
}
