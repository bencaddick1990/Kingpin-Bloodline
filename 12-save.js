/* Kingpin: Bloodline  |  js/12-save.js
 * Saving and loading (localStorage) with old-save migrations.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 21: SAVE & LOAD (localStorage)  ============================
 * ============================================================================
 * ========================================================================== */

/**
 * Saves the game to localStorage key "tn_save" as JSON, stamped v:4.
 * GUARD: never saves while an event popup is open (S.ev). WHY: events hold
 * functions (choice callbacks) that JSON cannot store, and saving mid-event
 * could capture a half-resolved decision. Errors (private mode, full
 * storage) are swallowed so the game still runs.
 * @returns {void}
 */
function save() {
  if (S.ev) return;
  try {
    localStorage.setItem('tn_save', JSON.stringify(Object.assign({}, S, { v: 4 })));
  } catch (e) {}
}

/**
 * Reads and VALIDATES a saved game, upgrading old formats.
 * Accepts versions 2, 3 and 4 that contain the essentials (inv, prices, day).
 * MIGRATIONS applied:
 *   v2 -> properties were renumbered when Hostel was added, so prop.i++.
 *   missing family name -> generates names and starting relatives.
 *   missing gender      -> inferred from heir sex.
 *   look / ancestors' looks -> repaired by fixLook().
 *   missing stats / bag / bank -> sensible defaults.
 * @returns {Object|null} A usable state object, or null if none/corrupt.
 */
function load() {
  try {
    var j = localStorage.getItem('tn_save');
    if (j) {
      var s = JSON.parse(j);
      if (s && (s.v === 2 || s.v === 3 || s.v === 4) && s.inv && s.prices && s.day) {
        if (s.v === 2 && s.prop) s.prop.i++;
        /* MIGRATION (v0.51): older saves held a single S.prop. Move it into the S.props array, and tag crew tasks with the district they work in (or stand them down if there is none). */
        if (!s.props) {
          s.props = s.prop ? [s.prop] : [];
        }
        delete s.prop;
        (s.fam || []).forEach(function (r) {
          if (r.task && r.task.p == null) {
            if (s.props.length) r.task.p = s.props[0].loc;
            else r.task = null;
          }
        });
        if (!s.sn) {
          s.sn = famName();
          s.name = pickName(Math.random() < 0.5 ? 'M' : 'F');
          s.fam = [mkRel('Sibling', s.gen || 1, s.sn), mkRel('Cousin', s.gen || 1, s.sn)];
          s.line = s.line || [];
        }
        if (!s.gender) s.gender = s.sex === 'Daughter' ? 'F' : 'M';
        s.look = fixLook(s.look, s.gender);
        (s.line || []).forEach(function (r) {
          r.look = fixLook(r.look, r.sx === 'Daughter' ? 'F' : 'M');
        });
        if (!s.st) s.st = { sold: 0, jail: 0, arr: 0, rob: 0, peak: 0 };
        if (s.bag == null) s.bag = -1;
        if (s.bank == null) s.bank = 0;
        /* MIGRATION (one board per district per year): older saves rolled a new
           board on every visit and kept tip-off boards in s.pre. Seed this
           year's boards from what the save already shows, so prices on screen
           and tips already paid for stay exactly as they were. */
        if (!s.yb) {
          s.yb = { d: s.day, b: {} };
          Object.keys(s.pre || {}).forEach(function (k) {
            var t = s.pre[k];
            if (t && t.d === s.day && t.base) s.yb.b[k] = { base: t.base, flag: t.flag || {}, news: t.news || {} };
          });
          if (s.base) s.yb.b[s.loc] = { base: s.base, flag: s.flag || {}, news: s.news || {} };
        }
        s.v = 4;
        return s;
      }
    }
  } catch (e) {}
  return null;
}
