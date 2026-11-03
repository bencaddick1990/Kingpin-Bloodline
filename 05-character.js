/* Kingpin: Bloodline  |  js/05-character.js
 * Character creation and heir-naming screens, and starting a game.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * =============  SECTION 11: CREATION-SCREEN INPUT HANDLERS  =================
 * ========================================================================== */
/* Each handler: (1) mutates S.look / S, (2) calls render(), which redraws the
 * preview portrait and highlights. This is the Input -> State -> Render loop. */

/** Sets the head-hair colour. @param {number} i - HCOL index. @returns {void} */
function setHcol(i) {
  S.look.hcol = i;
  render();
}

/** Sets the facial-hair colour. @param {number} i - HCOL index. @returns {void} */
function setFcol(i) {
  S.look.fcol = i;
  render();
}

/** Sets the eye colour. @param {number} i - ECOL index. @returns {void} */
function setEcol(i) {
  S.look.ecol = i;
  render();
}

/**
 * Steps a feature forward/back with wrap-around.
 * MATH: (value + d + 10) % 10. Adding 10 first keeps the result positive
 * when d = -1 at value 0 (JavaScript's % can return negatives), so 0 - 1
 * wraps to 9.
 * @param {string} k - Feature key (e.g. 'hair').
 * @param {number} d - Direction, +1 or -1.
 * @returns {void}
 */
function cyc(k, d) {
  S.look[k] = (S.look[k] + d + 10) % 10;
  render();
}

/** Sets skin tone. @param {number} i - SKIN index. @returns {void} */
function setSkin(i) {
  S.look.skin = i;
  render();
}

/** Re-rolls the entire face for the current gender. @returns {void} */
function randLook() {
  S.look = newLook(S.gender);
  render();
}

/**
 * Cleans a typed name: keeps only letters (any language, via the Unicode
 * property class \p{L}), apostrophes, spaces and hyphens; trims; max 14
 * characters. WHY: names are inserted into HTML strings, so stripping
 * everything else also prevents markup injection.
 * @param {string} v - Raw input.
 * @returns {string} Safe name.
 */
function cl(v) {
  return String(v)
    .replace(/[^\p{L}' -]/gu, '')
    .trim()
    .slice(0, 14);
}

/**
 * Stores a typed name. Typing a first name sets `named`, which stops
 * auto-name replacement when the gender is switched.
 * @param {string} k - 'name' or 'sn' (family name).
 * @param {string} v - Raw input.
 * @returns {void}
 */
function setNm(k, v) {
  S[k] = cl(v);
  if (k === 'name') S.named = true;
}

/**
 * Switches gender. A new face is generated (the face tables differ by
 * gender) but skin, hair and eye colours are carried over so the player's
 * colour choices aren't lost. The first name only auto-changes if the
 * player never typed one.
 * @param {string} g - 'M' or 'F'.
 * @returns {void}
 */
function setGender(g) {
  if (S.gender === g) return;
  var o = S.look;
  S.gender = g;
  S.look = newLook(g);
  S.look.skin = o.skin;
  S.look.hcol = o.hcol;
  S.look.ecol = o.ecol;
  if (!S.named) S.name = pickName(g);
  render();
}

/**
 * "Random name" button: random first name; on the creation screen also a
 * random family name. Resets `named` so a later gender switch can rename.
 * @returns {void}
 */
function rndName() {
  S.name = pickName(S.gender);
  S.named = false;
  if (S.view === 'create') S.sn = famName();
  render();
}

/* ============================================================================
 * ===============  SECTION 12: HEIR NAMING & GAME START  =====================
 * ========================================================================== */

/**
 * Builds the "Name your son/daughter" screen shown after a death.
 * Shows the inherited portrait, the two kept features (KEPT) and a name field.
 * @returns {string} HTML for #app.
 */
function heirNameView() {
  var inp =
      'width:100%;min-height:44px;background:#0B0F14;color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:8px 10px;font:600 16px Barlow,sans-serif',
    w = S.sex === 'Son' ? 'son' : 'daughter';
  return (
    '<div class="top"><h1>Kingpin: Bloodline</h1></div><div class="card"><h2>Name your ' +
    w +
    '</h2><p class="log">Generation ' +
    S.gen +
    ' takes over at 18. They keep their parent\u2019s ' +
    KEPT.join(' and ').toLowerCase() +
    '. The family name stays ' +
    S.sn +
    '.</p><div style="display:flex;justify-content:center;margin:10px 0">' +
    portrait(S.look, 150) +
    '</div><div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><label for="fn"><small>First name</small></label><input id="fn" style="' +
    inp +
    '" maxlength="14" autocomplete="off" value="' +
    S.name +
    '" oninput="setNm(\'name\',this.value)" onchange="this.value=S.name"></div><div class="nm" style="flex:1 1 100%"><small>Family name: ' +
    S.sn +
    '</small></div></div><button class="full" onclick="rndName()">Random name</button><button class="main full" onclick="confirmHeir()">Take over</button></div>'
  );
}

/**
 * Accepts the heir's name and enters the game. The log was written earlier
 * with the heir's temporary random name (S.n0), so every occurrence is
 * replaced with the chosen name via split/join (a replace-all with no regex
 * escaping needed).
 * @returns {void}
 */
function confirmHeir() {
  if (!S.name) S.name = pickName(S.gender);
  var o = S.n0,
    n = S.name;
  if (o && o !== n)
    S.log = S.log.map(function (l) {
      return l.split(o + ' ' + S.sn).join(n + ' ' + S.sn);
    });
  S.view = 'day';
  render();
}

/**
 * "Start" button on the creation screen: fills any blank names, gives the
 * founder two starting relatives (the crew), and moves to the main game view.
 * @returns {void}
 */
function startGame() {
  if (!S.name) S.name = pickName(S.gender);
  if (!S.sn) S.sn = famName();
  S.fam = [mkRel('Sibling', 1, S.sn), mkRel('Cousin', 1, S.sn)];
  S.view = 'day';
  render();
}

/**
 * Builds the character creation screen: pinned preview portrait, name
 * fields, gender buttons, one row per feature (prev/next), colour swatches
 * (hair, facial hair for men, eyes, skin) and Randomise / Start buttons.
 * WHY the portrait is `position:sticky`: it stays visible while the player
 * scrolls through the options (a requested feature).
 * WHY aria-pressed: screen readers announce which swatch is selected.
 * @returns {string} HTML for #app.
 */
function createView() {
  var L = S.look,
    inp =
      'width:100%;min-height:44px;background:#0B0F14;color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:8px 10px;font:600 16px Barlow,sans-serif';
  /* ---- header, intro text and pinned portrait ---- */
  return (
    '<div class="top"><h1>Kingpin: Bloodline</h1></div><div class="card"><h2>Create your character</h2><p class="log">Your skin tone, hair colour, facial hair colour and eye colour pass to every heir. Each new generation keeps two other features and gets new ones for the rest. Switching between male and female gives you a fresh face to match.</p><div style="position:sticky;top:env(safe-area-inset-top,0px);z-index:5;display:flex;justify-content:center;padding:8px 0;margin:10px 0;background:var(--panel);border-bottom:1px solid var(--line)">' +
    portrait(L, 110) +
    '</div>' +
    /* ---- name inputs and random-name button ---- */
    '<div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><label for="fn"><small>First name</small></label><input id="fn" style="' +
    inp +
    '" maxlength="14" autocomplete="off" value="' +
    S.name +
    '" oninput="setNm(\'name\',this.value)" onchange="this.value=S.name"></div><div class="nm" style="flex:1 1 100%"><label for="sn"><small>Family name</small></label><input id="sn" style="' +
    inp +
    '" maxlength="14" autocomplete="off" value="' +
    S.sn +
    '" oninput="setNm(\'sn\',this.value)" onchange="this.value=S.sn"></div><button class="full" style="margin-top:0" onclick="rndName()">Random name</button></div>' +
    /* ---- gender toggle ---- */
    '<div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><small>Gender</small></div><div class="btns" style="flex:1 1 100%"><button style="flex:1" class="' +
    (S.gender === 'M' ? 'main' : '') +
    '" aria-pressed="' +
    (S.gender === 'M') +
    '" onclick="setGender(\'M\')">Male</button><button style="flex:1" class="' +
    (S.gender === 'F' ? 'main' : '') +
    '" aria-pressed="' +
    (S.gender === 'F') +
    '" onclick="setGender(\'F\')">Female</button></div></div>' +
    /* ---- one row per feature (hair, brows, eyes, nose, mouth, head shape, facial hair, accessory) ---- */
    FEAT.map(function (f) {
      var k = f[0],
        lb = flab(f, L.g);
      return (
        '<div class="row"><div class="nm"><small>' +
        lb +
        '</small><b>' +
        fnm(f, L.g)[L[k]] +
        '</b></div><div class="btns"><button aria-label="Previous ' +
        lb.toLowerCase() +
        '" onclick="cyc(\'' +
        k +
        '\',-1)">\u2039</button><button aria-label="Next ' +
        lb.toLowerCase() +
        '" onclick="cyc(\'' +
        k +
        '\',1)">\u203a</button></div></div>'
      );
    }).join('') +
    /* ---- hair colour swatches (outline marks the selected one) ---- */
    '<div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><small>Hair colour</small><b>' +
    HCN[L.hcol | 0] +
    '</b></div><div class="btns" style="flex:1 1 100%;flex-wrap:wrap">' +
    HCOL.map(function (c, i) {
      return (
        '<button aria-label="' +
        HCN[i] +
        ' hair" aria-pressed="' +
        ((L.hcol | 0) === i) +
        '" onclick="setHcol(' +
        i +
        ')" style="flex:1 1 17%;background:' +
        c +
        ';' +
        ((L.hcol | 0) === i ? 'outline:3px solid var(--amber);outline-offset:2px' : '') +
        '"></button>'
      );
    }).join('') +
    '</div></div>' +
    /* ---- facial hair colour (men only; women's "marks" have fixed colours) ---- */
    (L.g === 'M'
      ? '<div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><small>Facial hair colour</small><b>' +
        HCN[L.fcol == null ? L.hcol | 0 : L.fcol | 0] +
        '</b></div><div class="btns" style="flex:1 1 100%;flex-wrap:wrap">' +
        HCOL.map(function (c, i) {
          return (
            '<button aria-label="' +
            HCN[i] +
            ' facial hair" aria-pressed="' +
            ((L.fcol == null ? L.hcol | 0 : L.fcol | 0) === i) +
            '" onclick="setFcol(' +
            i +
            ')" style="flex:1 1 17%;background:' +
            c +
            ';' +
            ((L.fcol == null ? L.hcol | 0 : L.fcol | 0) === i
              ? 'outline:3px solid var(--amber);outline-offset:2px'
              : '') +
            '"></button>'
          );
        }).join('') +
        '</div></div>'
      : '') +
    /* ---- eye colour swatches ---- */
    '<div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><small>Eye colour</small><b>' +
    ECN[L.ecol | 0] +
    '</b></div><div class="btns" style="flex:1 1 100%;flex-wrap:wrap">' +
    ECOL.map(function (c, i) {
      return (
        '<button aria-label="' +
        ECN[i] +
        ' eyes" aria-pressed="' +
        ((L.ecol | 0) === i) +
        '" onclick="setEcol(' +
        i +
        ')" style="flex:1 1 17%;background:' +
        c +
        ';' +
        ((L.ecol | 0) === i ? 'outline:3px solid var(--amber);outline-offset:2px' : '') +
        '"></button>'
      );
    }).join('') +
    '</div></div>' +
    /* ---- skin tone swatches ---- */
    '<div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><small>Skin tone</small><b>' +
    SKINN[L.skin] +
    '</b></div><div class="btns" style="flex:1 1 100%;flex-wrap:wrap">' +
    SKIN.map(function (c, i) {
      return (
        '<button aria-label="' +
        SKINN[i] +
        ' skin tone" aria-pressed="' +
        (L.skin === i) +
        '" onclick="setSkin(' +
        i +
        ')" style="flex:1 1 17%;background:' +
        c +
        ';' +
        (L.skin === i ? 'outline:3px solid var(--amber);outline-offset:2px' : '') +
        '"></button>'
      );
    }).join('') +
    '</div></div>' +
    /* ---- randomise and start ---- */
    '<button class="full" onclick="randLook()">Randomise look</button><button class="main full" onclick="startGame()">Start</button></div>'
  );
}
