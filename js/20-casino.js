/* Kingpin: Bloodline  |  js/20-casino.js
 * Casino: blackjack, slots and roulette.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 32: CASINO  ================================================
 * ============================================================================
 * ========================================================================== */
/* Three games share one yearly allowance of plays. The house edge is built
 * into each game's rules/pay tables. The RESULT of every spin is decided
 * (and saved) BEFORE the animation starts, so closing the app mid-spin
 * cannot be used to escape a loss: casResolve() finishes any pending game. */

/* ============================================================
   CASINO: change CASINO_LIMIT to change plays per year (all games share it)
   ============================================================ */
var CASINO_LIMIT = 3;

/** Selectable bet sizes in pounds (shown as £10, £100, £1k, £10k, £100k, £1m). */
var CBETS = [10, 100, 1000, 10000, 100000, 1000000];

/** CANIM : true while a slot/roulette animation is running (locks the UI).
 *  RROT  : the roulette wheel's current angle (0..359), remembered so the
 *          next spin continues from where the wheel stopped. */
var CANIM = false,
  RROT = 0;

/** SLOT SYMBOLS, from rarest to commonest.
 *  e : emoji.   w : weight (higher = appears more often).
 *  p : payout multiplier for THREE matching symbols (x bet).
 *  q : payout multiplier for any TWO matching symbols (x bet).
 *  The police car is the "bust" symbol: it never pays. */
var SLS = [
  { e: '\uD83D\uDCB0', w: 1, p: 500, q: 14 },
  { e: '\uD83D\uDC8E', w: 2, p: 100, q: 5 },
  { e: '\uD83C\uDFE0', w: 3, p: 40, q: 3.5 },
  { e: '\uD83D\uDCB5', w: 5, p: 20, q: 2.5 },
  { e: '\uD83D\uDD2B', w: 6, p: 10, q: 1.5 },
  { e: '\uD83D\uDD2A', w: 7, p: 6, q: 1 },
  { e: '\uD83D\uDE94', w: 8, p: 0, q: 0 },
];

/** ROULETTE DATA.
 *  RWH  : the 37 pockets in their real clockwise wheel order, starting at 0.
 *  RRED : which numbers are red (every other number not 0 is black).
 *  RN   : display names for outside-bet codes. */
var RWH = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
    31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
  ],
  RRED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
var RN = {
  r: 'Red',
  b: 'Black',
  o: 'Odd',
  e: 'Even',
  lo: '1 to 18',
  hi: '19 to 36',
  d1: '1st dozen (1-12)',
  d2: '2nd dozen (13-24)',
  d3: '3rd dozen (25-36)',
};

/* ---------------------- shared casino helpers ---------------------- */

/**
 * Plays used in the CURRENT year. S.cas = {d: yearNumber, n: plays}. If the
 * stored year differs from today's, the counter has implicitly reset to 0.
 * @returns {number}
 */
function casUsed() {
  var c = S.cas;
  return c && c.d === S.day ? c.n : 0;
}

/** Plays still available this year. @returns {number} (never negative) */
function casLeft() {
  return Math.max(0, CASINO_LIMIT - casUsed());
}

/** Spends one play (stamps the current year). @returns {void} */
function casUse() {
  S.cas = { d: S.day, n: casUsed() + 1 };
}

/** Current bet size (default £100). @returns {number} */
function casBet() {
  return S.cbet || 100;
}

/** Changes the bet size; ignored while a game is in progress. @param {number} v - Pounds. @returns {void} */
function setCbet(v) {
  if (casBusy()) return;
  S.cbet = v;
  render();
}

/**
 * True while the player must not change settings or leave a game:
 * an animation is running, a blackjack hand is unfinished, or a slot /
 * roulette result is still waiting to be paid.
 * @returns {boolean}
 */
function casBusy() {
  return CANIM || !!(S.bj && !S.bj.done) || !!S.sl || !!S.rl;
}

/**
 * Plays the result sound of a hand, spin or roll and, on a win, unlocks
 * "Beginner's Luck". A push or a bet returned is silent.
 * @param {number} net - Winnings minus the stake (negative = a loss).
 * @returns {void}
 */
function casSound(net) {
  if (net > 0) {
    sfx('win');
    achHit('casino');
  } else if (net < 0) sfx('lose');
}

/** Switches the casino game tab ('bj' | 'sl' | 'rl') unless busy. @param {string} g @returns {void} */
function casGame(g) {
  if (casBusy()) return;
  S.cg = g;
  render();
}

/**
 * Settles any slot/roulette game left pending (e.g. the page was reloaded
 * mid-spin). Passing true tells the end functions NOT to re-render (we are
 * already inside a render).
 * @returns {void}
 */
function casResolve() {
  if (S.sl && !CANIM) slEnd(true);
  if (S.rl && !CANIM) rlEnd(true);
}

/* ======================== BLACKJACK ======================== */
/* A card is an integer 0..51: rank = n % 13 (0 = Ace, 1..8 = 2..9,
 * 9 = 10, 10 = J, 11 = Q, 12 = K), suit = floor(n / 13). */

/** Rank label. @param {number} n - Card 0..51. @returns {string} 'A','2'..'10','J','Q','K'. */
function cRank(n) {
  return ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][n % 13];
}

/** Suit symbol (spade, heart, diamond, club). @param {number} n - Card. @returns {string} */
function cSuit(n) {
  return ['\u2660', '\u2665', '\u2666', '\u2663'][Math.floor(n / 13)];
}

/**
 * Blackjack value of one card. Ace = 11 here (demoted later by hv),
 * J/Q/K (ranks 10..12) = 10, others = rank + 1.
 * @param {number} n - Card.
 * @returns {number}
 */
function cVal(n) {
  var r = n % 13;
  return r === 0 ? 11 : r > 9 ? 10 : r + 1;
}

/**
 * Hand value with the standard ace rule: count every ace as 11, then while
 * the total is over 21 turn one ace into a 1 (subtract 10). This makes the
 * hand as high as possible without busting.
 * @param {number[]} h - Cards.
 * @returns {number}
 */
function hv(h) {
  var t = 0,
    a = 0;
  h.forEach(function (n) {
    t += cVal(n);
    if (n % 13 === 0) a++;
  });
  while (t > 21 && a > 0) {
    t -= 10;
    a--;
  }
  return t;
}

/**
 * Is the hand "soft" (contains an ace still counting as 11)?
 * LOGIC: total with ALL aces as 1; if there is an ace and adding 10 still
 * fits within 21, one ace is being counted as 11.
 * @param {number[]} h - Cards.
 * @returns {boolean}
 */
function hsoft(h) {
  var t = 0,
    a = 0;
  h.forEach(function (n) {
    t += n % 13 === 0 ? 1 : cVal(n);
    if (n % 13 === 0) a++;
  });
  return a > 0 && t + 10 <= 21;
}

/**
 * HTML for one card (red for hearts/diamonds, i.e. suit index 1 or 2),
 * or a face-down card back.
 * @param {number} n - Card.
 * @param {boolean} [hide] - True to show the back.
 * @returns {string}
 */
function cardH(n, hide) {
  if (hide) return '<span class="pc back" aria-label="Hidden card"></span>';
  var s = Math.floor(n / 13);
  return (
    '<span class="pc' +
    (s === 1 || s === 2 ? ' rd' : '') +
    '"><b>' +
    cRank(n) +
    '</b><i>' +
    cSuit(n) +
    '</i></span>'
  );
}

/**
 * Starts a hand: takes the stake, uses a play, shuffles a fresh 52-card deck
 * and deals two cards each. If either side has 21 immediately, the hand
 * ends at once (natural blackjack).
 * SHUFFLE (Fisher-Yates): go from the last card down to the second; swap
 * each card with a random card at or before it. This gives every ordering
 * exactly equal probability (unlike sorting by random numbers).
 * Cards are dealt from the END of the array with pop().
 * @returns {void}
 */
function bjDeal() {
  if (casLeft() < 1 || casBusy()) return;
  var b = casBet();
  if (S.cash < b) return;
  S.cash -= b;
  casUse();
  var d = [],
    i,
    j,
    t;
  for (i = 0; i < 52; i++) d.push(i);
  for (i = 51; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    t = d[i];
    d[i] = d[j];
    d[j] = t;
  }
  sfx('card');
  S.bj = { bet: b, p: [d.pop(), d.pop()], d: [d.pop(), d.pop()], k: d, done: false, msg: '' };
  if (hv(S.bj.p) === 21 || hv(S.bj.d) === 21) bjEnd();
  else render();
}

/**
 * Finishes the hand: dealer plays, then payout.
 * DEALER RULE: draws until 17 or more, but ONLY if the player hasn't busted
 * and neither side has a natural blackjack (nothing left to play for).
 * PAYOUT (`pay` = total RETURNED to the player, stake included; the stake was
 * already deducted when the hand began):
 *   bust                    -> 0       (lose stake)
 *   both natural            -> bet     (push)
 *   player natural          -> 2.5 x bet (profit = 1.5 x bet, i.e. 3 to 2)
 *   dealer natural          -> 0
 *   dealer busts / higher   -> 2 x bet (profit = 1 x bet, i.e. 1 to 1)
 *   equal totals            -> bet     (push)
 *   otherwise               -> 0
 * @returns {void}
 */
function bjEnd() {
  var g = S.bj,
    p = hv(g.p),
    nat = g.p.length === 2 && p === 21,
    dn = g.d.length === 2 && hv(g.d) === 21;
  if (p <= 21 && !nat && !dn) while (hv(g.d) < 17) g.d.push(g.k.pop());
  var d = hv(g.d),
    pay = 0,
    m;
  if (p > 21) m = 'Bust. You lose ' + gbp(g.bet) + '.';
  else if (nat && dn) {
    pay = g.bet;
    m = 'Both have blackjack. Push, bet returned.';
  } else if (nat) {
    pay = Math.round(g.bet * 2.5);
    m = 'Blackjack! You win ' + gbp(pay - g.bet) + '.';
  } else if (dn) m = 'Dealer has blackjack. You lose ' + gbp(g.bet) + '.';
  else if (d > 21) {
    pay = g.bet * 2;
    m = 'Dealer busts. You win ' + gbp(g.bet) + '.';
  } else if (p > d) {
    pay = g.bet * 2;
    m = 'You win ' + gbp(g.bet) + '.';
  } else if (p === d) {
    pay = g.bet;
    m = 'Push. Bet returned.';
  } else m = 'Dealer wins. You lose ' + gbp(g.bet) + '.';
  S.cash += pay;
  casSound(pay - g.bet);
  g.done = true;
  g.msg = m;
  say('Blackjack: ' + m);
  render();
}

/** Player takes a card; at 21 or more the hand ends automatically. @returns {void} */
function bjHit() {
  var g = S.bj;
  if (!g || g.done) return;
  g.p.push(g.k.pop());
  sfx('card');
  if (hv(g.p) >= 21) bjEnd();
  else render();
}

/** Player stands: dealer plays and the hand is settled. @returns {void} */
function bjStand() {
  var g = S.bj;
  if (!g || g.done) return;
  bjEnd();
}

/**
 * Double down: only on the first two cards and if you can afford a second
 * stake. Takes the extra stake, doubles the bet, deals EXACTLY ONE more card
 * and ends the hand.
 * @returns {void}
 */
function bjDouble() {
  var g = S.bj;
  if (!g || g.done || g.p.length !== 2 || S.cash < g.bet) return;
  S.cash -= g.bet;
  g.bet *= 2;
  g.p.push(g.k.pop());
  bjEnd();
}

/**
 * Builds the Blackjack card. While the hand is live the dealer's second card
 * is hidden (hid && index 1) and only the first card's value is shown; the
 * action buttons are Hit / Stand / Double. When finished it shows the result
 * and a "Deal again" button.
 * @returns {string} HTML.
 */
function bjView() {
  var j = S.bj,
    left = casLeft(),
    b = casBet(),
    c =
      '<div class="card"><h2>Blackjack</h2><p class="log">Get closer to 21 than the dealer without going over. Dealer stands on 17. Blackjack pays 3 to 2. You can double down on your first two cards.</p>';
  if (!j)
    return (
      c +
      '<button class="main full" onclick="bjDeal()"' +
      (left < 1 || S.cash < b ? ' disabled' : '') +
      '>Deal \u00b7 bet ' +
      gbp(b) +
      '</button>' +
      (left < 1
        ? '<p class="log">No plays left this year.</p>'
        : S.cash < b
          ? '<p class="log">Not enough cash for that bet.</p>'
          : '') +
      '</div>'
    );
  var hid = !j.done;
  c +=
    '<p class="lead"><b>Dealer</b> \u00b7 ' +
    (hid ? 'showing ' + cVal(j.d[0]) : hv(j.d)) +
    '</p><div class="hand">' +
    j.d
      .map(function (n, i) {
        return cardH(n, hid && i === 1);
      })
      .join('') +
    '</div>';
  c +=
    '<p class="lead"><b>You</b> \u00b7 ' +
    hv(j.p) +
    (hsoft(j.p) && hv(j.p) < 21 ? ' (soft)' : '') +
    ' \u00b7 bet ' +
    gbp(j.bet) +
    '</p><div class="hand">' +
    j.p
      .map(function (n) {
        return cardH(n);
      })
      .join('') +
    '</div>';
  if (hid)
    c +=
      '<div class="btns"><button class="buy" style="flex:1" onclick="bjHit()">Hit</button><button class="sell" style="flex:1" onclick="bjStand()">Stand</button><button style="flex:1" onclick="bjDouble()"' +
      (j.p.length !== 2 || S.cash < j.bet ? ' disabled' : '') +
      '>Double</button></div>';
  else
    c +=
      '<p class="lead"><b>' +
      j.msg +
      '</b></p><button class="main full" onclick="bjDeal()"' +
      (left < 1 || S.cash < b ? ' disabled' : '') +
      '>' +
      (left < 1 ? 'No plays left this year' : 'Deal again \u00b7 bet ' + gbp(b)) +
      '</button>';
  return c + '</div>';
}

/* ============================ SLOTS ============================ */

/**
 * Picks one reel symbol with WEIGHTED randomness.
 * MATH: total = sum of weights. Draw r in [0,total). Walk the symbols
 * subtracting each weight; the first time r goes below zero, that symbol is
 * the winner. A symbol with weight 8 is therefore chosen 8 times as often as
 * one with weight 1. (The last line is a safety net for rounding.)
 * @returns {number} Index into SLS.
 */
function slPick() {
  var t = 0,
    i;
  SLS.forEach(function (s) {
    t += s.w;
  });
  var r = Math.random() * t;
  for (i = 0; i < SLS.length; i++) {
    r -= SLS[i].w;
    if (r < 0) return i;
  }
  return SLS.length - 1;
}

/**
 * Payout multiplier for three reels r = [a,b,c] (symbol indexes).
 * Three equal -> the symbol's `p`; otherwise any equal pair
 * (reels 1&2, 1&3 or 2&3) -> that symbol's `q`; otherwise 0.
 * @param {number[]} r - Three symbol indexes.
 * @returns {number} Multiplier of the bet.
 */
function slMult(r) {
  if (r[0] === r[1] && r[1] === r[2]) return SLS[r[0]].p;
  if (r[0] === r[1] || r[0] === r[2]) return SLS[r[0]].q;
  if (r[1] === r[2]) return SLS[r[1]].q;
  return 0;
}

/**
 * Pulls the lever: takes the stake, spends a play, DECIDES THE RESULT NOW
 * (S.sl.r), saves immediately (anti-cheat: a reload cannot undo the loss),
 * then runs the animation.
 * @returns {void}
 */
function slSpin() {
  if (casLeft() < 1 || casBusy()) return;
  var b = casBet();
  if (S.cash < b) return;
  S.cash -= b;
  casUse();
  sfx('spin');
  S.sl = { bet: b, r: [slPick(), slPick(), slPick()] };
  save();
  slRun();
}

/**
 * Animates the reels. Every 80 ms each still-spinning reel shows a random
 * emoji; reels stop one by one at 0.9 s, 1.5 s and 2.1 s on their predetermined
 * symbol. When the third stops, the flicker timer is cleared, the busy flag
 * is released and the result is paid. (Elements are looked up each tick
 * because render() may have replaced them.)
 * @returns {void}
 */
function slRun() {
  CANIM = true;
  render();
  var st = [0, 0, 0],
    fin = S.sl.r,
    iv = setInterval(function () {
      for (var i = 0; i < 3; i++) {
        if (st[i]) continue;
        var e = $('sl' + i);
        if (e) e.textContent = SLS[Math.floor(Math.random() * SLS.length)].e;
      }
    }, 80);
  [900, 1500, 2100].forEach(function (t, i) {
    setTimeout(function () {
      st[i] = 1;
      var e = $('sl' + i);
      if (e) e.textContent = SLS[fin[i]].e;
      if (i === 2) {
        clearInterval(iv);
        CANIM = false;
        slEnd();
      }
    }, t);
  });
}

/**
 * Pays the slot result. payout = round(bet x multiplier); net = payout - bet.
 * (A "small return" is a payout that is less than the stake: a partial loss.)
 * @param {boolean} [q] - Quiet: skip render() (used when already rendering).
 * @returns {void}
 */
function slEnd(q) {
  var s = S.sl;
  if (!s) return;
  var pay = Math.round(s.bet * slMult(s.r)),
    net = pay - s.bet,
    m =
      net > 0
        ? 'You won ' + gbp(net) + '.'
        : net === 0
          ? 'You got your bet back.'
          : pay > 0
            ? 'Small return of ' + gbp(pay) + ', a loss of ' + gbp(-net) + '.'
            : 'No win. You lose ' + gbp(s.bet) + '.';
  S.cash += pay;
  if (!q) casSound(net);
  S.slr = { r: s.r, m: m };
  S.sl = null;
  say('Slots: ' + m);
  if (!q) render();
}

/**
 * Builds the Slots card: three reels (a "?" while spinning, the last result
 * after a spin, a default trio initially), the spin button and the pay table.
 * @returns {string} HTML.
 */
function slView() {
  var left = casLeft(),
    b = casBet(),
    sh = S.sl ? null : S.slr && S.slr.r,
    c =
      '<div class="card"><h2>Slots</h2><p class="log">Three reels. Three matching symbols pay big, and any two matching pay a smaller prize.</p><div class="reels">';
  [0, 1, 2].forEach(function (i) {
    c +=
      '<div class="reel" id="sl' +
      i +
      '">' +
      (sh ? SLS[sh[i]].e : S.sl ? '\u2754' : SLS[[3, 4, 2][i]].e) +
      '</div>';
  });
  c +=
    '</div>' +
    (S.slr && !S.sl ? '<p class="lead" style="text-align:center"><b>' + S.slr.m + '</b></p>' : '') +
    '<button class="main full" onclick="slSpin()"' +
    (left < 1 || S.cash < b || casBusy() ? ' disabled' : '') +
    '>' +
    (left < 1 ? 'No plays left this year' : 'Spin \u00b7 bet ' + gbp(b)) +
    '</button><p class="lead" style="margin-top:12px"><b>Pay table</b> (times your bet)</p>';
  SLS.forEach(function (s) {
    c +=
      '<div class="row"><div class="nm">' +
      s.e +
      s.e +
      s.e +
      ' \u00b7 ' +
      (s.p ? '\u00d7' + s.p : 'busted, nothing') +
      '</div><div class="log">' +
      (s.q ? 'any two ' + s.e + ' \u00d7' + s.q : '') +
      '</div></div>';
  });
  return c + '</div>';
}

/* =========================== ROULETTE =========================== */

/**
 * Colour of a number: 0 = green, in RRED = red, otherwise black.
 * @param {number} n - 0..36.
 * @returns {string} 'g' | 'r' | 'b' (also the CSS class suffix rg / rr / rb).
 */
function rCol(n) {
  return n === 0 ? 'g' : RRED.indexOf(n) >= 0 ? 'r' : 'b';
}

/**
 * Payout multiplier (stake returned INCLUDED) for a bet if number n lands.
 *  - Straight-up number: 36x (35 to 1 plus the stake).
 *  - Zero loses EVERY outside bet: this is the house edge (1/37 = 2.7%).
 *  - Red/black/odd/even/low/high: 2x (1 to 1).
 *  - Dozens: 3x (2 to 1). Ranges: 1-12, 13-24, 25-36.
 * @param {{t:string,v:number}} s - Bet: type code and (for numbers) value.
 * @param {number} n - Winning number.
 * @returns {number} Multiplier (0 = lose).
 */
function rMult(s, n) {
  var t = s.t;
  if (t === 'n') return n === s.v ? 36 : 0;
  if (n === 0) return 0;
  var c = rCol(n);
  return t === 'r'
    ? c === 'r'
      ? 2
      : 0
    : t === 'b'
      ? c === 'b'
        ? 2
        : 0
      : t === 'o'
        ? n % 2
          ? 2
          : 0
        : t === 'e'
          ? n % 2 === 0
            ? 2
            : 0
          : t === 'lo'
            ? n <= 18
              ? 2
              : 0
            : t === 'hi'
              ? n >= 19
                ? 2
                : 0
              : t === 'd1'
                ? n <= 12
                  ? 3
                  : 0
                : t === 'd2'
                  ? n > 12 && n <= 24
                    ? 3
                    : 0
                  : t === 'd3'
                    ? n > 24
                      ? 3
                      : 0
                    : 0;
}

/** Display name of a bet (e.g. "number 17" or "Red"). @param {{t:string,v:number}} s @returns {string} */
function rName(s) {
  return s.t === 'n' ? 'number ' + s.v : RN[s.t];
}

/** Selects the bet to place (ignored while busy). @param {string} t - Bet type. @param {number} [v] - Number for 'n' bets. @returns {void} */
function rSel(t, v) {
  if (casBusy()) return;
  S.rsel = { t: t, v: v };
  render();
}

/**
 * Spins the wheel: takes the stake, uses a play, DECIDES the winning number
 * now (uniform 0..36), saves, then animates.
 * @returns {void}
 */
function rlSpin() {
  if (casLeft() < 1 || casBusy() || !S.rsel) return;
  var b = casBet();
  if (S.cash < b) return;
  S.cash -= b;
  casUse();
  sfx('spin');
  S.rl = { bet: b, sel: S.rsel, n: Math.floor(Math.random() * 37) };
  save();
  rlRun();
}

/**
 * Animates the wheel so the WINNING pocket stops under the pointer at the top.
 * MATH (step by step):
 *   a    = 360/37 degrees per pocket (about 9.73).
 *   i    = position of the winning number in the wheel order RWH.
 *   Pocket i's centre sits at angle (i + 0.5) * a, clockwise from the top.
 *   To bring it to the top, the wheel must end at rotation -(i + 0.5) * a.
 *   need = how many EXTRA degrees to turn from the wheel's present angle
 *          RROT: ((-(i+.5)*a - RROT) % 360 + 360) % 360. The "+360 then % 360"
 *          trick forces a positive result (JS keeps the sign in %).
 *   tgt  = RROT + 1800 + need   (1800 = 5 extra full turns for drama).
 * The ball spins the OPPOSITE way (-2520 = 7 turns) with the same easing
 * curve cubic-bezier(.15,.6,.15,1): fast start, long smooth slowdown.
 * The `void ...getBoundingClientRect()` forces the browser to apply the
 * starting position before the transition is set (otherwise it may skip
 * the animation). After 5.8 s (a little over the 5.5 s transition) the
 * remembered angle is saved (RROT = tgt % 360) and the bet is paid.
 * @returns {void}
 */
function rlRun() {
  CANIM = true;
  var i = RWH.indexOf(S.rl.n),
    a = 360 / 37,
    need = (((-(i + 0.5) * a - RROT) % 360) + 360) % 360,
    tgt = RROT + 1800 + need;
  render();
  var w = $('rlw'),
    bl = $('rlb');
  if (w && bl) {
    void w.getBoundingClientRect();
    var tr = 'transform 5.5s cubic-bezier(.15,.6,.15,1)';
    w.style.transition = tr;
    w.style.transform = 'rotate(' + tgt + 'deg)';
    bl.style.transition = tr;
    bl.style.transform = 'rotate(-2520deg)';
  }
  setTimeout(function () {
    RROT = tgt % 360;
    CANIM = false;
    rlEnd();
  }, 5800);
}

/**
 * Pays the roulette result: payout = round(bet x multiplier); net = payout - bet.
 * @param {boolean} [q] - Quiet: skip render().
 * @returns {void}
 */
function rlEnd(q) {
  var s = S.rl;
  if (!s) return;
  var n = s.n,
    pay = Math.round(s.bet * rMult(s.sel, n)),
    net = pay - s.bet,
    col = n === 0 ? 'green' : rCol(n) === 'r' ? 'red' : 'black',
    m =
      'The ball lands on ' +
      n +
      ' (' +
      col +
      '). ' +
      (net > 0
        ? 'You won ' + gbp(net) + ' on ' + rName(s.sel) + '.'
        : 'You lose ' + gbp(s.bet) + ' on ' + rName(s.sel) + '.');
  S.cash += pay;
  if (!q) casSound(net);
  S.rlr = { n: n, m: m };
  S.rl = null;
  say('Roulette: ' + m);
  if (!q) render();
}

/**
 * Draws the roulette wheel as SVG: 37 coloured wedges plus the number ring.
 * MATH: P(r, t) converts POLAR to screen coordinates for a point at radius r
 * and angle t degrees measured CLOCKWISE FROM THE TOP of a 200x200 canvas
 * centred at (100,100):  x = 100 + r*sin(t),  y = 100 - r*cos(t)
 * (minus because screen y grows downward). Each wedge i spans angles
 * i*a..(i+1)*a and is built as: outer arc (radius R2=92) along its angle
 * range, a line in to the inner radius R1=58, the inner arc back, and close.
 * Numbers are rotated to each wedge's middle angle ((i+0.5)*a) and printed
 * near the rim (y=19.5). Three stacked SVGs share one box: the wheel (#rlw,
 * rotated by RROT), the ball (#rlb) and the fixed pointer.
 * @returns {string} HTML.
 */
function wheelSvg() {
  var a = 360 / 37,
    R2 = 92,
    R1 = 58,
    o = '<circle cx="100" cy="100" r="97" fill="#3a2a14" stroke="#e3a73b" stroke-width="2"/>';
  function P(r, t) {
    var d = (t * Math.PI) / 180;
    return (100 + r * Math.sin(d)).toFixed(2) + ' ' + (100 - r * Math.cos(d)).toFixed(2);
  }
  RWH.forEach(function (n, i) {
    var c = rCol(n),
      col = c === 'r' ? '#c8374f' : c === 'b' ? '#1b1f27' : '#23863b';
    o +=
      '<path d="M' +
      P(R2, i * a) +
      'A' +
      R2 +
      ' ' +
      R2 +
      ' 0 0 1 ' +
      P(R2, (i + 1) * a) +
      'L' +
      P(R1, (i + 1) * a) +
      'A' +
      R1 +
      ' ' +
      R1 +
      ' 0 0 0 ' +
      P(R1, i * a) +
      'Z" fill="' +
      col +
      '" stroke="#8b97a8" stroke-width=".6"/><text transform="rotate(' +
      ((i + 0.5) * a).toFixed(2) +
      ' 100 100)" x="100" y="19.5" text-anchor="middle" font-size="7.5" font-weight="700" fill="#fff" font-family="Barlow Condensed,sans-serif">' +
      n +
      '</text>';
  });
  o +=
    '<circle cx="100" cy="100" r="58" fill="#161D26" stroke="#e3a73b" stroke-width="2"/><circle cx="100" cy="100" r="30" fill="#0B0F14" stroke="#e3a73b" stroke-width="1.5"/><path d="M100 72V128M72 100H128" stroke="#e3a73b" stroke-width="3"/><circle cx="100" cy="100" r="6" fill="#e3a73b"/>';
  return (
    '<div class="wl"><svg id="rlw" viewBox="0 0 200 200" role="img" aria-label="Roulette wheel" style="transform:rotate(' +
    RROT +
    'deg)">' +
    o +
    '</svg><svg id="rlb" viewBox="0 0 200 200"><circle cx="100" cy="36" r="4.5" fill="#fff" stroke="#999" stroke-width=".8"/></svg><svg viewBox="0 0 200 200"><path d="M92 0H108L100 15Z" fill="#FFB547" stroke="#000" stroke-width=".8"/></svg></div>'
  );
}

/**
 * Builds the Roulette card: wheel, last result, current bet label, nine
 * outside-bet buttons, the 0..36 number grid and the Spin button.
 * `k(t,v)` returns ' sel' for the currently selected bet so style.css can
 * outline it. All bet buttons are disabled while busy.
 * @returns {string} HTML.
 */
function rlView() {
  var left = casLeft(),
    b = casBet(),
    s = S.rsel,
    busy = casBusy(),
    off = busy ? ' disabled' : '',
    k = function (t, v) {
      return s && s.t === t && s.v === v ? ' sel' : '';
    },
    c =
      '<div class="card"><h2>Roulette</h2><p class="log">European wheel with a single zero. Pick one bet, then spin. Numbers pay 35 to 1, dozens 2 to 1, everything else 1 to 1. Zero beats every outside bet.</p>' +
      wheelSvg();
  if (S.rlr && !S.rl && !CANIM)
    c += '<p class="lead" style="text-align:center"><b>' + S.rlr.m + '</b></p>';
  c +=
    '<p class="lead"><b>Your bet:</b> ' +
    (s ? rName(s) : 'none selected') +
    '</p><div class="btns" style="flex-wrap:wrap;margin-bottom:6px"><button class="rr' +
    k('r') +
    '" style="flex:1 1 30%"' +
    off +
    ' onclick="rSel(\'r\')">Red</button><button class="rb' +
    k('b') +
    '" style="flex:1 1 30%"' +
    off +
    ' onclick="rSel(\'b\')">Black</button><button class="' +
    k('o').trim() +
    '" style="flex:1 1 30%"' +
    off +
    ' onclick="rSel(\'o\')">Odd</button><button class="' +
    k('e').trim() +
    '" style="flex:1 1 30%"' +
    off +
    ' onclick="rSel(\'e\')">Even</button><button class="' +
    k('lo').trim() +
    '" style="flex:1 1 30%"' +
    off +
    ' onclick="rSel(\'lo\')">1-18</button><button class="' +
    k('hi').trim() +
    '" style="flex:1 1 30%"' +
    off +
    ' onclick="rSel(\'hi\')">19-36</button><button class="' +
    k('d1').trim() +
    '" style="flex:1 1 30%"' +
    off +
    ' onclick="rSel(\'d1\')">1st 12</button><button class="' +
    k('d2').trim() +
    '" style="flex:1 1 30%"' +
    off +
    ' onclick="rSel(\'d2\')">2nd 12</button><button class="' +
    k('d3').trim() +
    '" style="flex:1 1 30%"' +
    off +
    ' onclick="rSel(\'d3\')">3rd 12</button></div><div class="rgrid">';
  for (var n = 0; n <= 36; n++)
    c +=
      '<button class="r' +
      rCol(n) +
      k('n', n) +
      '"' +
      off +
      " onclick=\"rSel('n'," +
      n +
      ')">' +
      n +
      '</button>';
  return (
    c +
    '</div><button class="main full" onclick="rlSpin()"' +
    (left < 1 || S.cash < b || !s || busy ? ' disabled' : '') +
    '>' +
    (left < 1 ? 'No plays left this year' : !s ? 'Pick a bet first' : 'Spin \u00b7 bet ' + gbp(b)) +
    '</button></div>'
  );
}

/* ======================== CASINO TAB ROOT ======================== */

/**
 * Builds the Casino tab: header with plays left, bet-size buttons, the game
 * switcher, then the active game's card (default blackjack).
 * First settles any game left pending by a reload (when no animation runs).
 * While a game is in progress other games and bet sizes are disabled so a
 * round cannot be abandoned.
 * @returns {string} HTML.
 */
function casinoView() {
  if (!CANIM) casResolve();
  var left = casLeft(),
    busy = casBusy(),
    g = S.cg || 'bj',
    b = casBet();
  var h =
    '<div class="card"><h2>Casino</h2><p class="log">Plays left this year: <b>' +
    left +
    '</b> of ' +
    CASINO_LIMIT +
    '. Each hand, spin or round uses one play. You bet with the cash in your pocket, and the house always has an edge.</p><p class="lead"><b>Bet size</b></p><div class="btns" style="flex-wrap:wrap;margin-bottom:8px">' +
    CBETS.map(function (v) {
      return (
        '<button style="flex:1 1 28%" class="' +
        (v === b ? 'main' : '') +
        '"' +
        (busy ? ' disabled' : '') +
        ' onclick="setCbet(' +
        v +
        ')">' +
        gbpS(v) +
        '</button>'
      );
    }).join('') +
    '</div><div class="btns">' +
    [
      ['bj', 'Blackjack'],
      ['sl', 'Slots'],
      ['rl', 'Roulette'],
    ]
      .map(function (x) {
        return (
          '<button style="flex:1" class="' +
          (g === x[0] ? 'main' : '') +
          '"' +
          (busy && g !== x[0] ? ' disabled' : '') +
          ' onclick="casGame(\'' +
          x[0] +
          '\')">' +
          x[1] +
          '</button>'
        );
      })
      .join('') +
    '</div></div>';
  return h + (g === 'sl' ? slView() : g === 'rl' ? rlView() : bjView());
}
