/* Kingpin: Bloodline  |  js/11-render.js
 * The renderer: turns the state S into HTML inside #app.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 20: RENDERING (STATE -> HTML)  =============================
 * ============================================================================
 * ========================================================================== */

/**
 * Builds a thin progress bar. The width is the value clamped to 0..100 (%).
 * @param {number} v - Percentage value.
 * @param {string} c - CSS colour for the fill.
 * @returns {string} HTML.
 */
function bar(v, c) {
  return (
    '<div class="bar"><i style="width:' + clamp(v, 0, 100) + '%;background:' + c + '"></i></div>'
  );
}

/**
 * Builds the Heat stat tile.
 * COLOUR MATH: HSL hue 120 = green, 0 = red. hue = 120 - (min(r,60)/60)*120,
 * so heat 0% is green, 30% is yellow-orange, and 60%+ is fully red.
 * (Capping at 60 keeps everything above 60% pure red.)
 * @returns {string} HTML.
 */
function heatStat() {
  var r = heat(undefined, true),
    h = Math.round(120 - (Math.min(r, 60) / 60) * 120);
  return (
    '<div class="stat"><small>Heat</small><div class="num">' +
    Math.round(r) +
    '%</div>' +
    bar(r, 'hsl(' + h + ',55%,52%)') +
    '</div>'
  );
}

/**
 * Builds the game header: portrait, name, age/generation/gender, Menu button,
 * the sticky Cash/Health/Fed/Heat tiles (+ optional tab bar) and the level chip.
 * Health bar turns red under 35; Fed bar turns red at 30 or less.
 * @param {string} [tb] - Optional tab-bar HTML placed inside the sticky area.
 * @returns {string} HTML.
 */
function head(tb) {
  return (
    '<div class="top" style="flex-wrap:nowrap;align-items:center;gap:10px">' +
    portrait(S.look, 44) +
    '<div style="flex:1;min-width:0"><h1 style="font-size:24px;color:var(--amber);line-height:1.1;overflow-wrap:anywhere">' +
    S.name +
    ' ' +
    S.sn +
    '</h1><div class="log">Age ' +
    age() +
    ' \u00b7 Gen ' +
    S.gen +
    ' \u00b7 ' +
    (S.gender === 'F' ? 'Female' : 'Male') +
    '</div></div><button class="mini" onclick="go(\'menu\')">Menu</button></div><div class="stick"><div class="stats"><div class="stat"><small>Cash</small><div class="num">' +
    gbpS(S.cash) +
    '</div></div><div class="stat"><small>Health</small><div class="num">' +
    Math.round(S.hp) +
    '</div>' +
    bar(S.hp, S.hp > 35 ? 'var(--ok)' : 'var(--brick)') +
    '</div><div class="stat"><small>Fed</small><div class="num">' +
    Math.round(S.food) +
    '</div>' +
    bar(S.food, S.food > 30 ? 'var(--amber)' : 'var(--brick)') +
    '</div>' +
    heatStat() +
    '</div>' +
    (tb || '') +
    '</div>' +
    levelChip()
  );
}

/**
 * Builds the recent-events card (newest 4 log lines). Tapping opens the
 * full history menu.
 * @returns {string} HTML.
 */
function logb() {
  return (
    '<div class="card log" onclick="go(\'log\')" style="cursor:pointer">' +
    S.log
      .slice(0, 4)
      .map(function (l) {
        return '<p>' + l + '</p>';
      })
      .join('') +
    '<p style="font-size:12px">Tap for full history</p></div>'
  );
}

/** The day-view tabs, in order: [id, label]. */
var TABS = [
  ['trade', 'Trade'],
  ['food', 'Care'],
  ['go', 'Travel'],
  ['home', 'Home'],
  ['lab', 'Lab'],
  ['guns', 'Gear'],
  ['crew', 'Crew'],
  ['casino', 'Casino'],
];

/**
 * Builds the tab strip. The open tab has class "on"; the tab the tutorial is
 * pointing at (if it isn't open) has class "hint", which makes it glow.
 * @returns {string} HTML.
 */
function tabBar() {
  var hint = tutTab();
  return (
    '<div class="tabs">' +
    TABS.map(function (t) {
      var c = S.tab === t[0] ? 'on' : hint === t[0] ? 'hint' : '';
      return '<button class="' + c + '" onclick="tab(\'' + t[0] + '\')">' + t[1] + '</button>';
    }).join('') +
    '</div>'
  );
}

/**
 * THE RENDERER. Turns the global state S (and menu state M) into HTML and
 * writes it into #app. Called after EVERY state change.
 * DECISION ORDER (first match wins):
 *   1. M set          -> menu overlay (menuView)
 *   2. view 'over'    -> death screen
 *   3. view 'heirname'-> heir naming screen
 *   4. view 'create'  -> character creation
 *   5. S.ev set       -> event popup (arrest, mugging, notice...)
 *   6. otherwise      -> the main day view with the active tab
 * Also: tracks the peak net worth, updates best score on death, then after
 * writing HTML, manages SCROLL (see comments below), save()s, and checks
 * for newly earned achievements (23-achievements.js).
 * @returns {void}
 */
function render() {
  var h = '';
  try {
    stat().peak = Math.max(stat().peak, net());
  } catch (e) {}
  if (M) {
    $('app').innerHTML = menuView();
    return;
  }
  /* ---- DEATH SCREEN: also records a new best score to localStorage ---- */
  if (S.view === 'over') {
    if (LV !== 'over') {
      sfx('death');
      vib([120, 80, 240]);
    }
    var rc = lifeRec(),
      sc = rc.net;
    if (sc > best) {
      best = sc;
      try {
        localStorage.setItem('tn_best', best);
      } catch (e) {}
    }
    var fr = function (a, b) {
      return '<div class="row"><div class="nm">' + a + '</div><b>' + b + '</b></div>';
    };
    h =
      '<div class="top"><h1>Kingpin: Bloodline</h1><div class="day">Gen ' +
      S.gen +
      '</div></div><div class="card"><h2>' +
      rc.n +
      '</h2><p class="lead">' +
      (rc.cause === 'old age' ? 'Died of old age' : 'Died of ' + rc.cause) +
      ' aged ' +
      rc.died +
      ' \u00b7 ' +
      (rc.sx === 'Founder'
        ? 'founder of the bloodline'
        : rc.sx.toLowerCase() + ', generation ' + rc.g) +
      '.</p><div style="display:flex;justify-content:center">' +
      portrait(S.look, 96) +
      '</div><div class="num big">' +
      gbp(sc) +
      '</div><p class="log">Net worth at death. Best on this device: ' +
      gbp(best) +
      '</p>' +
      fr('Level reached', rc.lvl) +
      fr('Peak net worth', gbp(rc.peak)) +
      fr('Units sold', rc.sold) +
      fr('Arrests', rc.arr + ' (' + rc.jail + ' years inside)') +
      fr('Times robbed', rc.rob) +
      fr('Properties', propNames()) +
      '<button class="full" onclick="go(\'tree\')">View family tree</button></div><div class="card"><p class="lead">Your heir inherits half the cash, half your bank balance and half the stock (as much as they can carry)' +
      (S.props && S.props.length ? ', all your properties' : '') +
      ', your bag, your level and your crew. Who takes over?</p><div class="btns"><button class="main" style="flex:1" onclick="heir(\'Son\')">Son</button><button class="main" style="flex:1" onclick="heir(\'Daughter\')">Daughter</button></div></div>';
  }
  /* ---- OTHER FULL-SCREEN VIEWS ---- */
  else if (S.view === 'heirname') {
    h = heirNameView();
  } else if (S.view === 'create') {
    h = createView();
  }
  /* ---- EVENT POPUP: choices carry class k (e.g. "danger"), optional
        sub-text s, and are greyed out when d (disabled) is true ---- */
  else if (S.ev) {
    h =
      head() +
      '<div class="card"><h2>' +
      S.ev.t +
      '</h2><p class="lead">' +
      S.ev.d +
      '</p>' +
      S.ev.c
        .map(function (c, i) {
          return (
            '<button class="opt ' +
            (c.k || '') +
            '"' +
            (c.d ? ' disabled' : '') +
            ' onclick="choose(' +
            i +
            ')">' +
            c.l +
            (c.s ? '<small>' + c.s + '</small>' : '') +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      logb();
  }
  /* ---- MAIN DAY VIEW: header + tab bar, then the card(s) of the active tab ---- */
  else {
    var a = AREAS[S.loc];
    h = head(tabBar());
    /* TUTORIAL: the first-year tip card sits above the tab content (24-tutorial.js). */
    if (tutOn()) h += tutCard();
    /* TRADE TAB: market list. Four buttons per drug in a 2x2 grid (.btns.trade):
   Buy 1 / Buy max (disabled if you can't afford one unit at the buy price or
   pockets are full) and Sell 1 / Sell max (disabled with nothing held).
   Normally one price is shown. If you've already traded this drug here this
   visit, the buy and sell prices can differ (see buyAt/sellAt), so both are
   shown. Spike/cheap tags come from S.flag, with the matching headline from
   S.news underneath (25-news.js). */
    if (S.tab === 'trade') {
      h +=
        '<div class="card"><h2>' +
        a.n +
        ' market</h2><small class="log">Pockets: ' +
        carried() +
        ' of ' +
        cap() +
        '</small>' +
        ug()
          .map(function (g) {
            var q = S.inv[g.id],
              bp = buyAt(g.id),
              sp = sellAt(g.id),
              f = S.flag[g.id],
              no = S.cash < bp || carried() >= cap();
            return (
              '<div class="row"><div class="nm"><b>' +
              g.n +
              '</b> ' +
              (bp === sp ? gbp(bp) : 'Buy ' + gbp(bp) + ' \u00b7 Sell ' + gbp(sp)) +
              (f
                ? ' <span class="' +
                  (f > 0 ? 'up' : 'down') +
                  '">' +
                  (f > 0 ? 'spike' : 'cheap') +
                  '</span>'
                : '') +
              newsLine(g.id, f, (S.news || {})[g.id], S.loc) +
              '<small>Holding ' +
              q +
              (q ? ' \u00b7 paid avg ' + gbp(S.paid[g.id]) : '') +
              '</small>' +
              (DEVR ? '<small style="color:var(--sleet)">' + rng(g) + '</small>' : '') +
              '</div>' +
              '<div class="btns trade"><button class="buy" onclick="buy(\'' +
              g.id +
              '\',1)" ' +
              (no ? 'disabled' : '') +
              '>Buy 1</button><button class="buy" onclick="buy(\'' +
              g.id +
              '\',99999)" ' +
              (no ? 'disabled' : '') +
              '>Buy max</button>' +
              '<button class="sell" onclick="sell(\'' +
              g.id +
              '\',1)" ' +
              (q ? '' : 'disabled') +
              '>Sell 1</button><button class="sell" onclick="sell(\'' +
              g.id +
              '\')" ' +
              (q ? '' : 'disabled') +
              '>Sell max</button></div></div>'
            );
          })
          .join('') +
        '</div>';
    }
    /* ODD JOBS sit under the market; CARE TAB = food and medicine cards */
    if (S.tab === 'trade') h += jobsView();
    if (S.tab === 'food') {
      h +=
        '<div class="card"><h2>Food</h2>' +
        FOOD.map(function (f, i) {
          return (
            '<div class="row"><div class="nm"><b>' +
            f.n +
            '</b> ' +
            gbp(f.c) +
            '<small>+' +
            f.f +
            ' fed' +
            (f.h ? ', +' + f.h + ' health' : '') +
            '</small></div><button onclick="eat(' +
            i +
            ')" ' +
            (S.cash < f.c ? 'disabled' : '') +
            '>Buy</button></div>'
          );
        }).join('') +
        '<p class="log">Each year you lose 30 fed. At zero you lose 15 health. Well fed and indoors, you heal.</p></div><div class="card"><h2>Medicine</h2>' +
        MEDS.map(function (m, i) {
          return (
            '<div class="row"><div class="nm"><b>' +
            m.n +
            '</b> ' +
            gbp(m.c) +
            '<small>+' +
            m.h +
            ' health</small></div><button onclick="heal(' +
            i +
            ')" ' +
            (S.cash < m.c || S.hp >= 100 ? 'disabled' : '') +
            '>Buy</button></div>'
          );
        }).join('') +
        '</div>';
    }
    /* TRAVEL TAB: districts, fares and tip-offs (26-intel.js) */
    if (S.tab === 'go') h += travelView();
    /* HOME TAB: safe + bank + this district's property card (propView). Buying here needs cash PLUS the 80% resale of the property here that you'd replace; blocked() adds the already-owned, level and lock rules. */
    if (S.tab === 'home') h += safeView() + bankView() + propView();
    /* REMAINING TABS delegate to their own builders */
    if (S.tab === 'home') h += bribeView();
    if (S.tab === 'lab') h += labView();
    if (S.tab === 'guns') h += gunView() + bagView();
    if (S.tab === 'crew') h += crewView();
    if (S.tab === 'casino') h += casinoView();
    /* FOOTER (every day-view tab): tonight's bed, recent log, and the fixed end-year button */
    h +=
      '<p class="log">This year: ' +
      tonight().n +
      '</p>' +
      logb() +
      '<div class="endbar"><button class="main full' +
      (tutEndHint() ? ' hint' : '') +
      '" onclick="endDay()">Let the year pass</button></div>';
  }
  /* ---- WRITE TO THE PAGE + SCROLL MANAGEMENT ----
   WHY: replacing innerHTML resets scroll to the top, which feels awful when
   you just bought something. So:
   nv (new view)     = an event just opened, or the view changed -> scroll to top.
   tn (tab switch)   = same view, different tab -> keep the header/tab bar in
                       place: compute `ty`, the page position where the header
                       block ends (window.scrollY + its bottom edge + 10px
                       margin - the safe-area padding). The target `tg` is the
                       smaller of the old scroll and ty so we never sit
                       hidden under the header. A temporary min-height on #app
                       (`need` = target + viewport height) guarantees the new
                       content is tall enough to scroll to that position.
   otherwise         = restore the old scroll position (pY).
   The tab strip's own horizontal scroll (sl) is also preserved, and the
   active tab is nudged fully into view (+8px padding). */
  var nv = (!!S.ev && S.ev !== LEV) || S.view !== LV,
    tn = !nv && S.tab !== LT;
  LEV = S.ev || null;
  LV = S.view;
  LT = S.tab;
  var ot = document.querySelector('.tabs'),
    sl = ot ? ot.scrollLeft : 0,
    pY = window.scrollY,
    ap = $('app');
  ap.innerHTML = h;
  if (nv) {
    ap.style.minHeight = '';
    window.scrollTo(0, 0);
  } else if (tn) {
    ap.style.minHeight = '';
    var tp = document.querySelector('.top');
    if (tp) {
      var ty =
          window.scrollY +
          tp.getBoundingClientRect().bottom +
          10 -
          (parseFloat(getComputedStyle(document.documentElement).paddingTop) || 0),
        tg = pY > ty ? ty : pY,
        need = tg + window.innerHeight;
      if (ap.offsetHeight < need) ap.style.minHeight = need + 'px';
      window.scrollTo(0, tg);
    }
  }
  var nt = document.querySelector('.tabs');
  if (nt) {
    nt.scrollLeft = sl;
    var on = nt.querySelector('button.on');
    if (on) {
      var r = on.getBoundingClientRect(),
        q = nt.getBoundingClientRect();
      if (r.left < q.left) nt.scrollLeft -= q.left - r.left + 8;
      else if (r.right > q.right) nt.scrollLeft += r.right - q.right + 8;
    }
  }
  save();
  achCheck();
}
