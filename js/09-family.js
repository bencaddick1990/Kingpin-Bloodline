/* Kingpin: Bloodline  |  js/09-family.js
 * The family crew (relatives working for you) and the family tree screen.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ===========================  SECTION 17: FAMILY CREW  ======================
 * ========================================================================== */

/**
 * Builds the Crew tab: one row per relative with Cook / Sell / Stand down.
 * Crew work at a SPECIFIC property: assigning uses the property in the district
 * you are standing in, and each row shows where that relative currently works.
 * A relative's buttons are disabled with no property here or while jailed. The
 * Cook button is also disabled when that property has no room (room(p) < 1).
 * @returns {string} HTML.
 */
function crewView() {
  var p = P(),
    c =
      '<div class="card"><h2>Family crew</h2><p class="log">Relatives work for you at a property. Each relative works one property, so assign them while you are in that district. Cooks start a batch of up to 10 each year for a 15% fee on ingredients. Sellers sell up to 10 units a year from that property\u2019s safe for a 15% cut. They can get arrested.</p>';
  if (!S.fam || !S.fam.length) return c + '<p class="lead">No relatives to call on.</p></div>';
  return (
    c +
    S.fam
      .map(function (r, i) {
        var t = r.task,
          stt =
            r.jail > 0
              ? 'In jail for ' + r.jail + ' more year' + (r.jail > 1 ? 's' : '')
              : t
                ? (t.k === 'cook' ? 'Cooking ' : 'Selling ') +
                  gd(t.d).n +
                  (AREAS[t.p] ? ' in ' + AREAS[t.p].n : '')
                : 'Free',
          off = !p || r.jail > 0 ? ' disabled' : '';
        return (
          '<div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><b>' +
          r.n +
          '</b> \u00b7 ' +
          relLabel(r) +
          '<small>' +
          stt +
          '</small></div><div class="btns" style="flex:1 1 100%"><button style="flex:1" onclick="assign(' +
          i +
          ",'cook')\"" +
          (off || (room(p) < 1 ? ' disabled' : '')) +
          '>Cook' +
          (!off && room(p) < 1 ? ' (no room)' : '') +
          '</button><button style="flex:1" onclick="assign(' +
          i +
          ",'sell')\"" +
          off +
          '>Sell</button><button style="flex:1" onclick="standDown(' +
          i +
          ')"' +
          (t ? '' : ' disabled') +
          '>Stand down</button></div></div>'
        );
      })
      .join('') +
    (p
      ? ''
      : '<p class="log">You have no property in ' +
        AREAS[S.loc].n +
        '. Go to one of your properties to assign crew there.</p>') +
    '</div>'
  );
}

/**
 * Opens the "which drug?" picker for a relative. (go() stores the menu to
 * return to, so Cancel works.)
 * @param {number} i - Relative index in S.fam.
 * @param {string} k - 'cook' or 'sell'.
 * @returns {void}
 */
function assign(i, k) {
  AS = { i: i, k: k };
  go('assign');
}

/**
 * Confirms the picker: stores the task (and the district, p, of the property it runs at) on the relative and closes the menu.
 * @param {string} id - Drug id.
 * @returns {void}
 */
function setTask(id) {
  S.fam[AS.i].task = { k: AS.k, d: id, p: S.loc };
  M = null;
  render();
}

/** Cancels a relative's task. @param {number} i - Relative index. @returns {void} */
function standDown(i) {
  S.fam[i].task = null;
  render();
}

/**
 * Runs every relative's job at the year turn and reports results in one popup.
 * Each task runs at the property in the district stored in task.p, using THAT
 * property's lab, equipment, safe and room.
 *  - Jailed relatives count down one year.
 *  - A relative whose property is gone (sold or evicted) is stood down.
 *  - COOK: needs a lab, that drug's equipment and no batch already running.
 *    quantity n = min(10, free room, affordable) where each unit costs
 *    ingredients * 1.15 (the 15% family fee). Batch is queued as a normal
 *    batch whose cost basis u INCLUDES the fee, so the fee counts as a cost
 *    against the XP margin when the units are sold.
 *  - SELL: up to 10 units from that safe. BUST CHANCE = 8% * that district's
 *    heat * (1 - bribe cut) (the `pick()*100<...` compares a 0..100 number to a
 *    percentage). Bust = lose the units (booked as an XP loss at the safe's
 *    cost basis) and 2-4 years jail.
 *    REVENUE: price = average(lo,hi) * district bias * random(0.85..1.15);
 *    pay = units * price * 0.85 (15% cut to the family).
 *    XP margin = pay - units * safe cost basis (sp), so the seller's cut is a cost.
 * @returns {void}
 */
function crewYear() {
  var out = [];
  if (!S.fam) return;
  S.fam.forEach(function (r) {
    if (r.jail > 0) {
      r.jail--;
      if (!r.jail) out.push(r.n + ' is out of jail.');
      return;
    }
    var t = r.task;
    if (!t) return;
    var p = PA(t.p);
    if (!p) {
      r.task = null;
      out.push(r.n + ' has no property to work at and stood down.');
      return;
    }
    var g = gd(t.d),
      wh = ' in ' + AREAS[p.loc].n;
    if (t.k === 'cook') {
      if (!p.lab || !(p.eq && p.eq[t.d]) || (p.batch && p.batch[t.d])) return;
      var u = ing(g),
        n = Math.min(10, room(p), Math.floor(S.cash / (u * 1.15)));
      if (n < 1) {
        out.push(r.n + ' couldn\u2019t start ' + g.n + wh + ': no space or cash.');
        return;
      }
      var cost = Math.round(u * n * 1.15);
      S.cash -= cost;
      (p.batch = p.batch || {})[t.d] = { n: n, u: cost / n, c: 1 };
      /* u = per-unit cost incl. the 15% fee */ out.push(
        r.n + ' started ' + n + ' ' + g.n + wh + ' for ' + gbp(cost) + '.',
      );
    } else {
      var sf = p.safe || {},
        sp = (p.sp = p.sp || {}),
        cb = sp[t.d] || 0,
        q = Math.min(10, sf[t.d] || 0);
      if (q < 1) return;
      if (pick() * 100 < 8 * AREAS[p.loc].heat * (1 - (S.bribe ? PROT[S.bribe.l].cut : 0))) {
        xpLoss(q * cb);
        sf[t.d] -= q;
        if (!sf[t.d]) sp[t.d] = 0;
        r.jail = 2 + Math.floor(Math.random() * 3);
        r.task = null;
        out.push(
          r.n +
            ' was busted selling ' +
            g.n +
            wh +
            ' and lost ' +
            q +
            ' units. Jailed for ' +
            r.jail +
            ' years.',
        );
        return;
      }
      var pr = Math.round(((g.lo + g.hi) / 2) * AREAS[p.loc].b[t.d] * rnd(0.85, 1.15)),
        rev = Math.round(q * pr * 0.85);
      sf[t.d] -= q;
      if (!sf[t.d]) sp[t.d] = 0;
      S.cash += rev;
      yp().p += rev - q * cb;
      stat().sold += q;
      out.push(r.n + ' sold ' + q + ' ' + g.n + wh + ' for ' + gbp(rev) + '.');
    }
  });
  if (out.length) note('Crew report', out.join('<br>'));
}

/* ============================================================================
 * ===========================  SECTION 18: FAMILY TREE  ======================
 * ========================================================================== */

/**
 * Builds the Family tree card: every dead ancestor (S.line) top to bottom,
 * plus the living character (or, on the death screen, the just-dead one,
 * added to the list temporarily). The header sums the net worth of all
 * those who came before.
 * @returns {string} HTML.
 */
function treeView() {
  var L = (S.line || []).slice();
  if (S.view === 'over') L.push(lifeRec());
  var tot = 0;
  L.forEach(function (r) {
    tot += r.net;
  });
  var h =
    '<div class="card"><h2>Family tree</h2><p class="log">' +
    S.sn +
    ' bloodline \u00b7 generation ' +
    S.gen +
    '. Wealth left behind by those who came before: ' +
    gbp(tot) +
    '.</p>';
  L.forEach(function (r, i) {
    h +=
      '<div class="row" style="border-left:3px solid var(--amber);padding-left:10px;margin-left:4px">' +
      portrait(r.look, 52) +
      '<div class="nm"><b>' +
      r.n +
      '</b> \u00b7 ' +
      r.sx +
      ' \u00b7 Gen ' +
      r.g +
      '<small>Died aged ' +
      r.died +
      ' of ' +
      r.cause +
      '. Net worth ' +
      gbp(r.net) +
      ', level ' +
      r.lvl +
      ', ' +
      r.sold +
      ' units sold, ' +
      r.arr +
      ' arrest' +
      (r.arr === 1 ? '' : 's') +
      ' (' +
      r.jail +
      ' yrs inside), robbed ' +
      r.rob +
      ' time' +
      (r.rob === 1 ? '' : 's') +
      '.</small></div></div>' +
      (i < L.length - 1 || S.view !== 'over'
        ? '<div style="text-align:center;color:var(--dim)">\u2193</div>'
        : '');
  });
  if (S.view !== 'over')
    h +=
      '<div class="row" style="border-left:3px solid var(--ok);padding-left:10px;margin-left:4px">' +
      portrait(S.look, 52) +
      '<div class="nm"><b>' +
      S.name +
      ' ' +
      S.sn +
      '</b> \u00b7 ' +
      (S.sex || 'Founder') +
      ' \u00b7 Gen ' +
      S.gen +
      '<small>Alive, aged ' +
      age() +
      '. Net worth ' +
      gbp(net()) +
      ', level ' +
      lvl() +
      '.</small></div></div>';
  return h + '<button class="main full" onclick="back()">Back</button></div>';
}
