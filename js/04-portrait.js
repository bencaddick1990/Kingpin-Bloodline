/* Kingpin: Bloodline  |  js/04-portrait.js
 * The procedural SVG portrait: head geometry, features, hair, beards, accessories.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * =================  SECTION 7: HEAD GEOMETRY (MATH CORE)  ===================
 * ========================================================================== */
/* The face is drawn on a 100x100 SVG canvas, centred at x=50.
 * Each head shape is 8 numbers describing HALF of a symmetric outline:
 *   [hw, cw, top, ch, jx, jy, cx, cy]
 *    hw  : half-width at the temples (y=22)
 *    cw  : half-width at the cheeks  (y=54)
 *    top : y of the top of the skull
 *    ch  : size of the corner cut at the top (bigger = rounder skull)
 *    jx  : half-width where the jaw ends (at height jy)
 *    jy  : y of the jaw corner
 *    cx  : half-width of the chin flat bottom
 *    cy  : y of the chin bottom
 * Because every outline is just these numbers, hair, beards and hats can
 * be computed from the SAME numbers and always fit the head. */
var HEAD = {
  M: [
    [27, 27, 14, 5, 25, 74, 19, 82],
    [22, 22, 12, 8, 16, 78, 3, 92],
    [25, 26, 12, 12, 24, 70, 12, 84],
    [28, 29, 15, 4, 28, 72, 20, 82],
    [28, 24, 13, 8, 18, 74, 6, 88],
    [24, 24, 12, 6, 22, 78, 15, 90],
    [22, 27, 13, 10, 22, 72, 8, 88],
    [26, 28, 16, 12, 25, 68, 13, 80],
    [21, 24, 14, 8, 26, 74, 18, 84],
    [25, 26, 14, 5, 23, 76, 9, 92],
  ],
  F: [
    [22, 20, 14, 6, 20, 74, 10, 84],
    [21, 15, 13, 8, 15, 75, 3, 90],
    [23, 22, 12, 12, 21, 73, 13, 85],
    [20, 16, 12, 6, 16, 74, 7, 84],
    [24, 18, 13, 8, 17, 70, 3, 90],
    [22, 19, 12, 10, 19, 76, 10, 87],
    [21, 15, 14, 6, 15, 74, 6, 82],
    [23, 22, 15, 4, 22, 75, 14, 84],
    [20, 16, 14, 8, 16, 72, 8, 80],
    [22, 20, 13, 5, 20, 77, 11, 86],
  ],
};

/**
 * Looks up a look's head shape and returns it as a named object.
 * `h0` is the "reference hair half-width" the hair paths were drawn for
 * (26 for men, 22 for women); hx() compares it to the real width to scale hair.
 * @param {Object} l - A look.
 * @returns {{hw:number,cw:number,top:number,ch:number,jx:number,jy:number,cx:number,cy:number,h0:number}}
 */
function hd(l) {
  var g = l.g === 'F' ? 'F' : 'M',
    a = HEAD[g][l.chin | 0];
  return {
    hw: a[0],
    cw: a[1],
    top: a[2],
    ch: a[3],
    jx: a[4],
    jy: a[5],
    cx: a[6],
    cy: a[7],
    h0: g === 'F' ? 22 : 26,
  };
}

/**
 * Builds the SVG path string for the face outline.
 * HOW: starts top-left, walks clockwise through the key points, using the
 * centre x=50 +/- the half-widths to mirror both sides:
 *   left temple -> top-left corner -> top edge -> right temple -> right cheek
 *   -> right jaw -> right chin -> chin bottom -> left chin -> left jaw
 *   -> left cheek -> close.
 * "H" draws a horizontal line, "L" a diagonal one, "Z" closes the shape.
 * @param {Object} s - Head shape from hd().
 * @returns {string} SVG path data.
 */
function faceD(s) {
  return (
    'M' +
    (50 - s.hw) +
    ' 22L' +
    (50 - s.hw + s.ch) +
    ' ' +
    s.top +
    'H' +
    (50 + s.hw - s.ch) +
    'L' +
    (50 + s.hw) +
    ' 22L' +
    (50 + s.cw) +
    ' 54L' +
    (50 + s.jx) +
    ' ' +
    s.jy +
    'L' +
    (50 + s.cx) +
    ' ' +
    s.cy +
    'H' +
    (50 - s.cx) +
    'L' +
    (50 - s.jx) +
    ' ' +
    s.jy +
    'L' +
    (50 - s.cw) +
    ' 54Z'
  );
}

/**
 * EH = "Edge Half-width": how far the face outline is from the centre line
 * at a given height. Used so beards and earrings follow the true face edge.
 * MATH (linear interpolation, "lerp"): between two known widths a and b, the
 * width at fraction t is a + (b - a) * t.
 *   - From the temples (y=22) to the cheeks (y=54): t=(y-22)/32, clamped 0..1.
 *   - From the cheeks (y=54) to the jaw corner (y=jy): t=(y-54)/(jy-54).
 *   - From the jaw corner to the chin (y=cy): t=(y-jy)/(cy-jy), clamped.
 * @param {Object} s - Head shape from hd().
 * @param {number} y - Height on the 100-unit canvas.
 * @returns {number} Half-width at that height.
 */
function EH(s, y) {
  if (y <= 54) return s.hw + (s.cw - s.hw) * clamp((y - 22) / 32, 0, 1);
  if (y <= s.jy) return s.cw + ((s.jx - s.cw) * (y - 54)) / (s.jy - 54);
  return s.jx + (s.cx - s.jx) * clamp((y - s.jy) / (s.cy - s.jy), 0, 1);
}

/**
 * Fits a hair/headband shape to the current head by scaling it.
 * MATH: an SVG matrix(a b c d e f) maps x' = a*x + c*y + e, y' = b*x + d*y + f.
 *   sx = w / h0          -> horizontal stretch so hair width matches the head.
 *   sy = (46 - top) / 32 -> vertical stretch; the original hair top sat at
 *                           y=14 (= 46 - 32), so this lands it on the real top.
 *   e = 50 - 50*sx       -> keeps the centre line x=50 fixed while scaling.
 *   f = 46 - 46*sy       -> keeps the eye line y=46 fixed while scaling.
 * @param {Object} s - Head shape from hd().
 * @param {number} w - Target half-width.
 * @param {string} body - SVG markup to scale.
 * @returns {string} The markup wrapped in a transform group ('' if body is empty).
 */
function hx(s, w, body) {
  if (!body) return '';
  var sx = w / s.h0,
    sy = (46 - s.top) / 32;
  return (
    '<g transform="matrix(' +
    sx +
    ' 0 0 ' +
    sy +
    ' ' +
    (50 - 50 * sx) +
    ' ' +
    (46 - 46 * sy) +
    ')">' +
    body +
    '</g>'
  );
}

/**
 * Builds the outline path of one eye's lid shape (the left eye, x 31..46).
 * MATH (quadratic Bezier "Q"): the curve starts at the outer corner, bends
 * TOWARD a control point and ends at the inner corner. Top lid control is
 * (38.5, 46+ty), bottom lid is (38.5, 46+by). A negative ty lifts the upper
 * lid (eye opens wider); a bigger by drops the lower lid. `ot`/`it` shift the
 * outer/inner corners up or down to tilt the eye.
 * @param {Object} e - Eye spec from EYE[...].
 * @returns {string} SVG path data.
 */
function eyeP(e) {
  var ot = e.ot || 0,
    it = e.it || 0;
  return (
    'M31 ' +
    (46 + ot) +
    'Q38.5 ' +
    (46 + e.ty) +
    ' 46 ' +
    (46 + it) +
    'Q38.5 ' +
    (46 + e.by) +
    ' 31 ' +
    (46 + ot) +
    'Z'
  );
}

/**
 * Mirrors a drawing to produce both sides of the face from one definition.
 * MATH: matrix(-1 0 0 1 100 0) gives x' = -x + 100, i.e. a reflection across
 * the vertical line x=50, y unchanged. Draw the left half once; mirror it.
 * @param {string} s - SVG markup for the left side.
 * @returns {string} Left markup plus its mirrored copy.
 */
function mir(s) {
  return '<g>' + s + '</g><g transform="matrix(-1 0 0 1 100 0)">' + s + '</g>';
}

/* ============================================================================
 * ===========  SECTION 8: FEATURE DRAWING DATA (EYES/BROWS/NOSE/MOUTH)  ======
 * ========================================================================== */

/** EYE specs per gender (10 each).
 *  ty/by : top and bottom lid control offsets (see eyeP).
 *  pr    : pupil radius.            lid : thick upper-lid line (sleepy look).
 *  py    : pupil vertical nudge.    sh  : eye-shadow strength (0-2).
 *  l     : eyelash count (women).   bag : under-eye bag line.
 *  ot/it : outer/inner corner tilt. */
var EYE = {
  M: [
    { ty: -3, by: 4, pr: 1.6 },
    { ty: -9, by: 10, pr: 2.5 },
    { ty: -11, by: 12, pr: 3 },
    { ty: -4, by: 5, pr: 2, lid: 3.5, py: 0.5 },
    { ot: -2, it: 2, ty: -5, by: 6, pr: 2, lid: 2 },
    { ty: -3, by: 6, pr: 2, lid: 4 },
    { ty: -4, by: 4, pr: 1.8, sh: 1 },
    { ty: -1, by: 2, pr: 1.1 },
    { ty: -8, by: 8, pr: 3.2 },
    { ty: -4, by: 5, pr: 2, bag: 1 },
  ],
  F: [
    { ty: -6, by: 7, pr: 2.4, l: 1 },
    { ty: -9, by: 10, pr: 2.9, l: 1 },
    { ty: -10, by: 11, pr: 3.1, l: 2 },
    { ty: -5, by: 6, pr: 2.2, lid: 2.5, l: 1 },
    { ot: -3, it: 1, ty: -6, by: 6, pr: 2.2, l: 1, lid: 2 },
    { ty: -3, by: 4, pr: 1.6, lid: 3, l: 1 },
    { ty: -7, by: 7, pr: 2.5, l: 2, sh: 1 },
    { ot: 3, it: -1, ty: -6, by: 6, pr: 2.3, l: 1 },
    { ty: -4, by: 5, pr: 1.8, l: 1 },
    { ty: -6, by: 7, pr: 2.4, l: 1, sh: 2 },
  ],
};

/**
 * Draws ONE eye (the left one; mir() makes the pair).
 * LAYER ORDER (bottom to top): optional shadow ellipse -> white eyeball ->
 * iris+pupil+glint (clipped to the eye shape so the iris never spills out)
 * -> lid outline -> optional heavy lid line -> optional bag -> lashes.
 * MATH: the pupil's vertical centre is the average of the corner heights
 * ((ot+it)/2) plus the average lid opening ((ty+by)/4 is the midpoint of
 * the two lid curves, which only reach halfway to their control points).
 * @param {Object} e - Eye spec.
 * @param {string} ec - Iris colour hex.
 * @param {string} cid - id of the clipPath that matches this eye's shape.
 * @returns {string} SVG markup.
 */
function eyeS(e, ec, cid) {
  var ot = e.ot || 0,
    it = e.it || 0,
    ty = e.ty,
    by = e.by,
    yo = 46 + ot,
    yi = 46 + it,
    o = '';
  if (e.sh)
    o +=
      '<ellipse cx="38.5" cy="46" rx="9" ry="' +
      (4 + e.sh * 2) +
      '" fill="#000" opacity="' +
      (0.18 + 0.1 * e.sh) +
      '"/>';
  o +=
    '<path d="M31 ' +
    yo +
    'Q38.5 ' +
    (46 + ty) +
    ' 46 ' +
    yi +
    'Q38.5 ' +
    (46 + by) +
    ' 31 ' +
    yo +
    'Z" fill="#fff" stroke="#000" stroke-width="2"/>';
  var py = 46 + (ot + it) / 2 + (ty + by) / 4 + (e.py || 0);
  o +=
    '<g clip-path="url(#' +
    cid +
    ')"><circle cx="39.5" cy="' +
    py +
    '" r="' +
    (e.pr + 2) +
    '" fill="' +
    ec +
    '"/><circle cx="39.5" cy="' +
    py +
    '" r="' +
    e.pr * 0.72 +
    '" fill="#000"/><circle cx="40.6" cy="' +
    (py - 1) +
    '" r=".9" fill="#fff" opacity=".8"/></g><path d="' +
    eyeP(e) +
    '" fill="none" stroke="#000" stroke-width="2"/>';
  if (e.lid)
    o +=
      '<path d="M30 ' +
      (yo - 1) +
      'Q38.5 ' +
      (46 + ty - 1) +
      ' 47 ' +
      (yi - 1) +
      '" fill="none" stroke="#000" stroke-width="' +
      e.lid +
      '"/>';
  if (e.bag)
    o +=
      '<path d="M32 ' +
      (yo + 5) +
      'Q38.5 ' +
      (46 + by + 4) +
      ' 45 ' +
      (yi + 5) +
      '" fill="none" stroke="#000" stroke-width="1.3" opacity=".7"/>';
  if (e.l)
    o +=
      '<path d="M31 ' + yo + 'L28.5 ' + (yo - 3) + '" fill="none" stroke="#000" stroke-width="2"/>';
  if (e.l > 1)
    o +=
      '<path d="M33 ' +
      (yo - 2) +
      'L30.5 ' +
      (yo - 6) +
      '" fill="none" stroke="#000" stroke-width="1.8"/>';
  return o;
}

/** EYEBROWS: [path data, stroke width] per gender (10 each). Left brow only; mirrored later. */
var BROW = {
  M: [
    ['M28 37L47 40', 6],
    ['M28 35L47 43', 5],
    ['M28 39Q38 32 47 38', 4],
    ['M29 38L46 41', 2.5],
    ['M27 34L47 44', 7],
    ['M28 38L50 42', 5],
    ['M28 40Q38 33 47 39', 5],
    ['M28 38L36 38M38 39L47 41', 5],
    ['M28 41L47 36', 4],
    ['M27 37L47 40', 8],
  ],
  F: [
    ['M28 40Q38 35 47 40', 2.5],
    ['M29 40L46 40', 3],
    ['M28 41Q37 33 47 39', 2.5],
    ['M28 40Q38 36 47 40', 5],
    ['M28 41L38 36L47 40', 3],
    ['M29 40Q38 38 46 41', 1.8],
    ['M28 39L47 40', 4.5],
    ['M28 41Q37 37 47 41', 3.5],
    ['M28 37L47 43', 3.5],
    ['M28 41Q38 37 47 41', 4],
  ],
};

/** NOSE outline paths per gender (10 each), drawn on the centre line. */
var NOSE = {
  M: [
    'M50 46L46 60L53 62',
    'M47 58L45 61L50 63L55 61L53 58',
    'M50 46L43 61L50 64L57 61',
    'M50 45L54 56L52 62L46 61',
    'M50 46L48 61L53 61',
    'M50 48L42 62L50 64L58 62',
    'M50 46L53 52L48 57L46 61L54 62',
    'M50 44L47 64L54 64',
    'M50 48L44 60L47 64L53 64L56 60',
    'M50 46L46 58L45 61L50 62L55 61',
  ],
  F: [
    'M50 47L48 58L52 60',
    'M48 58L50 61L52 58',
    'M50 48L48 58L47 60L50 61L53 60',
    'M50 46L49 60L52 61',
    'M50 48L47 59L50 62L53 59',
    'M50 46L52 54L48 61L53 62',
    'M50 48L45 60L50 62L55 60',
    'M50 46L47 60L50 63L53 60',
    'M51 48L49 59L52 60',
    'M50 46L53 56L51 61L48 60',
  ],
};

/** MOUTH SVG fragments per gender (10 each). Uses LIP for lip colour; the
 *  men's last mouth (index 9) draws a cigarette. */
var MOUTH = {
  M: [
    '<path d="M42 71L58 71" fill="none"/>',
    '<path d="M40 68Q50 78 60 68" fill="none"/>',
    '<path d="M41 74Q50 66 59 74" fill="none"/>',
    '<path d="M40 71L52 72L60 66" fill="none"/>',
    '<path d="M41 69Q50 66 59 69Q50 77 41 69Z" fill="' + LIP + '"/>',
    '<path d="M40 69L60 69L58 75L42 75Z" fill="#e8e0d0"/><path d="M46 69V75M50 69V75M54 69V75" fill="none" stroke-width="1.2"/>',
    '<path d="M43 72Q50 70 57 72" fill="none"/>',
    '<path d="M40 71Q50 66 60 71Q50 79 40 71Z" fill="' +
      LIP +
      '"/><path d="M40 71Q50 73 60 71" fill="none" stroke-width="1.5"/>',
    '<path d="M41 72L50 72Q56 72 60 67" fill="none"/>',
    '<path d="M42 71L56 71" fill="none"/><path d="M55 71L71 67" fill="none" stroke="#d8d0bc" stroke-width="3.5"/><path d="M70 67.3L72 66.7" fill="none" stroke="#c0533f" stroke-width="3.5"/>',
  ],
  F: [
    '<path d="M42 71Q50 69 58 71Q50 76 42 71Z" fill="' + LIP + '"/>',
    '<path d="M41 69Q50 77 59 69Q50 73 41 69Z" fill="' + LIP + '"/>',
    '<path d="M44 71Q50 68 56 71Q50 75 44 71Z" fill="' + LIP + '"/>',
    '<path d="M41 72Q50 72 60 67" fill="none"/><path d="M44 73Q50 76 56 72" fill="none" stroke-width="1.5"/>',
    '<path d="M42 69Q50 67 58 69Q50 78 42 69Z" fill="#5a1f1f"/>',
    '<path d="M43 72Q50 71 57 72" fill="none"/>',
    '<path d="M40 71Q50 66 60 71Q50 78 40 71Z" fill="' + LIP + '"/>',
    '<path d="M42 74Q50 68 58 74" fill="none"/>',
    '<path d="M41 69Q50 79 59 69Z" fill="#eee8dc"/>',
    '<path d="M43 72Q50 74 57 70" fill="none"/>',
  ],
};

/* ============================================================================
 * ==================  SECTION 9: HAIR, BEARD & MARKS DRAWING  ================
 * ========================================================================== */

/**
 * HAIR BEHIND the head (drawn BEFORE the face so the face covers it): long
 * hair, afro, buns and so on. Styles with no back piece return ''.
 * Men: index 2 = Long, 7 = Afro, 8 = Man bun. Women: ten back pieces.
 * Arrays are indexed by the look's `hair` value.
 * @param {Object} l - Look.
 * @param {string} hc - Hair colour hex.
 * @param {string} s3 - Shared stroke attributes (3px black outline).
 * @returns {string} SVG markup.
 */
function hairBack(l, hc, s3) {
  var st = 'fill="' + hc + '" ' + s3,
    h = l.hair | 0;
  if (l.g !== 'F') {
    if (h === 2) return '<path d="M20 52L18 20L34 6L58 4L80 12L82 56L84 92L16 92Z" ' + st + '/>';
    if (h === 7)
      return '<path d="M12 54L10 28L20 10L36 0L64 0L80 10L90 28L88 54L78 44L22 44Z" ' + st + '/>';
    if (h === 8) return '<circle cx="50" cy="7" r="8" ' + st + '/>';
    return '';
  }
  return [
    '<path d="M20 52L18 20L34 6L66 6L82 20L82 52L86 98H14L18 52Z" ' + st + '/>',
    '<path d="M20 64L18 24L34 8L66 8L82 24L80 64L72 72H28Z" ' + st + '/>',
    '',
    '<path d="M58 8L76 0L94 10L92 34L84 20L72 16Z" ' + st + '/>',
    '<path d="M14 58L12 30L20 12L36 2L64 2L80 12L88 30L86 58L90 78L78 84L74 58H26L22 84L10 78Z" ' +
      st +
      '/>',
    '<circle cx="50" cy="7" r="9" ' + st + '/>',
    '<path d="M68 20L84 30L84 56L80 66L84 78L78 92L72 80L76 68L70 56Z" ' + st + '/>',
    '',
    '<path d="M18 62L16 22L34 6L66 6L84 22L82 62L88 82L76 92L72 68H28L24 92L12 82Z" ' + st + '/>',
    '',
  ][h];
}

/**
 * HAIR IN FRONT of the face (fringe, top, sideburns). Drawn AFTER the face.
 * `hl` = faint white highlight strokes, `sh` = translucent shadow fill.
 * Men index 4 = Bald draws only a shine mark.
 * @param {Object} l - Look.
 * @param {string} hc - Hair colour hex.
 * @param {string} s3 - Shared stroke attributes.
 * @returns {string} SVG markup.
 */
function hairFront(l, hc, s3) {
  var h = l.hair | 0,
    st = 'fill="' + hc + '" ' + s3,
    hl = 'fill="none" stroke="#fff" stroke-width="1.5" opacity=".3"',
    sh = 'fill="' + hc + '" opacity=".35"';
  if (l.g !== 'F') {
    return [
      '<path d="M24 40L22 20L36 6L56 2L78 10L78 40L70 30L52 22L34 28Z" ' +
        st +
        '/><path d="M34 14L50 8M44 20L62 12" ' +
        hl +
        '/>',
      '<path d="M26 38L26 22L34 14L50 12L66 14L74 22L74 38L68 30L50 26L32 30Z" fill="' +
        hc +
        '" fill-opacity=".85" ' +
        s3 +
        '/>',
      '<path d="M24 44L22 20L36 8L58 6L78 14L78 44L68 28L50 24L32 30Z" ' +
        st +
        '/><path d="M36 16L54 10" ' +
        hl +
        '/>',
      '<path d="M24 42L24 22L44 8L72 12L78 24L76 42L66 28L40 26Z" ' +
        st +
        '/><path d="M36 18L56 12M42 24L66 18" ' +
        hl +
        '/>',
      '<path d="M38 22L52 16M44 27L58 21" fill="none" stroke="#fff" stroke-width="2" opacity=".4"/>',
      '<path d="M24 40L24 24L40 18L60 18L76 24L76 40L68 28L32 28Z" ' +
        sh +
        '/><path d="M42 20L40 2L46 9L50 0L54 9L60 2L58 20Z" ' +
        st +
        '/>',
      '<path d="M24 42L24 22L40 10L74 14L78 26L76 42L66 28L52 22L42 24L36 30Z" ' +
        st +
        '/><path d="M44 12L40 22" ' +
        hl +
        '/>',
      '<path d="M24 38L26 22L38 12L62 12L74 22L76 38L66 26L34 26Z" ' + st + '/>',
      '<path d="M24 40L24 22L40 12L66 12L76 22L76 40L66 28L36 28Z" ' +
        st +
        '/><path d="M36 18L56 14" ' +
        hl +
        '/>',
      '<path d="M24 42L24 26L34 14L44 20L50 15L56 20L66 14L76 26L76 42L70 34L62 26L50 30L38 26L30 34Z" ' +
        st +
        '/>',
    ][h];
  }
  return [
    '<path d="M24 44L22 20L36 8L64 8L78 20L76 44L68 28L52 20L46 20L32 28Z" ' +
      st +
      '/><path d="M36 14L48 12" ' +
      hl +
      '/>',
    '<path d="M23 46L22 22L38 8L62 8L78 22L77 46L74 30L26 30Z" ' +
      st +
      '/><path d="M34 16L52 12" ' +
      hl +
      '/>',
    '<path d="M24 40L22 20L36 8L64 10L78 22L76 40L68 28L54 22L38 30L32 36Z" ' +
      st +
      '/><path d="M44 12L58 16M38 16L52 18" ' +
      hl +
      '/>',
    '<path d="M24 42L24 22L40 10L66 12L76 24L76 42L66 28L36 28Z" ' +
      st +
      '/><path d="M36 18L56 14" ' +
      hl +
      '/>',
    '<path d="M22 44L20 24L28 12L40 6L50 10L60 6L72 12L80 24L78 44L70 28L56 22L44 22L30 28Z" ' +
      st +
      '/>',
    '<path d="M24 42L24 22L40 10L66 12L76 24L76 42L66 28L36 28Z" ' +
      st +
      '/><path d="M36 18L56 14" ' +
      hl +
      '/>',
    '<path d="M24 42L22 20L38 8L64 8L78 22L76 40L64 24L50 22L36 30Z" ' + st + '/>',
    '<path d="M24 42L24 22L30 24L30 42ZM76 42L76 22L70 24L70 42Z" ' +
      sh +
      '/><path d="M30 34L26 20L40 8L72 10L78 24L66 30L56 20L40 24Z" ' +
      st +
      '/>',
    '<path d="M22 46L20 20L36 6L64 6L80 20L78 46L70 30L54 22L46 22L30 30Z" ' + st + '/>',
    '<path d="M24 40L24 22L40 12L60 12L76 22L76 40L68 30L32 30Z" ' +
      sh +
      '/><path d="M34 20L48 15M44 22L60 16" ' +
      hl +
      '/>',
  ][h];
}

/**
 * Men's beard layer (clipped to the face by portrait()).
 * `bt` is a precomputed "beard territory" polygon following the jawline.
 * STYLES: 1 stubble (40% opacity fill), 3 beard (with a skin-coloured mouth
 * hole so the mouth stays visible), 4 goatee, 5 full beard (outline built
 * from EH() at y=46/60 so it hugs the real cheeks), 6 sideburns (two strips
 * at the cheek edges), 8 chinstrap (a line from ear to chin along the jaw,
 * inset 1 unit and offset by 4/5 to draw an outer and inner edge),
 * 9 soul patch. 0/2/7 are empty here (moustaches are drawn by mustache()).
 * @param {Object} l - Look.
 * @param {string} hc - Facial hair colour hex.
 * @param {string} sk - Skin colour hex (for mouth cut-outs).
 * @param {string} bt - Beard territory path.
 * @param {Object} s - Head shape.
 * @returns {string} SVG markup.
 */
function beard(l, hc, sk, bt, s) {
  var f = l.fhair | 0,
    F = 'fill="' + hc + '"';
  if (f === 1) return '<path d="' + bt + '" ' + F + ' opacity=".4"/>';
  if (f === 3)
    return (
      '<path d="' +
      bt +
      '" ' +
      F +
      '/><ellipse cx="51" cy="72" rx="12" ry="6.5" fill="' +
      sk +
      '"/>'
    );
  if (f === 4) return '<path d="M42 74L50 71L58 74L56 94L44 94Z" ' + F + '/>';
  if (f === 5)
    return (
      '<path d="M0 46L' +
      (49 - EH(s, 46)) +
      ' 46L' +
      (54 - EH(s, 60)) +
      ' 60L36 66L64 66L' +
      (EH(s, 60) + 46) +
      ' 60L' +
      (EH(s, 46) + 51) +
      ' 46L100 46V100H0Z" ' +
      F +
      '/><ellipse cx="50" cy="70" rx="13" ry="6.5" fill="' +
      sk +
      '"/>'
    );
  if (f === 6) {
    var a = 50 - s.cw,
      b = 50 + s.cw;
    return (
      '<path d="M' +
      (a - 6) +
      ' 28L' +
      (a + 8) +
      ' 28L' +
      (a + 9) +
      ' 58L' +
      (a - 6) +
      ' 58ZM' +
      (b + 6) +
      ' 28L' +
      (b - 8) +
      ' 28L' +
      (b - 9) +
      ' 58L' +
      (b + 6) +
      ' 58Z" ' +
      F +
      '/>'
    );
  }
  if (f === 8) {
    var cw = s.cw,
      jx = s.jx,
      jy = s.jy,
      cx = s.cx,
      cy = s.cy,
      ix = Math.max(1, cx - 4);
    return (
      '<path d="M' +
      (46 - cw) +
      ' 44L' +
      (46 - cw) +
      ' 54L' +
      (46 - jx) +
      ' ' +
      jy +
      'L' +
      (46 - cx) +
      ' ' +
      (cy + 4) +
      'H' +
      (54 + cx) +
      'L' +
      (54 + jx) +
      ' ' +
      jy +
      'L' +
      (54 + cw) +
      ' 54L' +
      (54 + cw) +
      ' 44L' +
      (45 + cw) +
      ' 44L' +
      (45 + cw) +
      ' 54L' +
      (45 + jx) +
      ' ' +
      (jy - 3) +
      'L' +
      (50 + ix) +
      ' ' +
      (cy - 5) +
      'H' +
      (50 - ix) +
      'L' +
      (55 - jx) +
      ' ' +
      (jy - 3) +
      'L' +
      (55 - cw) +
      ' 54L' +
      (55 - cw) +
      ' 44Z" ' +
      F +
      '/>'
    );
  }
  if (f === 9) return '<path d="M47 75L53 75L52 81L48 81Z" ' + F + '/>';
  return '';
}

/**
 * Moustache layer drawn ABOVE the face outline (not clipped), for facial
 * styles 2 (moustache), 4 (goatee top lip) and 7 (handlebar).
 * @param {Object} l - Look.
 * @param {string} hc - Facial hair colour hex.
 * @returns {string} SVG markup ('' for other styles).
 */
function mustache(l, hc) {
  var f = l.fhair | 0,
    a = 'fill="' + hc + '" stroke="#000" stroke-width="1.5" stroke-linejoin="miter"';
  if (f === 2 || f === 4)
    return '<path d="M36 66L44 62L50 65L56 62L64 66L56 70L50 67L44 70Z" ' + a + '/>';
  if (f === 7)
    return (
      '<path d="M32 62Q36 70 44 63L50 66L56 63Q64 70 68 62Q66 72 56 70L50 68L44 70Q34 72 32 62Z" ' +
      a +
      '/>'
    );
  return '';
}

/**
 * Women's "marks" layer (the female version of the facial-hair row):
 * 1 freckles (8 dots), 2 beauty mark, 3 cheek scar, 4 brow scar,
 * 6 teardrop tattoo, 7 nose stud, 8 black eye, 9 eyeliner wing (mirrored).
 * Style 5 (earrings) is drawn in portrait(); 0 is empty.
 * @param {Object} l - Look.
 * @returns {string} SVG markup.
 */
function marks(l) {
  var m = l.fhair | 0,
    o = '';
  if (m === 1)
    [
      [35, 57],
      [39, 59],
      [43, 57],
      [65, 57],
      [61, 59],
      [57, 57],
      [38, 62],
      [62, 62],
    ].forEach(function (p) {
      o += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="1" fill="#6b3f26"/>';
    });
  else if (m === 2) o = '<circle cx="62" cy="67" r="1.8" fill="#000"/>';
  else if (m === 3)
    o =
      '<path d="M60 52L66 68" fill="none" stroke="#000" stroke-width="1.6"/><path d="M58 57L64 55M60 62L67 60M62 67L68 66" fill="none" stroke="#000" stroke-width="1"/>';
  else if (m === 4)
    o =
      '<path d="M62 32L66 46" fill="none" stroke="#000" stroke-width="2"/><path d="M60 36L65 35M61 41L67 40" fill="none" stroke="#000" stroke-width="1"/>';
  else if (m === 6) o = '<path d="M34 52Q31.5 56 34 59Q36.5 56 34 52Z" fill="#000"/>';
  else if (m === 7)
    o = '<circle cx="55" cy="60" r="1.4" fill="#e3a73b" stroke="#000" stroke-width=".8"/>';
  else if (m === 8) o = '<ellipse cx="62" cy="47" rx="9" ry="6.5" fill="#3a1f3f" opacity=".6"/>';
  else if (m === 9)
    o = mir('<path d="M31 46L27.5 42.5" fill="none" stroke="#000" stroke-width="2.5"/>');
  return o;
}

/**
 * Accessory layer (glasses, eyepatch, earrings, headband, bandana, chain).
 * WHY glasses use mir(): each lens is drawn once on the left, mirrored for
 * the right, with a bridge (`br`) and an arm (`arm`) reaching the ear. The arm
 * ends at x = 49 - E(45), which is just outside the face edge at y=45.
 * Earrings sit at x = 48 - cw (just outside the cheek) so they hang from the
 * ear. Headband/bandana go through hx() to scale to the skull.
 * @param {number} ac - Accessory index 0-9.
 * @param {Object} s - Head shape.
 * @param {function(number):number} E - Edge half-width function (y -> width).
 * @returns {string} SVG markup.
 */
function accS(ac, s, E) {
  var cw = s.cw,
    o = '',
    ex = E(45),
    G = '#e3a73b',
    k = 'stroke="#000" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"',
    arm = '<path d="M30 45L' + (49 - ex) + ' 43" fill="none" ' + k + '/>',
    br = '<path d="M47 45Q50 43 53 45" fill="none" ' + k + '/>';
  if (ac === 1)
    o = mir(
      '<circle cx="38.5" cy="46" r="8.5" fill="#fff" fill-opacity=".12" ' + k + '/>' + br + arm,
    );
  else if (ac === 2)
    o = mir(
      '<rect x="30" y="40" width="17" height="12" rx="2" fill="#fff" fill-opacity=".12" ' +
        k +
        '/>' +
        br +
        arm,
    );
  else if (ac === 3)
    o = mir(
      '<path d="M29.5 41L47 41L45.5 51Q43 54 36 53Q32 52 29.5 41Z" fill="#111" ' +
        k +
        '/><path d="M33 43.5L38 43.5" stroke="#fff" stroke-width="1.6" opacity=".4" fill="none"/>' +
        br +
        arm,
    );
  else if (ac === 4)
    o =
      '<path d="M31 41L' +
      (50 - E(36)) +
      ' 35M45 40L' +
      (50 + E(30)) +
      ' 29" fill="none" stroke="#000" stroke-width="2.4"/><ellipse cx="38.5" cy="46" rx="9" ry="8" fill="#111" ' +
      k +
      '/>';
  else if (ac === 5)
    o = mir(
      '<circle cx="' +
        (50 - cw) +
        '" cy="58" r="2" fill="' +
        G +
        '" stroke="#000" stroke-width="1"/>',
    );
  else if (ac === 6)
    o = mir(
      '<circle cx="' +
        (50 - cw) +
        '" cy="62" r="4" fill="none" stroke="#000" stroke-width="3.2"/><circle cx="' +
        (50 - cw) +
        '" cy="62" r="4" fill="none" stroke="' +
        G +
        '" stroke-width="1.6"/>',
    );
  else if (ac === 7)
    o = hx(
      s,
      s.hw,
      '<path d="M22.5 31Q50 24 77.5 31L77.5 37Q50 30 22.5 37Z" fill="#c8374f" ' + k + '/>',
    );
  else if (ac === 8)
    o = hx(
      s,
      s.hw,
      '<path d="M22 36L21 20L36 6L64 6L79 20L78 36Q50 28 22 36Z" fill="#b5322e" ' +
        k +
        '/><path d="M30 18h.01M46 12h.01M60 18h.01M70 28h.01M36 28h.01M52 22h.01" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/><path d="M78 24L92 30L88 42L77 33Z" fill="#b5322e" ' +
        k +
        '/>',
    );
  return o;
}

/**
 * Draws the gold chain BEHIND the head (called before the ears and face).
 * WHY: the old chain was drawn on top of the face, starting at y=71 (mouth
 * height). Drawn after the neck but before the face, the chin covers the
 * top of the chain, so it appears to hang from beneath the jaw.
 * MATH: a quadratic Bezier from the left neck edge to the right neck edge
 * at y=78, with control point y=113. The curve's lowest point is halfway
 * to the control point: 78 + (113-78)/2 = 95.5, which is where the pendant sits.
 * @param {number} ac - Accessory index 0-9 (only 9 draws anything).
 * @param {boolean} F - True for the female body (narrower neck).
 * @returns {string} SVG markup ('' for other accessories).
 */
function accBack(ac, F) {
  if (ac !== 9) return '';
  var nx = F ? 7 : 9,
    d = 'M' + (50 - nx) + ' 78Q50 113 ' + (50 + nx) + ' 78';
  return (
    '<path d="' +
    d +
    '" fill="none" stroke="#000" stroke-width="4.5"/><path d="' +
    d +
    '" fill="none" stroke="#e3a73b" stroke-width="2"/><circle cx="50" cy="95.5" r="3.4" fill="#e3a73b" stroke="#000" stroke-width="1.5"/>'
  );
}

/* ============================================================================
 * ===================  SECTION 10: PORTRAIT ASSEMBLY  ========================
 * ========================================================================== */

/**
 * Builds the complete portrait as one inline <svg> string.
 * PAINTER'S ALGORITHM: later shapes cover earlier ones, so the order IS the
 * layering, back to front:
 *   1 hair behind -> 2 shoulders and neck -> 3 ears -> 4 face fill
 *   -> 5 clipped group: hatch shading lines + beard + right-side shadow
 *   -> 6 face outline -> 7 moustache or marks -> 8 mouth and nose
 *   -> 9 eyes and eyebrows (mirrored) -> 10 front hair -> 11 earring (women)
 *   -> 12 accessories.
 * The face clipPath (id) keeps hatching/beards inside the head; a second
 * clipPath (id+'e') keeps each iris inside the eye shape.
 * `bt` = beard territory polygon built from EH() at y=50 and y=62 so the
 * beard line follows the cheek edge.
 * @param {Object|null} l - Look (returns '' if null).
 * @param {number} z - Pixel size (width = height).
 * @returns {string} SVG markup.
 */
function portrait(l, z) {
  if (!l) return '';
  var g = l.g === 'F' ? 'F' : 'M',
    F = g === 'F',
    s = hd(l),
    hw = s.hw,
    cw = s.cw,
    sk = SKIN[l.skin | 0],
    hc = HCOL[l.hcol | 0],
    fc = HCOL[l.fcol == null ? l.hcol | 0 : l.fcol | 0],
    ec = ECOL[l.ecol | 0],
    id = 'c' + PID++,
    fd = faceD(s),
    o = '',
    s3 = 'stroke="#000" stroke-width="3" stroke-linejoin="miter"',
    s25 = 'stroke="#000" stroke-width="2.5" stroke-linejoin="miter"',
    cp = 'clip-path="url(#' + id + ')"',
    bt =
      'M0 50L' +
      (49 - EH(s, 50)) +
      ' 50L' +
      (54 - EH(s, 62)) +
      ' 62L38 60L44 64L50 60L56 64L62 60L' +
      (EH(s, 62) + 46) +
      ' 62L' +
      (EH(s, 50) + 51) +
      ' 50L100 50V100H0Z',
    eb = BROW[g][l.brow | 0],
    ey = EYE[g][l.eyes | 0],
    E = function (y) {
      return s.hw + (s.cw - s.hw) * clamp((y - 22) / 32, 0, 1);
    };
  o +=
    '<defs><clipPath id="' +
    id +
    '"><path d="' +
    fd +
    '"/></clipPath><clipPath id="' +
    id +
    'e"><path d="' +
    eyeP(ey) +
    '"/></clipPath></defs>' +
    hx(s, Math.max(hw, cw), hairBack(l, hc, s3));
  if (F)
    o +=
      '<path d="M12 100L18 86L38 82H62L82 86L88 100Z" fill="#4a3a40" ' +
      s3 +
      '/><path d="M38 82L50 95L62 82Z" fill="' +
      sk +
      '" ' +
      s25 +
      '/><path d="M43 66V84H57V66Z" fill="' +
      sk +
      '" ' +
      s25 +
      '/><path d="M43 66V76L57 80V66Z" fill="#000" opacity=".35"/>';
  else
    o +=
      '<path d="M8 100L14 84L36 80H64L86 84L92 100Z" fill="#3a3f44" ' +
      s3 +
      '/><path d="M41 66V84H59V66Z" fill="' +
      sk +
      '" ' +
      s25 +
      '/><path d="M41 66V76L59 80V66Z" fill="#000" opacity=".35"/>';
  o += accBack(l.acc | 0, F);
  o +=
    '<path d="M' +
    (51 - cw) +
    ' 46L' +
    (45 - cw) +
    ' 51L' +
    (51 - cw) +
    ' 60Z" fill="' +
    sk +
    '" ' +
    s25 +
    '/><path d="M' +
    (49 + cw) +
    ' 46L' +
    (55 + cw) +
    ' 51L' +
    (49 + cw) +
    ' 60Z" fill="' +
    sk +
    '" ' +
    s25 +
    '/><path d="' +
    fd +
    '" fill="' +
    sk +
    '"/>';
  o +=
    '<g ' +
    cp +
    '><path d="M28 34L40 26M27 44L44 33M27 54L46 42M30 64L48 52M34 74L50 62" stroke="#000" stroke-width="1" opacity=".55" fill="none"/>' +
    (F ? '' : beard(l, fc, sk, bt, s)) +
    '<path d="M56 10L100 10V100H50L60 70L52 40Z" fill="#000" opacity=".35"/></g><path d="' +
    fd +
    '" fill="none" stroke="#000" stroke-width="3.5" stroke-linejoin="miter"/>';
  if (!F) o += mustache(l, fc);
  else o += marks(l);
  o +=
    '<g stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    MOUTH[g][l.mouth | 0] +
    '</g><path d="' +
    NOSE[g][l.nose | 0] +
    '" fill="none" stroke="#000" stroke-width="2.2" stroke-linejoin="miter"/>';
  o += mir(
    eyeS(ey, ec, id + 'e') +
      '<path d="' +
      eb[0] +
      '" stroke="#000" stroke-width="' +
      eb[1] +
      '" fill="none"' +
      (F ? ' stroke-linecap="round"' : '') +
      '/>',
  );
  o += hx(s, hw, hairFront(l, hc, s3));
  if (F && (l.fhair | 0) === 5)
    o += mir(
      '<circle cx="' +
        (50 - cw) +
        '" cy="61" r="3" fill="none" stroke="#e3a73b" stroke-width="2"/>',
    );
  o += accS(l.acc | 0, s, E);
  return (
    '<svg viewBox="0 0 100 100" width="' +
    z +
    '" height="' +
    z +
    '" role="img" aria-label="Character portrait" style="flex:none;border-radius:10px;background:#2e3a43">' +
    o +
    '</svg>'
  );
}
