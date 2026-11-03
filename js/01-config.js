/* Kingpin: Bloodline  |  js/01-config.js
 * Version, balance constants, every static data table and the global runtime variables.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ====================  SECTION 1: CONFIG & VERSION  =========================
 * ========================================================================== */

/** VERSION NUMBER: change the number on the next line each release. */
var VERSION = '0.63';

/** RELEASE SWITCH: set DEV_TOOLS to false before uploading a store build.
 *  It removes "Dev tools" from the in-game menu completely. While it is true,
 *  the tools are behind a password. Only a hash of the password is stored
 *  here (see devCheck in 28-dev.js), which hides it from a casual read, but
 *  anyone determined can still get past a check that runs on their own device,
 *  so the switch is the real protection. */
var DEV_TOOLS = true,
  DEV_PW_HASH = '45f99e85';

/** TRAVEL & TIP-OFFS (see 26-intel.js).
 *  FARE_BASE + FARE_LVL * level : cost of getting to another district.
 *  WALK_FED : fed lost when you can't afford the fare and walk instead
 *             (paying travellers lose the normal 10 fed).
 *  TIP_BASE * level ^ TIP_EXP  : cost of a contact's tip-off on one district's
 *             prices for this year (level 1: £15, level 10: £474, level 20: £1,342). */
var FARE_BASE = 2,
  FARE_LVL = 3,
  WALK_FED = 20,
  TIP_BASE = 15,
  TIP_EXP = 1.5;

/** Game-wide constants.
 *  CAP  : pocket slots with no bag.
 *  DAYS : number of "years" (turns) per life (age 18 to 68).
 *  AGE0 : age offset, so age = AGE0 + day (day 1 => age 18).
 *  LAB  : cost to build a lab in a property.
 *  LABDISC : discount applied to a drug's LOWEST list price (g.lo) to get the
 *            fixed lab ingredient cost per unit (0.1 = 10% below the lowest).
 *  S    : the one global game-state object (created by newGame()/load()).
 *  best : best net worth ever reached on this device. */
var CAP = 15,
  DAYS = 50,
  AGE0 = 17,
  LAB = 1200,
  LABDISC = 0.1,
  S,
  best = 0;

/* ============================================================================
 * ====================  SECTION 2: STATIC DATA TABLES  =======================
 * ========================================================================== */
/* Pure data: no logic runs here, except AREAS.forEach below, which needs
   GOODS to exist first. */

/** GOODS: the nine tradable drugs.
 *  id    : key used in S.inv / S.prices / S.paid.
 *  lo/hi : price range (pounds). A price starts as random between these.
 *  eq    : cost of the lab equipment for that drug.
 *  u     : player level required to unlock it. */
var GOODS = [
  { id: 'weed', n: 'Weed', lo: 15, hi: 60, eq: 300, u: 1 },
  { id: 'shrooms', n: 'Shrooms', lo: 25, hi: 90, eq: 600, u: 1 },
  { id: 'hash', n: 'Hash', lo: 40, hi: 140, eq: 1000, u: 1 },
  { id: 'speed', n: 'Speed', lo: 70, hi: 220, eq: 2000, u: 3 },
  { id: 'mdma', n: 'MDMA', lo: 120, hi: 380, eq: 4000, u: 5 },
  { id: 'lsd', n: 'LSD', lo: 200, hi: 600, eq: 7000, u: 8 },
  { id: 'coke', n: 'Coke', lo: 400, hi: 1200, eq: 12000, u: 11 },
  { id: 'meth', n: 'Meth', lo: 700, hi: 2000, eq: 20000, u: 14 },
  { id: 'heroin', n: 'Heroin', lo: 1200, hi: 3600, eq: 35000, u: 17 },
];

/** AREAS: the five districts.
 *  heat : police multiplier (higher = more police attention).
 *  b    : per-drug price bias, listed in GOODS order (1 = normal;
 *         1.3 = 30% dearer here, 0.7 = 30% cheaper). */
var AREAS = [
  { n: 'Docklands', heat: 0.5, b: [0.8, 1, 1.2, 0.9, 1.1, 1, 1.1, 0.8, 1.2] },
  { n: 'Old Town', heat: 0.8, b: [1.1, 0.8, 1, 1.2, 0.9, 1.2, 0.8, 1.1, 1] },
  { n: 'The Estate', heat: 0.6, b: [0.9, 1.2, 0.8, 1.1, 1.2, 0.8, 1, 1.2, 0.8] },
  { n: 'Station Row', heat: 1, b: [1, 1, 1.1, 0.8, 1, 1.1, 1.2, 1, 0.9] },
  { n: 'Uptown', heat: 1.2, b: [1.3, 0.9, 1.1, 1, 0.8, 1.3, 0.7, 1.1, 1.1] },
];

/* LOAD-TIME TRANSFORM: turn each district's bias array into a lookup object
   keyed by drug id, so later code can write AREAS[i].b['weed'] instead of
   remembering array positions. */
AREAS.forEach(function (a) {
  var o = {};
  a.b.forEach(function (v, i) {
    o[GOODS[i].id] = v;
  });
  a.b = o;
});

/** FOOD: c = cost, f = fed points restored, h = health restored. */
var FOOD = [
  { n: 'Bread and cheese', c: 3, f: 15, h: 0 },
  { n: 'Chip shop box', c: 6, f: 35, h: 0 },
  { n: 'Kebab', c: 10, f: 45, h: 0 },
  { n: 'Hot sit-down meal', c: 16, f: 65, h: 5 },
  { n: 'Roast dinner', c: 28, f: 85, h: 8 },
  { n: 'Restaurant feast', c: 70, f: 100, h: 15 },
];

/** MEDS: c = cost, h = health restored. */
var MEDS = [
  { n: 'Painkillers', c: 12, h: 10 },
  { n: 'First aid kit', c: 40, h: 25 },
  { n: 'Doctor\u2019s visit', c: 120, h: 45 },
  { n: 'Private clinic', c: 400, h: 70 },
  { n: 'Hospital stay', c: 1500, h: 100 },
];

/** ROUGH: the "bed" used when you have no property in the current district.
 *  rob  : chance of being robbed overnight (32%).
 *  arr  : base arrest chance (16%), used in the heat calculation.
 *  cold : health lost if the 20% cold roll hits. */
var ROUGH = { n: 'sleeping rough', rob: 0.32, arr: 0.16, cold: 12 };

/** PROPS: purchasable homes, cheapest to richest.
 *  u    : level required.     c   : purchase price (resale is 80%).
 *  up   : yearly upkeep.      rob : yearly burglary chance.
 *  arr  : base arrest chance used in heat. info : flavour text.
 *  Safe capacity per property is the matching entry in SLOTS (below). */
var PROPS = [
  {
    n: 'Hostel',
    u: 1,
    c: 100,
    up: 30,
    rob: 0.12,
    arr: 0.05,
    info: 'A dorm bed with a locker. Warm and cheap to buy, costly to keep.',
  },
  { n: 'Bedsit', u: 3, c: 1000, up: 10, rob: 0.08, arr: 0.03, info: 'Thin walls, basic lock.' },
  { n: 'Flat', u: 5, c: 5000, up: 40, rob: 0.03, arr: 0.015, info: 'Solid door, quiet block.' },
  {
    n: 'Safehouse',
    u: 7,
    c: 30000,
    up: 150,
    rob: 0.01,
    arr: 0.005,
    info: 'Fortified. Almost nobody gets in.',
  },
  {
    n: 'Townhouse',
    u: 9,
    c: 150000,
    up: 600,
    rob: 0.005,
    arr: 0.002,
    info: 'Gated, with cameras and a private garage.',
  },
  {
    n: 'Manor',
    u: 11,
    c: 1000000,
    up: 2500,
    rob: 0.002,
    arr: 0.001,
    info: 'Walls, guards and a long driveway.',
  },
  {
    n: 'Penthouse',
    u: 14,
    c: 3000000,
    up: 7500,
    rob: 0.001,
    arr: 0.0005,
    info: 'Top floor, private lift, armed concierge.',
  },
  {
    n: 'Fortress compound',
    u: 18,
    c: 10000000,
    up: 25000,
    rob: 0.0005,
    arr: 0.0003,
    info: 'Walled grounds, a private army and a helipad.',
  },
  {
    n: 'Private island',
    u: 20,
    c: 40000000,
    up: 90000,
    rob: 0.0002,
    arr: 0.0001,
    info: 'Your own island. Nobody comes here uninvited.',
  },
];

/** SLOTS: safe capacity (units) per property, in PROPS order. */
var SLOTS = [10, 20, 40, 80, 150, 300, 500, 800, 1500];

/** GUNS: c = cost, u = unlock level,
 *  b = bonus added to fight-win odds (0.10 = +10 percentage points),
 *  y = extra prison years if police find it on you. */
var GUNS = [
  { n: 'Knife', c: 150, u: 1, b: 0.1, y: 1 },
  { n: 'Pistol', c: 1200, u: 3, b: 0.2, y: 2 },
  { n: 'Shotgun', c: 4500, u: 6, b: 0.3, y: 3 },
  { n: 'SMG', c: 15000, u: 9, b: 0.38, y: 4 },
  { n: 'Assault rifle', c: 40000, u: 12, b: 0.45, y: 5 },
  { n: 'Light machine gun', c: 90000, u: 15, b: 0.52, y: 6 },
  { n: 'Heavy machine gun', c: 250000, u: 19, b: 0.6, y: 7 },
];

/** BAGS: c = cost, u = unlock level, s = extra pocket slots. */
var BAGS = [
  { n: 'Gym bag', c: 300, u: 1, s: 10 },
  { n: 'Backpack', c: 1500, u: 2, s: 20 },
  { n: 'Duffel bag', c: 8000, u: 4, s: 40 },
  { n: 'Rucksack', c: 40000, u: 8, s: 75 },
  { n: 'Smuggler\u2019s trunk', c: 200000, u: 10, s: 150 },
  { n: 'Delivery van', c: 600000, u: 13, s: 300 },
  { n: 'Cargo container', c: 2500000, u: 17, s: 600 },
];

/** PROT: police bribes.
 *  c = cost, u = unlock level,
 *  cut = fraction of heat removed, y = years it lasts.
 *  No bribe reaches 1 (total immunity): even the president leaves 4% of your
 *  heat, so a big operation (several labs cooking, lots of stock) still draws
 *  some police attention. */
var PROT = [
  { n: 'Beat cops', u: 1, c: 400, cut: 0.3, y: 2 },
  { n: 'Detectives', u: 4, c: 2500, cut: 0.55, y: 3 },
  { n: 'Police chief', u: 7, c: 12000, cut: 0.8, y: 4 },
  { n: 'The mayor', u: 10, c: 60000, cut: 0.85, y: 3 },
  { n: 'The governor', u: 16, c: 250000, cut: 0.92, y: 5 },
  { n: 'The president', u: 20, c: 1500000, cut: 0.96, y: 8 },
];

/** JOBS: one cash-in-hand job allowed per year.
 *  lo/hi : pay range.
 *  arr   : chance of a police stop (before heat scaling).
 *  hurt  : chance the job goes wrong (health loss, half pay). */
var JOBS = [
  {
    n: 'Wash dishes',
    lo: 12,
    hi: 22,
    info: 'Cash in hand at the back of a kitchen. Safe, but poor pay.',
  },
  {
    n: 'Deliver a package',
    lo: 35,
    hi: 75,
    arr: 0.12,
    info: 'No questions asked. Police may stop you on the way.',
  },
  {
    n: 'Collect a debt',
    lo: 60,
    hi: 130,
    hurt: 0.3,
    info: 'Knock on a door, leave with cash. It can turn nasty.',
  },
];

/** XP TABLE: XPT[i] is the total XP needed to REACH level i+1 (20 levels).
 *  LVLN[i] is the title shown for level i+1. */
var XPT = [
  0, 25, 75, 150, 250, 375, 525, 700, 900, 1125, 1375, 1650, 1950, 2275, 2625, 3000, 3400, 3825,
  4275, 4750,
];
var LVLN = [
  'Street Kid',
  'Lookout',
  'Runner',
  'Corner Boy',
  'Hustler',
  'Dealer',
  'Supplier',
  'Enforcer',
  'Crew Boss',
  'Distributor',
  'Fixer',
  'Lieutenant',
  'Made Man',
  'Importer',
  'Underboss',
  'Consigliere',
  'Crime Boss',
  'Syndicate Head',
  'Godfather',
  'Kingpin',
];

/** XP FORMULA CONSTANTS (see yearXp in a later part):
 *  XP = floor( sqrt(profit) / (XPD * level^XPK) )
 *  KB / KS : market-fatigue strength for buying / selling (see buy/sell). */
var XPD = 1.2649,
  XPK = 1.965,
  KB = 0.5,
  KS = 0.7;

/** NAME POOLS for random first names (by gender) and family surnames. */
var NM = {
    M: [
      'Marco',
      'Tony',
      'Vince',
      'Dominic',
      'Luca',
      'Sal',
      'Rico',
      'Frankie',
      'Nico',
      'Enzo',
      'Carlo',
      'Dante',
      'Mateo',
      'Silas',
      'Rafe',
      'Jonah',
    ],
    F: [
      'Gina',
      'Rosa',
      'Lucia',
      'Sofia',
      'Carmen',
      'Vera',
      'Bianca',
      'Delia',
      'Mara',
      'Nina',
      'Elena',
      'Paloma',
      'Ines',
      'Talia',
      'Odette',
      'Renata',
    ],
  },
  SN = [
    'Vance',
    'Moretti',
    'Reyes',
    'Kane',
    'Novak',
    'Doyle',
    'Marlowe',
    'Castellano',
    'Blackwood',
    'Navarro',
    'Volkov',
    'Ferro',
  ];

/* ============================================================================
 * ==================  SECTION 3: GLOBAL RUNTIME VARIABLES  ===================
 * ========================================================================== */

/** Event queue and render trackers.
 *  Q   : events waiting while another event popup is open.
 *  LEV : the last event object rendered; LV: last view; LT: last tab.
 *        render() compares them to decide whether to scroll to the top
 *        (new screen) or preserve the scroll position (small update). */
var Q = [],
  LEV = null,
  LV = null,
  LT = null;

/** Menu overlay state.
 *  M  : which menu is open (null = none; 'menu','help','log','tree',
 *       'confirm','devpw','dev','assign').
 *  MB : the menu to return to when "Back" is pressed.
 *  DEVR : dev tool flag that shows price ranges (persisted as tn_devr). */
var M = null,
  MB = null,
  DEVR = false;
try {
  DEVR = !!localStorage.getItem('tn_devr');
} catch (e) {}

/** Crew assignment target: which relative (i) and which task (k). */
var AS = { i: 0, k: 'cook' };

/* Load the device's best score. The unary + converts the stored string to a
   number; "|| 0" covers null/NaN. try/catch because private browsing can
   block localStorage. */
try {
  best = +localStorage.getItem('tn_best') || 0;
} catch (e) {}
