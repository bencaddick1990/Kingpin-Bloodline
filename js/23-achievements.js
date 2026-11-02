/* Kingpin: Bloodline  |  js/23-achievements.js
 * Achievements (15) and the toast notices that announce them.
 * Achievements belong to the DEVICE, like the best score: once earned they stay
 * earned through New Game and every heir. They are stored in localStorage as
 * "kb_ach" = { id: time earned (ms) }.
 * HOW THEY ARE EARNED:
 *  - Most have a `test` that looks at the game state. achCheck() runs them
 *    after every render, so they unlock the moment the condition is true.
 *  - A few are moments, not states (winning a bet, escaping the police). The
 *    code where that happens calls achHit('id') directly. */

/** The list, in the order shown. n = name, d = how to earn it. */
var ACH = [
  {
    id: 'first_sale',
    n: 'First Deal',
    d: 'Sell your first unit.',
    test: function () {
      return stat().sold > 0;
    },
  },
  { id: 'insider', n: 'Insider Info', d: 'Pay a contact for a tip-off.' },
  {
    id: 'roof',
    n: 'Roof Over Your Head',
    d: 'Buy your first property.',
    test: function () {
      return (S.props || []).length > 0;
    },
  },
  {
    id: 'armed',
    n: 'Tooled Up',
    d: 'Own a weapon.',
    test: function () {
      return (S.guns || []).length > 0;
    },
  },
  {
    id: 'bribe',
    n: 'Friends in High Places',
    d: 'Pay off the police.',
    test: function () {
      return !!S.bribe;
    },
  },
  { id: 'cook', n: 'Home Cooking', d: 'Start a batch in your own lab.' },
  {
    id: 'crew',
    n: 'Family Business',
    d: 'Put a relative to work.',
    test: function () {
      return (S.fam || []).some(function (r) {
        return !!r.task;
      });
    },
  },
  { id: 'casino', n: 'Beginner’s Luck', d: 'Win a bet at the casino.' },
  { id: 'getaway', n: 'Clean Getaway', d: 'Escape an arrest by running, fighting or bribing.' },
  {
    id: 'jail',
    n: 'Done Time',
    d: 'Serve a prison sentence.',
    test: function () {
      return stat().jail > 0;
    },
  },
  {
    id: 'tenk',
    n: 'Five Figures',
    d: 'Reach a net worth of £10,000.',
    test: function () {
      return net() >= 1e4;
    },
  },
  {
    id: 'million',
    n: 'Millionaire',
    d: 'Reach a net worth of £1,000,000.',
    test: function () {
      return net() >= 1e6;
    },
  },
  {
    id: 'empire',
    n: 'Empire',
    d: 'Own a property in every district.',
    test: function () {
      return AREAS.every(function (a, i) {
        return !!PA(i);
      });
    },
  },
  {
    id: 'kingpin',
    n: 'Kingpin',
    d: 'Reach level 20.',
    test: function () {
      return lvl() >= 20;
    },
  },
  {
    id: 'dynasty',
    n: 'Dynasty',
    d: 'Hand the business down to a third generation.',
    test: function () {
      return S.gen >= 3;
    },
  },
];

/** ACHV: what this device has earned, { id: timestamp }. */
var ACHV = {};
try {
  ACHV = JSON.parse(localStorage.getItem('kb_ach') || '{}') || {};
} catch (e) {}

/** How many achievements are earned. @returns {number} */
function achCount() {
  return ACH.filter(function (a) {
    return ACHV[a.id];
  }).length;
}

/**
 * Unlocks an achievement (once): saves it, plays a sound and shows a toast.
 * @param {string} id - Achievement id from ACH.
 * @returns {void}
 */
function achHit(id) {
  if (ACHV[id]) return;
  var a = ACH.filter(function (x) {
    return x.id === id;
  })[0];
  if (!a) return;
  ACHV[id] = Date.now();
  try {
    localStorage.setItem('kb_ach', JSON.stringify(ACHV));
  } catch (e) {}
  sfx('ach');
  toast('Achievement unlocked', a.n + ' · ' + achCount() + ' of ' + ACH.length);
}

/**
 * Runs every state-based test that isn't earned yet. Called at the end of
 * render(). Skipped on the character-creation screen (nothing has happened
 * yet). A test that throws (e.g. on an odd old save) just counts as "not yet".
 * @returns {void}
 */
function achCheck() {
  if (!S || S.view === 'create') return;
  ACH.forEach(function (a) {
    if (ACHV[a.id] || !a.test) return;
    var ok = false;
    try {
      ok = a.test();
    } catch (e) {}
    if (ok) achHit(a.id);
  });
}

/** Dev tool: forget every achievement on this device. @returns {void} */
function achReset() {
  ACHV = {};
  try {
    localStorage.removeItem('kb_ach');
  } catch (e) {}
}

/**
 * Builds the achievements card.
 * @param {string} backJs - JavaScript for the Back button's onclick.
 * @returns {string} HTML.
 */
function achView(backJs) {
  return (
    '<div class="card"><h2>Achievements</h2><p class="log">' +
    achCount() +
    ' of ' +
    ACH.length +
    ' earned on this device. They stay earned through new games and every heir.</p>' +
    ACH.map(function (a) {
      var t = ACHV[a.id];
      return (
        '<div class="row ach' +
        (t ? ' got' : '') +
        '"><div class="badge" aria-hidden="true">' +
        (t ? '★' : '☆') +
        '</div><div class="nm"><b>' +
        a.n +
        '</b><small>' +
        a.d +
        (t ? ' Earned ' + new Date(t).toLocaleDateString('en-GB') + '.' : '') +
        '</small></div></div>'
      );
    }).join('') +
    '<button class="main full" onclick="' +
    backJs +
    '">Back</button></div>'
  );
}

/* ============================================================================
 * TOASTS: small notices that slide in at the top and fade out on their own.
 * They live in #toast (outside #app), so a re-render never wipes one.
 * ========================================================================== */

/**
 * Shows a toast for about 3.5 seconds. Several toasts stack.
 * @param {string} title - Bold first line.
 * @param {string} text - Second line.
 * @returns {void}
 */
function toast(title, text) {
  var box = $('toast');
  if (!box) return;
  var el = document.createElement('div');
  el.className = 'toast-item';
  el.innerHTML = '<b>' + title + '</b><span>' + text + '</span>';
  el.onclick = function () {
    el.remove();
  };
  box.appendChild(el);
  while (box.children.length > 3) box.removeChild(box.firstChild); /* show at most 3 */
  setTimeout(function () {
    el.classList.add('out');
  }, 3200);
  setTimeout(function () {
    el.remove();
  }, 3700);
}
