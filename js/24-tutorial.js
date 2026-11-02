/* Kingpin: Bloodline  |  js/24-tutorial.js
 * The short first-year tutorial.
 * It shows a tip card above the tab content during the FIRST year of a NEW
 * game (generation 1, year 1), one step at a time. "Next" moves on and opens
 * the tab the next tip is about, which glows (class .hint). Every card has a
 * "Turn tutorial off" button, and Settings can turn it back on.
 * Finishing or turning it off sets SET.tutorial = false, so it won't repeat
 * in later new games unless the player switches it on again.
 * State: S.tut = current step (missing = 0), or -1 once finished/skipped. */

/** The steps. tab = the tab this tip is about (null = the end-year button). */
var TUT = [
  {
    tab: 'trade',
    t: 'Welcome to the streets',
    d: 'You’re 18 with £100. This is the market in the district you’re standing in. Buy low and sell high: prices differ between districts and change every year. A <span class="down">cheap</span> or <span class="up">spike</span> tag comes with a news story saying why.',
  },
  {
    tab: 'go',
    t: 'Getting around',
    d: 'Sell where prices are better. Each trip costs a small fare, and if you’re broke you walk, which makes you hungrier. Pay a contact for a tip-off to see a district’s prices before you go. Carrying stock raises your Heat, the chance the police come for you.',
  },
  {
    tab: 'food',
    t: 'Stay alive',
    d: 'You lose 30 fed every year, and at zero your health drops. Eat here, and buy medicine when you’re hurt. At 68, or if your health hits zero, your son or daughter takes over.',
  },
  {
    tab: 'home',
    t: 'Shelter and savings',
    d: 'Sleeping rough is cold, and you’re far more likely to be robbed or arrested. Buy a hostel bed as soon as you can afford one. Cash in the bank can’t be stolen.',
  },
  {
    tab: null,
    t: 'Your first year',
    d: 'Buy something cheap, travel, and sell it where it’s dear. When you’re done, press <b>Let the year pass</b>. How to play and Settings are in the Menu.',
  },
];

/** Is the tutorial showing right now? @returns {boolean} */
function tutOn() {
  return (
    !!SET.tutorial &&
    !!S &&
    S.gen === 1 &&
    S.day === 1 &&
    S.tut !== -1 &&
    S.view === 'day' &&
    !S.ev &&
    !M
  );
}

/** Current step index (0-based). @returns {number} */
function tutStep() {
  return clamp(S.tut || 0, 0, TUT.length - 1);
}

/** Which tab should glow (null for none / the end-year button). @returns {string|null} */
function tutTab() {
  return tutOn() ? TUT[tutStep()].tab : null;
}

/** Does the end-year button glow (last step)? @returns {boolean} */
function tutEndHint() {
  return tutOn() && tutStep() === TUT.length - 1;
}

/** "Next": go to the next step and open its tab; on the last step, finish. @returns {void} */
function tutNext() {
  var i = tutStep() + 1;
  if (i >= TUT.length) return tutOff(false);
  S.tut = i;
  if (TUT[i].tab) S.tab = TUT[i].tab;
  render();
}

/**
 * Ends the tutorial for this game and for future new games.
 * @param {boolean} skipped - True when the player turned it off early (shows a reminder toast).
 * @returns {void}
 */
function tutOff(skipped) {
  S.tut = -1;
  SET.tutorial = false;
  saveSettings();
  if (skipped) toast('Tutorial off', 'You can turn it back on in Settings.');
  render();
}

/** Builds the tip card for the current step. @returns {string} HTML. */
function tutCard() {
  var i = tutStep(),
    s = TUT[i],
    last = i === TUT.length - 1;
  return (
    '<div class="card tut"><small class="log">Tutorial · ' +
    (i + 1) +
    ' of ' +
    TUT.length +
    '</small><h2>' +
    s.t +
    '</h2><p class="lead">' +
    s.d +
    '</p><div class="btns"><button class="main" style="flex:1" onclick="tutNext()">' +
    (last ? 'Got it' : 'Next') +
    '</button><button style="flex:1" onclick="tutOff(true)">Turn tutorial off</button></div></div>'
  );
}
