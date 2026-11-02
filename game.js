/* ============================================================================
 * KINGPIN: BLOODLINE  |  game.js
 * ----------------------------------------------------------------------------
 * ARCHITECTURE: The complete game engine: static balance tables, the single
 * global state object `S`, the trading/police/property/lab/bank/casino rules,
 * a procedural SVG portrait generator, and a string-template renderer that
 * rewrites the #app element after every state change.
 * LIFECYCLE:    Loads at the end of index.html; defines everything, then the
 * last lines hide #app and play the start-screen intro. From then on it is
 * purely event driven: inline onclick handlers mutate `S`, then call render().
 * DEPENDENCIES: index.html (#app, #start, #st-panel, #st-main), style.css
 * classes, and localStorage keys tn_save, tn_best and tn_devr.
 * ============================================================================ */

/* ============================================================================
 * ============================  DATA FLOW MAP  ===============================
 * ============================================================================
 *
 *  PLAYER TAP (inline onclick="fn(args)")
 *        |
 *        v
 *  ACTION FUNCTION   buy / sell / eat / heal / travel / buyProp / dep / wd /
 *  (mutates S)       cook / bankIn / bribe / work / bjDeal / slSpin / rlSpin
 *        |
 *        |-- may raise an EVENT --> ask(title, text, choices) puts S.ev
 *        |        |                  (or queues it in Q if one is open)
 *        |        v
 *        |   player taps a choice --> choose(i) --> choice.fn() --> after()
 *        |        (Fight/Run/Give up/Bribe, mugging, arrest, notices)
 *        v
 *  render()  <----------------------------------------------------------+
 *        |   reads S (and M for menu overlays), builds an HTML string    |
 *        |   by view: create / heirname / event / day (tabs)             |
 *        |   then writes #app.innerHTML                                  |
 *        v                                                               |
 *  save()   S -> localStorage "tn_save" (skipped while an event is open) |
 *                                                                        |
 *  THE YEAR TURN (button "Let the year pass")                            |
 *  endDay() -> upkeep/eviction -> sleep(bed):                            |
 *      robbery roll -> cold/hunger -> S.day++ -> raid(heat roll)         |
 *      -> finishBatches -> coolMarkets -> roll() new prices              |
 *      -> crewYear -> yearXp (profit -> XP -> level unlocks)             |
 *      -> death/age check -> render() ----------------------------------+
 *
 *  DEATH: S.hp<=0 or S.day>DAYS -> S.view='over' -> heir(sex) builds a new
 *  S carrying over half the wealth, level, bag, property and crew.
 *
 *  STARTUP: stIntro() timers add .p1-.p4 to #start -> stPanel('main') ->
 *  stNew()/stLoad() -> newGame()/load() -> render().
 *
 *  KEY STATE FIELDS (S): day, gen, cash, bank, hp, food, loc, inv{}, paid{},
 *  prices{}, flag{}, prop{}, guns[], bag, xp, bribe, fat{} (market fatigue),
 *  yp{} (yearly profit trackers), fam[], line[], look{}, view, tab, ev, log[]
 * ========================================================================== */


/* ============================================================================
 * ====================  SECTION 1: CONFIG & VERSION  =========================
 * ========================================================================== */

/** VERSION NUMBER: change the number on the next line each release. */
var VERSION='0.49';

/** Game-wide constants.
 *  CAP  : pocket slots with no bag.
 *  DAYS : number of "years" (turns) per life (age 18 to 68).
 *  AGE0 : age offset, so age = AGE0 + day (day 1 => age 18).
 *  LAB  : cost to build a lab in a property.
 *  LABDISC : discount applied to a drug's LOWEST list price (g.lo) to get the
 *            fixed lab ingredient cost per unit (0.1 = 10% below the lowest).
 *  S    : the one global game-state object (created by newGame()/load()).
 *  best : best net worth ever reached on this device. */
var CAP=15,DAYS=50,AGE0=17,LAB=1200,LABDISC=.1,S,best=0;


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
var GOODS=[{id:'weed',n:'Weed',lo:15,hi:60,eq:300,u:1},{id:'shrooms',n:'Shrooms',lo:25,hi:90,eq:600,u:1},{id:'hash',n:'Hash',lo:40,hi:140,eq:1000,u:1},{id:'speed',n:'Speed',lo:70,hi:220,eq:2000,u:3},{id:'mdma',n:'MDMA',lo:120,hi:380,eq:4000,u:5},{id:'lsd',n:'LSD',lo:200,hi:600,eq:7000,u:8},{id:'coke',n:'Coke',lo:400,hi:1200,eq:12000,u:11},{id:'meth',n:'Meth',lo:700,hi:2000,eq:20000,u:14},{id:'heroin',n:'Heroin',lo:1200,hi:3600,eq:35000,u:17}];

/** AREAS: the five districts.
 *  heat : police multiplier (higher = more police attention).
 *  b    : per-drug price bias, listed in GOODS order (1 = normal;
 *         1.3 = 30% dearer here, 0.7 = 30% cheaper). */
var AREAS=[{n:'Docklands',heat:.5,b:[.8,1,1.2,.9,1.1,1,1.1,.8,1.2]},{n:'Old Town',heat:.8,b:[1.1,.8,1,1.2,.9,1.2,.8,1.1,1]},{n:'The Estate',heat:.6,b:[.9,1.2,.8,1.1,1.2,.8,1,1.2,.8]},{n:'Station Row',heat:1,b:[1,1,1.1,.8,1,1.1,1.2,1,.9]},{n:'Uptown',heat:1.2,b:[1.3,.9,1.1,1,.8,1.3,.7,1.1,1.1]}];

/* LOAD-TIME TRANSFORM: turn each district's bias array into a lookup object
   keyed by drug id, so later code can write AREAS[i].b['weed'] instead of
   remembering array positions. */
AREAS.forEach(function(a){var o={};a.b.forEach(function(v,i){o[GOODS[i].id]=v});a.b=o});

/** FOOD: c = cost, f = fed points restored, h = health restored. */
var FOOD=[{n:'Bread and cheese',c:3,f:15,h:0},{n:'Chip shop box',c:6,f:35,h:0},{n:'Kebab',c:10,f:45,h:0},{n:'Hot sit-down meal',c:16,f:65,h:5},{n:'Roast dinner',c:28,f:85,h:8},{n:'Restaurant feast',c:70,f:100,h:15}];

/** MEDS: c = cost, h = health restored. */
var MEDS=[{n:'Painkillers',c:12,h:10},{n:'First aid kit',c:40,h:25},{n:'Doctor\u2019s visit',c:120,h:45},{n:'Private clinic',c:400,h:70},{n:'Hospital stay',c:1500,h:100}];

/** ROUGH: the "bed" used when you have no property in the current district.
 *  rob  : chance of being robbed overnight (32%).
 *  arr  : base arrest chance (16%), used in the heat calculation.
 *  cold : health lost if the 20% cold roll hits. */
var ROUGH={n:'sleeping rough',rob:.32,arr:.16,cold:12};

/** PROPS: purchasable homes, cheapest to richest.
 *  u    : level required.     c   : purchase price (resale is 80%).
 *  up   : yearly upkeep.      rob : yearly burglary chance.
 *  arr  : base arrest chance used in heat. info : flavour text.
 *  Safe capacity per property is the matching entry in SLOTS (below). */
var PROPS=[{n:'Hostel',u:1,c:100,up:30,rob:.12,arr:.05,info:'A dorm bed with a locker. Warm and cheap to buy, costly to keep.'},{n:'Bedsit',u:3,c:1000,up:10,rob:.08,arr:.03,info:'Thin walls, basic lock.'},{n:'Flat',u:5,c:5000,up:40,rob:.03,arr:.015,info:'Solid door, quiet block.'},{n:'Safehouse',u:7,c:30000,up:150,rob:.01,arr:.005,info:'Fortified. Almost nobody gets in.'},{n:'Townhouse',u:9,c:150000,up:600,rob:.005,arr:.002,info:'Gated, with cameras and a private garage.'},{n:'Manor',u:11,c:1000000,up:2500,rob:.002,arr:.001,info:'Walls, guards and a long driveway.'},{n:'Penthouse',u:14,c:3000000,up:7500,rob:.001,arr:.0005,info:'Top floor, private lift, armed concierge.'},{n:'Fortress compound',u:18,c:10000000,up:25000,rob:.0005,arr:.0003,info:'Walled grounds, a private army and a helipad.'},{n:'Private island',u:20,c:40000000,up:90000,rob:.0002,arr:.0001,info:'Your own island. Nobody comes here uninvited.'}];

/** SLOTS: safe capacity (units) per property, in PROPS order. */
var SLOTS=[10,20,40,80,150,300,500,800,1500];

/** GUNS: c = cost, u = unlock level,
 *  b = bonus added to fight-win odds (0.10 = +10 percentage points),
 *  y = extra prison years if police find it on you. */
var GUNS=[{n:'Knife',c:150,u:1,b:.1,y:1},{n:'Pistol',c:1200,u:3,b:.2,y:2},{n:'Shotgun',c:4500,u:6,b:.3,y:3},{n:'SMG',c:15000,u:9,b:.38,y:4},{n:'Assault rifle',c:40000,u:12,b:.45,y:5},{n:'Light machine gun',c:90000,u:15,b:.52,y:6},{n:'Heavy machine gun',c:250000,u:19,b:.6,y:7}];

/** BAGS: c = cost, u = unlock level, s = extra pocket slots. */
var BAGS=[{n:'Gym bag',c:300,u:1,s:10},{n:'Backpack',c:1500,u:2,s:20},{n:'Duffel bag',c:8000,u:4,s:40},{n:'Rucksack',c:40000,u:8,s:75},{n:'Smuggler\u2019s trunk',c:200000,u:10,s:150},{n:'Delivery van',c:600000,u:13,s:300},{n:'Cargo container',c:2500000,u:17,s:600}];

/** PROT: police bribes.
 *  c = cost, u = unlock level,
 *  cut = fraction of heat removed (1 = total immunity), y = years it lasts. */
var PROT=[{n:'Beat cops',u:1,c:400,cut:.3,y:2},{n:'Detectives',u:4,c:2500,cut:.55,y:3},{n:'Police chief',u:7,c:12000,cut:.8,y:4},{n:'The mayor',u:10,c:60000,cut:1,y:3},{n:'The governor',u:16,c:250000,cut:1,y:5},{n:'The president',u:20,c:1500000,cut:1,y:8}];

/** JOBS: one cash-in-hand job allowed per year.
 *  lo/hi : pay range.
 *  arr   : chance of a police stop (before heat scaling).
 *  hurt  : chance the job goes wrong (health loss, half pay). */
var JOBS=[{n:'Wash dishes',lo:12,hi:22,info:'Cash in hand at the back of a kitchen. Safe, but poor pay.'},{n:'Deliver a package',lo:35,hi:75,arr:.12,info:'No questions asked. Police may stop you on the way.'},{n:'Collect a debt',lo:60,hi:130,hurt:.3,info:'Knock on a door, leave with cash. It can turn nasty.'}];

/** XP TABLE: XPT[i] is the total XP needed to REACH level i+1 (20 levels).
 *  LVLN[i] is the title shown for level i+1. */
var XPT=[0,25,75,150,250,375,525,700,900,1125,1375,1650,1950,2275,2625,3000,3400,3825,4275,4750];
var LVLN=['Street Kid','Lookout','Runner','Corner Boy','Hustler','Dealer','Supplier','Enforcer','Crew Boss','Distributor','Fixer','Lieutenant','Made Man','Importer','Underboss','Consigliere','Crime Boss','Syndicate Head','Godfather','Kingpin'];

/** XP FORMULA CONSTANTS (see yearXp in a later part):
 *  XP = floor( sqrt(profit) / (XPD * level^XPK) )
 *  KB / KS : market-fatigue strength for buying / selling (see buy/sell). */
var XPD=1.2649,XPK=1.965,KB=.5,KS=.7;

/** NAME POOLS for random first names (by gender) and family surnames. */
var NM={M:['Marco','Tony','Vince','Dominic','Luca','Sal','Rico','Frankie','Nico','Enzo','Carlo','Dante','Mateo','Silas','Rafe','Jonah'],F:['Gina','Rosa','Lucia','Sofia','Carmen','Vera','Bianca','Delia','Mara','Nina','Elena','Paloma','Ines','Talia','Odette','Renata']},SN=['Vance','Moretti','Reyes','Kane','Novak','Doyle','Marlowe','Castellano','Blackwood','Navarro','Volkov','Ferro'];


/* ============================================================================
 * ==================  SECTION 3: GLOBAL RUNTIME VARIABLES  ===================
 * ========================================================================== */

/** Event queue and render trackers.
 *  Q   : events waiting while another event popup is open.
 *  LEV : the last event object rendered; LV: last view; LT: last tab.
 *        render() compares them to decide whether to scroll to the top
 *        (new screen) or preserve the scroll position (small update). */
var Q=[],LEV=null,LV=null,LT=null;

/** Menu overlay state.
 *  M  : which menu is open (null = none; 'menu','help','log','tree',
 *       'confirm','devpw','dev','assign').
 *  MB : the menu to return to when "Back" is pressed.
 *  DEVR : dev tool flag that shows price ranges (persisted as tn_devr). */
var M=null,MB=null,DEVR=false;try{DEVR=!!localStorage.getItem('tn_devr')}catch(e){}

/** Crew assignment target: which relative (i) and which task (k). */
var AS={i:0,k:'cook'};

/* Load the device's best score. The unary + converts the stored string to a
   number; "|| 0" covers null/NaN. try/catch because private browsing can
   block localStorage. */
try{best=+localStorage.getItem('tn_best')||0}catch(e){}


/* ============================================================================
 * =====================  SECTION 4: BASIC UTILITIES  =========================
 * ========================================================================== */

/**
 * Short alias for document.getElementById.
 * @param {string} i - Element id.
 * @returns {HTMLElement|null} The element, or null if it doesn't exist.
 */
var $=function(i){return document.getElementById(i)};

/**
 * Random decimal in [a, b).
 * MATH: Math.random() gives 0..1; scaling by (b - a) stretches the range
 * and adding a shifts it to start at a.
 * @param {number} a - Lower bound (inclusive).
 * @param {number} b - Upper bound (exclusive).
 * @returns {number}
 */
function rnd(a,b){return a+Math.random()*(b-a)}

/**
 * Random probability roll in [0, 1). Compare with a chance: `pick()<0.3`
 * is true 30% of the time.
 * @returns {number}
 */
function pick(){return Math.random()}

/**
 * Limits a value to a range ("clamping"), e.g. keeps health within 0..100.
 * MATH: min(v, b) caps the top, then max(a, ...) lifts the bottom.
 * @param {number} v - Value to limit.
 * @param {number} a - Minimum.
 * @param {number} b - Maximum.
 * @returns {number}
 */
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}

/**
 * Formats a number as British pounds with thousands separators.
 * @param {number} n - Amount (rounded to whole pounds).
 * @returns {string} e.g. 12345 -> "£12,345".
 */
function gbp(n){return '£'+Math.round(n).toLocaleString('en-GB')}

/**
 * Short money format for tight spaces (the Cash stat tile).
 * MATH: for n >= 1,000,000, n/1e4 shifts the decimal four places, round()
 * drops the remainder, and /100 gives millions to two decimals
 * (e.g. 1,234,567 -> 123.4567 -> 123 -> 1.23).
 * @param {number} n - Amount in pounds.
 * @returns {string} "£1.23m" for millions, otherwise normal gbp().
 */
function gbpS(n){return n>=1e6?'£'+(Math.round(n/1e4)/100)+'m':gbp(n)}

/**
 * The character's current age. day 1 -> 18; capped at day DAYS (age 67)
 * so the display never exceeds the life span.
 * @returns {number}
 */
function age(){return AGE0+Math.min(S.day,DAYS)}

/**
 * Total items in the player's pockets (all drugs, not the safe).
 * @returns {number}
 */
function carried(){return GOODS.reduce(function(t,g){return t+S.inv[g.id]},0)}

/**
 * Street value of pocket stock at today's local prices. Drives sentence
 * length and heat. MATH: sum of (units held x current price) per drug.
 * @returns {number} Pounds.
 */
function worth(){return GOODS.reduce(function(t,g){return t+S.inv[g.id]*S.prices[g.id]},0)}

/**
 * Builds an object with every drug id set to 0 (empty inventory / cleared
 * "average paid" table).
 * @returns {Object<string, number>}
 */
function zero(){var o={};GOODS.forEach(function(g){o[g.id]=0});return o}

/* ===================== END OF PART 1 ===================== */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 5: CHARACTER LOOK DATA (TABLES & INHERITANCE)  =============
 * ============================================================================
 * ========================================================================== */
/* A "look" object `l` describes one face:
 *   l.g     : 'M' or 'F'
 *   l.skin  : index into SKIN
 *   l.hcol  : hair colour index (HCOL)     l.fcol : facial-hair colour index
 *   l.ecol  : eye colour index (ECOL)
 *   l.hair/brow/eyes/nose/mouth/chin/fhair/acc : feature style 0-9
 * Everything is an integer index, so a look is tiny to save in localStorage. */

/** Eye colour names and hex values (parallel arrays, index = ecol). */
var ECN=['Brown','Dark brown','Hazel','Green','Blue','Grey','Amber','Black','Violet','Red'],ECOL=['#6b3f26','#3a2416','#a9743a','#3f9a5a','#3b7bd6','#8d99a6','#d9a02a','#151515','#8a4fd6','#d63a3a'];

/** Accessory names (same list for both genders). */
var ACCN=['None','Round glasses','Square glasses','Sunglasses','Eyepatch','Stud earrings','Hoop earrings','Headband','Bandana','Gold chain'];

/** FEAT: the editable feature list shown on the creation screen.
 *  Each entry is [key, label, {M:[10 names], F:[10 names]}].
 *  The order here is the order of rows on screen. */
var FEAT=[
['hair','Hair',{M:['Spiky','Buzzcut','Long','Slicked back','Bald','Mohawk','Side part','Afro','Man bun','Receding'],F:['Long straight','Bob','Pixie cut','Ponytail','Curly','Bun','Braid','Undercut','Waves','Shaved']}],
['brow','Eyebrows',{M:['Thick','Angry','Raised','Thin','Scowl','Unibrow','Arched','Scarred','Sad','Bushy'],F:['Thin arched','Straight','High arch','Natural','Angled','Pencil','Bold','Tapered','Fierce','Soft']}],
['eyes','Eyes',{M:['Narrow','Round','Wide','Sleepy','Sharp','Hooded','Deep-set','Squint','Staring','Tired'],F:['Almond','Round','Doe','Sleepy','Cat-eye','Narrow','Lashes','Downturned','Small','Smoky']}],
['nose','Nose',{M:['Straight','Button','Broad','Hooked','Narrow','Flat','Broken','Long','Bulbous','Upturned'],F:['Small','Button','Upturned','Narrow','Soft','Roman','Wide','Pointed','Delicate','Hooked']}],
['mouth','Mouth',{M:['Neutral','Smile','Frown','Smirk','Open','Grimace','Thin','Full','Half-smile','Cigarette'],F:['Full','Smile','Pout','Smirk','Open','Thin','Wide','Frown','Grin','Corner lift']}],
['chin','Head shape',{M:['Square','Long pointed','Oval','Wide jaw','Heart','Rectangle','Diamond','Round','Triangle','Heavy chin'],F:['Soft','Pointed','Round','Narrow','Heart','Oval','Delicate','Square','Small','Defined']}],
['fhair','Facial hair',{M:['None','Stubble','Moustache','Beard','Goatee','Full beard','Sideburns','Handlebar','Chinstrap','Soul patch'],F:['None','Freckles','Beauty mark','Cheek scar','Brow scar','Earrings','Teardrop tattoo','Nose stud','Black eye','Eyeliner wing']}],
['acc','Accessory',{M:ACCN,F:ACCN}]];

/** Skin tones (hex) and names; the last two are fun fantasy tones. */
var SKIN=['#f6dcc4','#f3d2b5','#e0ac80','#d09a6a','#c68a5c','#a8704a','#8f5a3a','#5a3622','#7fb2dc','#a6dca0'],SKINN=['Pale','Fair','Light','Olive','Tan','Brown','Dark brown','Deep','Smurf blue','Mint green'];

/** KEPT: labels of the two features an heir inherited this generation
 *  (filled by heirLook, shown in the heir naming screen and the log). */
var KEPT=[];

/** Hair colours (hex) and names, shared by head hair and facial hair. */
var HCOL=['#1f1610','#3a2416','#5c3b22','#7a3a1f','#c9a24a','#b4501f','#8d8d8d','#e4e0d4','#d9669f','#2fb5a8'],HCN=['Black','Dark brown','Brown','Auburn','Blonde','Ginger','Grey','White','Pink','Teal'];

/** PID: counter that gives every SVG clipPath a unique id ("c0","c1"...).
 *  Duplicate ids in one page would make portraits clip each other.
 *  LIP: lip fill colour used inside the MOUTH drawings. It MUST be defined
 *  before MOUTH, which builds strings with it at load time. */
var PID=0,LIP='#7a2b2b';


/* ============================================================================
 * ===================  SECTION 6: LOOK GENERATION & HEIRS  ===================
 * ========================================================================== */

/**
 * Random integer 0..9 (used for picking one of 10 styles/colours).
 * MATH: Math.random()*10 gives 0..9.999; floor() makes it 0..9, each equally likely.
 * @returns {number}
 */
function r5(){return Math.floor(Math.random()*10)}

/** Identical to r5(); kept as a second name used for feature picks.
 *  @returns {number} Integer 0..9. */
function r10(){return Math.floor(Math.random()*10)}

/**
 * Returns the display label for a feature row. Women's "Facial hair" row is
 * relabelled "Marks" because it holds freckles, scars and so on.
 * @param {Array} f - A FEAT entry.
 * @param {string} g - 'M' or 'F'.
 * @returns {string}
 */
function flab(f,g){return f[0]==='fhair'&&g==='F'?'Marks':f[1]}

/**
 * Returns the 10 option names for a feature and gender.
 * @param {Array} f - A FEAT entry.
 * @param {string} g - 'M' or 'F'.
 * @returns {string[]}
 */
function fnm(f,g){return f[2][g==='F'?'F':'M']}

/**
 * Builds a fresh random face.
 * WHY the special cases: 20% of the time facial hair uses its own colour
 * (so beards sometimes differ from head hair); women get "no marks" 50% of
 * the time and men "clean shaven" 30%, which looks more natural than
 * uniform randomness; accessories are "None" half the time.
 * @param {string} g - 'M' or 'F' (anything else is treated as 'M').
 * @returns {Object} A complete look object.
 */
function newLook(g){g=g==='F'?'F':'M';var l={g:g,skin:r5(),hcol:r5(),ecol:r10()};l.fcol=Math.random()<.8?l.hcol:r5();FEAT.forEach(function(f){l[f[0]]=r10()});if(g==='F'&&Math.random()<.5)l.fhair=0;if(g==='M'&&Math.random()<.3)l.fhair=0;l.acc=Math.random()<.5?0:r10();return l}

/**
 * Repairs a look loaded from an older save. Old saves lack newer fields
 * (eyebrows, head shape, eye colour, accessory); if any core field is
 * missing the look is regenerated, keeping the old skin tone.
 * @param {Object|null} l - Possibly incomplete look.
 * @param {string} [g] - Gender fallback.
 * @returns {Object} A complete, valid look.
 */
function fixLook(l,g){if(l&&l.g&&l.chin!=null&&l.brow!=null){if(l.ecol==null)l.ecol=r10();if(l.acc==null)l.acc=0;return l}var n=newLook(g||'M');if(l&&l.skin!=null)n.skin=l.skin;return n}

/**
 * Creates an heir's face from a parent's.
 * INHERITANCE RULE: skin, hair, facial-hair and eye COLOURS always pass
 * down. Of the 8 features, 2 random ones are kept and the other 6 are
 * re-rolled; the do/while guarantees the new value DIFFERS from the parent's,
 * so only the two kept features look familiar.
 * HOW the 2 are chosen: copy FEAT, shuffle with a random comparator
 * (sort(() => random-0.5)), take the first two.
 * @param {Object} p - Parent look.
 * @param {string} g - Heir gender 'M' or 'F'.
 * @returns {Object} The heir's look. Also fills the KEPT global.
 */
function heirLook(p,g){var ks=FEAT.slice().sort(function(){return Math.random()-.5}).slice(0,2),l={g:g,skin:p.skin,hcol:p.hcol|0,fcol:p.fcol==null?p.hcol|0:p.fcol,ecol:p.ecol|0};KEPT=ks.map(function(f){return flab(f,g)});
FEAT.forEach(function(f){var k=f[0],v=p[k]|0;if(ks.indexOf(f)<0){do{v=r10()}while(v===(p[k]|0))}l[k]=v});return l}


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
var HEAD={M:[[27,27,14,5,25,74,19,82],[22,22,12,8,16,78,3,92],[25,26,12,12,24,70,12,84],[28,29,15,4,28,72,20,82],[28,24,13,8,18,74,6,88],[24,24,12,6,22,78,15,90],[22,27,13,10,22,72,8,88],[26,28,16,12,25,68,13,80],[21,24,14,8,26,74,18,84],[25,26,14,5,23,76,9,92]],
F:[[22,20,14,6,20,74,10,84],[21,15,13,8,15,75,3,90],[23,22,12,12,21,73,13,85],[20,16,12,6,16,74,7,84],[24,18,13,8,17,70,3,90],[22,19,12,10,19,76,10,87],[21,15,14,6,15,74,6,82],[23,22,15,4,22,75,14,84],[20,16,14,8,16,72,8,80],[22,20,13,5,20,77,11,86]]};

/**
 * Looks up a look's head shape and returns it as a named object.
 * `h0` is the "reference hair half-width" the hair paths were drawn for
 * (26 for men, 22 for women); hx() compares it to the real width to scale hair.
 * @param {Object} l - A look.
 * @returns {{hw:number,cw:number,top:number,ch:number,jx:number,jy:number,cx:number,cy:number,h0:number}}
 */
function hd(l){var g=l.g==='F'?'F':'M',a=HEAD[g][l.chin|0];return {hw:a[0],cw:a[1],top:a[2],ch:a[3],jx:a[4],jy:a[5],cx:a[6],cy:a[7],h0:g==='F'?22:26}}

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
function faceD(s){return 'M'+(50-s.hw)+' 22L'+(50-s.hw+s.ch)+' '+s.top+'H'+(50+s.hw-s.ch)+'L'+(50+s.hw)+' 22L'+(50+s.cw)+' 54L'+(50+s.jx)+' '+s.jy+'L'+(50+s.cx)+' '+s.cy+'H'+(50-s.cx)+'L'+(50-s.jx)+' '+s.jy+'L'+(50-s.cw)+' 54Z'}

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
function EH(s,y){if(y<=54)return s.hw+(s.cw-s.hw)*clamp((y-22)/32,0,1);if(y<=s.jy)return s.cw+(s.jx-s.cw)*(y-54)/(s.jy-54);return s.jx+(s.cx-s.jx)*clamp((y-s.jy)/(s.cy-s.jy),0,1)}

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
function hx(s,w,body){if(!body)return '';var sx=w/s.h0,sy=(46-s.top)/32;return '<g transform="matrix('+sx+' 0 0 '+sy+' '+(50-50*sx)+' '+(46-46*sy)+')">'+body+'</g>'}

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
function eyeP(e){var ot=e.ot||0,it=e.it||0;return 'M31 '+(46+ot)+'Q38.5 '+(46+e.ty)+' 46 '+(46+it)+'Q38.5 '+(46+e.by)+' 31 '+(46+ot)+'Z'}

/**
 * Mirrors a drawing to produce both sides of the face from one definition.
 * MATH: matrix(-1 0 0 1 100 0) gives x' = -x + 100, i.e. a reflection across
 * the vertical line x=50, y unchanged. Draw the left half once; mirror it.
 * @param {string} s - SVG markup for the left side.
 * @returns {string} Left markup plus its mirrored copy.
 */
function mir(s){return '<g>'+s+'</g><g transform="matrix(-1 0 0 1 100 0)">'+s+'</g>'}


/* ============================================================================
 * ===========  SECTION 8: FEATURE DRAWING DATA (EYES/BROWS/NOSE/MOUTH)  ======
 * ========================================================================== */

/** EYE specs per gender (10 each).
 *  ty/by : top and bottom lid control offsets (see eyeP).
 *  pr    : pupil radius.            lid : thick upper-lid line (sleepy look).
 *  py    : pupil vertical nudge.    sh  : eye-shadow strength (0-2).
 *  l     : eyelash count (women).   bag : under-eye bag line.
 *  ot/it : outer/inner corner tilt. */
var EYE={M:[{ty:-3,by:4,pr:1.6},{ty:-9,by:10,pr:2.5},{ty:-11,by:12,pr:3},{ty:-4,by:5,pr:2,lid:3.5,py:.5},{ot:-2,it:2,ty:-5,by:6,pr:2,lid:2},{ty:-3,by:6,pr:2,lid:4},{ty:-4,by:4,pr:1.8,sh:1},{ty:-1,by:2,pr:1.1},{ty:-8,by:8,pr:3.2},{ty:-4,by:5,pr:2,bag:1}],
F:[{ty:-6,by:7,pr:2.4,l:1},{ty:-9,by:10,pr:2.9,l:1},{ty:-10,by:11,pr:3.1,l:2},{ty:-5,by:6,pr:2.2,lid:2.5,l:1},{ot:-3,it:1,ty:-6,by:6,pr:2.2,l:1,lid:2},{ty:-3,by:4,pr:1.6,lid:3,l:1},{ty:-7,by:7,pr:2.5,l:2,sh:1},{ot:3,it:-1,ty:-6,by:6,pr:2.3,l:1},{ty:-4,by:5,pr:1.8,l:1},{ty:-6,by:7,pr:2.4,l:1,sh:2}]};

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
function eyeS(e,ec,cid){var ot=e.ot||0,it=e.it||0,ty=e.ty,by=e.by,yo=46+ot,yi=46+it,o='';
if(e.sh)o+='<ellipse cx="38.5" cy="46" rx="9" ry="'+(4+e.sh*2)+'" fill="#000" opacity="'+(.18+.1*e.sh)+'"/>';
o+='<path d="M31 '+yo+'Q38.5 '+(46+ty)+' 46 '+yi+'Q38.5 '+(46+by)+' 31 '+yo+'Z" fill="#fff" stroke="#000" stroke-width="2"/>';
var py=46+(ot+it)/2+(ty+by)/4+(e.py||0);o+='<g clip-path="url(#'+cid+')"><circle cx="39.5" cy="'+py+'" r="'+(e.pr+2)+'" fill="'+ec+'"/><circle cx="39.5" cy="'+py+'" r="'+(e.pr*.72)+'" fill="#000"/><circle cx="40.6" cy="'+(py-1)+'" r=".9" fill="#fff" opacity=".8"/></g><path d="'+eyeP(e)+'" fill="none" stroke="#000" stroke-width="2"/>';
if(e.lid)o+='<path d="M30 '+(yo-1)+'Q38.5 '+(46+ty-1)+' 47 '+(yi-1)+'" fill="none" stroke="#000" stroke-width="'+e.lid+'"/>';
if(e.bag)o+='<path d="M32 '+(yo+5)+'Q38.5 '+(46+by+4)+' 45 '+(yi+5)+'" fill="none" stroke="#000" stroke-width="1.3" opacity=".7"/>';
if(e.l)o+='<path d="M31 '+yo+'L28.5 '+(yo-3)+'" fill="none" stroke="#000" stroke-width="2"/>';
if(e.l>1)o+='<path d="M33 '+(yo-2)+'L30.5 '+(yo-6)+'" fill="none" stroke="#000" stroke-width="1.8"/>';
return o}

/** EYEBROWS: [path data, stroke width] per gender (10 each). Left brow only; mirrored later. */
var BROW={M:[['M28 37L47 40',6],['M28 35L47 43',5],['M28 39Q38 32 47 38',4],['M29 38L46 41',2.5],['M27 34L47 44',7],['M28 38L50 42',5],['M28 40Q38 33 47 39',5],['M28 38L36 38M38 39L47 41',5],['M28 41L47 36',4],['M27 37L47 40',8]],
F:[['M28 40Q38 35 47 40',2.5],['M29 40L46 40',3],['M28 41Q37 33 47 39',2.5],['M28 40Q38 36 47 40',5],['M28 41L38 36L47 40',3],['M29 40Q38 38 46 41',1.8],['M28 39L47 40',4.5],['M28 41Q37 37 47 41',3.5],['M28 37L47 43',3.5],['M28 41Q38 37 47 41',4]]};

/** NOSE outline paths per gender (10 each), drawn on the centre line. */
var NOSE={M:['M50 46L46 60L53 62','M47 58L45 61L50 63L55 61L53 58','M50 46L43 61L50 64L57 61','M50 45L54 56L52 62L46 61','M50 46L48 61L53 61','M50 48L42 62L50 64L58 62','M50 46L53 52L48 57L46 61L54 62','M50 44L47 64L54 64','M50 48L44 60L47 64L53 64L56 60','M50 46L46 58L45 61L50 62L55 61'],
F:['M50 47L48 58L52 60','M48 58L50 61L52 58','M50 48L48 58L47 60L50 61L53 60','M50 46L49 60L52 61','M50 48L47 59L50 62L53 59','M50 46L52 54L48 61L53 62','M50 48L45 60L50 62L55 60','M50 46L47 60L50 63L53 60','M51 48L49 59L52 60','M50 46L53 56L51 61L48 60']};

/** MOUTH SVG fragments per gender (10 each). Uses LIP for lip colour; the
 *  men's last mouth (index 9) draws a cigarette. */
var MOUTH={M:['<path d="M42 71L58 71" fill="none"/>','<path d="M40 68Q50 78 60 68" fill="none"/>','<path d="M41 74Q50 66 59 74" fill="none"/>','<path d="M40 71L52 72L60 66" fill="none"/>','<path d="M41 69Q50 66 59 69Q50 77 41 69Z" fill="'+LIP+'"/>','<path d="M40 69L60 69L58 75L42 75Z" fill="#e8e0d0"/><path d="M46 69V75M50 69V75M54 69V75" fill="none" stroke-width="1.2"/>','<path d="M43 72Q50 70 57 72" fill="none"/>','<path d="M40 71Q50 66 60 71Q50 79 40 71Z" fill="'+LIP+'"/><path d="M40 71Q50 73 60 71" fill="none" stroke-width="1.5"/>','<path d="M41 72L50 72Q56 72 60 67" fill="none"/>','<path d="M42 71L56 71" fill="none"/><path d="M55 71L71 67" fill="none" stroke="#d8d0bc" stroke-width="3.5"/><path d="M70 67.3L72 66.7" fill="none" stroke="#c0533f" stroke-width="3.5"/>'],
F:['<path d="M42 71Q50 69 58 71Q50 76 42 71Z" fill="'+LIP+'"/>','<path d="M41 69Q50 77 59 69Q50 73 41 69Z" fill="'+LIP+'"/>','<path d="M44 71Q50 68 56 71Q50 75 44 71Z" fill="'+LIP+'"/>','<path d="M41 72Q50 72 60 67" fill="none"/><path d="M44 73Q50 76 56 72" fill="none" stroke-width="1.5"/>','<path d="M42 69Q50 67 58 69Q50 78 42 69Z" fill="#5a1f1f"/>','<path d="M43 72Q50 71 57 72" fill="none"/>','<path d="M40 71Q50 66 60 71Q50 78 40 71Z" fill="'+LIP+'"/>','<path d="M42 74Q50 68 58 74" fill="none"/>','<path d="M41 69Q50 79 59 69Z" fill="#eee8dc"/>','<path d="M43 72Q50 74 57 70" fill="none"/>']};


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
function hairBack(l,hc,s3){var st='fill="'+hc+'" '+s3,h=l.hair|0;
if(l.g!=='F'){if(h===2)return '<path d="M20 52L18 20L34 6L58 4L80 12L82 56L84 92L16 92Z" '+st+'/>';if(h===7)return '<path d="M12 54L10 28L20 10L36 0L64 0L80 10L90 28L88 54L78 44L22 44Z" '+st+'/>';if(h===8)return '<circle cx="50" cy="7" r="8" '+st+'/>';return ''}
return ['<path d="M20 52L18 20L34 6L66 6L82 20L82 52L86 98H14L18 52Z" '+st+'/>','<path d="M20 64L18 24L34 8L66 8L82 24L80 64L72 72H28Z" '+st+'/>','','<path d="M58 8L76 0L94 10L92 34L84 20L72 16Z" '+st+'/>','<path d="M14 58L12 30L20 12L36 2L64 2L80 12L88 30L86 58L90 78L78 84L74 58H26L22 84L10 78Z" '+st+'/>','<circle cx="50" cy="7" r="9" '+st+'/>','<path d="M68 20L84 30L84 56L80 66L84 78L78 92L72 80L76 68L70 56Z" '+st+'/>','','<path d="M18 62L16 22L34 6L66 6L84 22L82 62L88 82L76 92L72 68H28L24 92L12 82Z" '+st+'/>',''][h]}

/**
 * HAIR IN FRONT of the face (fringe, top, sideburns). Drawn AFTER the face.
 * `hl` = faint white highlight strokes, `sh` = translucent shadow fill.
 * Men index 4 = Bald draws only a shine mark.
 * @param {Object} l - Look.
 * @param {string} hc - Hair colour hex.
 * @param {string} s3 - Shared stroke attributes.
 * @returns {string} SVG markup.
 */
function hairFront(l,hc,s3){var h=l.hair|0,st='fill="'+hc+'" '+s3,hl='fill="none" stroke="#fff" stroke-width="1.5" opacity=".3"',sh='fill="'+hc+'" opacity=".35"';
if(l.g!=='F'){return [
'<path d="M24 40L22 20L36 6L56 2L78 10L78 40L70 30L52 22L34 28Z" '+st+'/><path d="M34 14L50 8M44 20L62 12" '+hl+'/>',
'<path d="M26 38L26 22L34 14L50 12L66 14L74 22L74 38L68 30L50 26L32 30Z" fill="'+hc+'" fill-opacity=".85" '+s3+'/>',
'<path d="M24 44L22 20L36 8L58 6L78 14L78 44L68 28L50 24L32 30Z" '+st+'/><path d="M36 16L54 10" '+hl+'/>',
'<path d="M24 42L24 22L44 8L72 12L78 24L76 42L66 28L40 26Z" '+st+'/><path d="M36 18L56 12M42 24L66 18" '+hl+'/>',
'<path d="M38 22L52 16M44 27L58 21" fill="none" stroke="#fff" stroke-width="2" opacity=".4"/>',
'<path d="M24 40L24 24L40 18L60 18L76 24L76 40L68 28L32 28Z" '+sh+'/><path d="M42 20L40 2L46 9L50 0L54 9L60 2L58 20Z" '+st+'/>',
'<path d="M24 42L24 22L40 10L74 14L78 26L76 42L66 28L52 22L42 24L36 30Z" '+st+'/><path d="M44 12L40 22" '+hl+'/>',
'<path d="M24 38L26 22L38 12L62 12L74 22L76 38L66 26L34 26Z" '+st+'/>',
'<path d="M24 40L24 22L40 12L66 12L76 22L76 40L66 28L36 28Z" '+st+'/><path d="M36 18L56 14" '+hl+'/>',
'<path d="M24 42L24 26L34 14L44 20L50 15L56 20L66 14L76 26L76 42L70 34L62 26L50 30L38 26L30 34Z" '+st+'/>'][h]}
return [
'<path d="M24 44L22 20L36 8L64 8L78 20L76 44L68 28L52 20L46 20L32 28Z" '+st+'/><path d="M36 14L48 12" '+hl+'/>',
'<path d="M23 46L22 22L38 8L62 8L78 22L77 46L74 30L26 30Z" '+st+'/><path d="M34 16L52 12" '+hl+'/>',
'<path d="M24 40L22 20L36 8L64 10L78 22L76 40L68 28L54 22L38 30L32 36Z" '+st+'/><path d="M44 12L58 16M38 16L52 18" '+hl+'/>',
'<path d="M24 42L24 22L40 10L66 12L76 24L76 42L66 28L36 28Z" '+st+'/><path d="M36 18L56 14" '+hl+'/>',
'<path d="M22 44L20 24L28 12L40 6L50 10L60 6L72 12L80 24L78 44L70 28L56 22L44 22L30 28Z" '+st+'/>',
'<path d="M24 42L24 22L40 10L66 12L76 24L76 42L66 28L36 28Z" '+st+'/><path d="M36 18L56 14" '+hl+'/>',
'<path d="M24 42L22 20L38 8L64 8L78 22L76 40L64 24L50 22L36 30Z" '+st+'/>',
'<path d="M24 42L24 22L30 24L30 42ZM76 42L76 22L70 24L70 42Z" '+sh+'/><path d="M30 34L26 20L40 8L72 10L78 24L66 30L56 20L40 24Z" '+st+'/>',
'<path d="M22 46L20 20L36 6L64 6L80 20L78 46L70 30L54 22L46 22L30 30Z" '+st+'/>',
'<path d="M24 40L24 22L40 12L60 12L76 22L76 40L68 30L32 30Z" '+sh+'/><path d="M34 20L48 15M44 22L60 16" '+hl+'/>'][h]}

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
function beard(l,hc,sk,bt,s){var f=l.fhair|0,F='fill="'+hc+'"';
if(f===1)return '<path d="'+bt+'" '+F+' opacity=".4"/>';
if(f===3)return '<path d="'+bt+'" '+F+'/><ellipse cx="51" cy="72" rx="12" ry="6.5" fill="'+sk+'"/>';
if(f===4)return '<path d="M42 74L50 71L58 74L56 94L44 94Z" '+F+'/>';
if(f===5)return '<path d="M0 46L'+(49-EH(s,46))+' 46L'+(54-EH(s,60))+' 60L36 66L64 66L'+(EH(s,60)+46)+' 60L'+(EH(s,46)+51)+' 46L100 46V100H0Z" '+F+'/><ellipse cx="50" cy="70" rx="13" ry="6.5" fill="'+sk+'"/>';
if(f===6){var a=50-s.cw,b=50+s.cw;return '<path d="M'+(a-6)+' 28L'+(a+8)+' 28L'+(a+9)+' 58L'+(a-6)+' 58ZM'+(b+6)+' 28L'+(b-8)+' 28L'+(b-9)+' 58L'+(b+6)+' 58Z" '+F+'/>'}
if(f===8){var cw=s.cw,jx=s.jx,jy=s.jy,cx=s.cx,cy=s.cy,ix=Math.max(1,cx-4);return '<path d="M'+(46-cw)+' 44L'+(46-cw)+' 54L'+(46-jx)+' '+jy+'L'+(46-cx)+' '+(cy+4)+'H'+(54+cx)+'L'+(54+jx)+' '+jy+'L'+(54+cw)+' 54L'+(54+cw)+' 44L'+(45+cw)+' 44L'+(45+cw)+' 54L'+(45+jx)+' '+(jy-3)+'L'+(50+ix)+' '+(cy-5)+'H'+(50-ix)+'L'+(55-jx)+' '+(jy-3)+'L'+(55-cw)+' 54L'+(55-cw)+' 44Z" '+F+'/>'}
if(f===9)return '<path d="M47 75L53 75L52 81L48 81Z" '+F+'/>';
return ''}

/**
 * Moustache layer drawn ABOVE the face outline (not clipped), for facial
 * styles 2 (moustache), 4 (goatee top lip) and 7 (handlebar).
 * @param {Object} l - Look.
 * @param {string} hc - Facial hair colour hex.
 * @returns {string} SVG markup ('' for other styles).
 */
function mustache(l,hc){var f=l.fhair|0,a='fill="'+hc+'" stroke="#000" stroke-width="1.5" stroke-linejoin="miter"';
if(f===2||f===4)return '<path d="M36 66L44 62L50 65L56 62L64 66L56 70L50 67L44 70Z" '+a+'/>';
if(f===7)return '<path d="M32 62Q36 70 44 63L50 66L56 63Q64 70 68 62Q66 72 56 70L50 68L44 70Q34 72 32 62Z" '+a+'/>';
return ''}

/**
 * Women's "marks" layer (the female version of the facial-hair row):
 * 1 freckles (8 dots), 2 beauty mark, 3 cheek scar, 4 brow scar,
 * 6 teardrop tattoo, 7 nose stud, 8 black eye, 9 eyeliner wing (mirrored).
 * Style 5 (earrings) is drawn in portrait(); 0 is empty.
 * @param {Object} l - Look.
 * @returns {string} SVG markup.
 */
function marks(l){var m=l.fhair|0,o='';
if(m===1)[[35,57],[39,59],[43,57],[65,57],[61,59],[57,57],[38,62],[62,62]].forEach(function(p){o+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="1" fill="#6b3f26"/>'});
else if(m===2)o='<circle cx="62" cy="67" r="1.8" fill="#000"/>';
else if(m===3)o='<path d="M60 52L66 68" fill="none" stroke="#000" stroke-width="1.6"/><path d="M58 57L64 55M60 62L67 60M62 67L68 66" fill="none" stroke="#000" stroke-width="1"/>';
else if(m===4)o='<path d="M62 32L66 46" fill="none" stroke="#000" stroke-width="2"/><path d="M60 36L65 35M61 41L67 40" fill="none" stroke="#000" stroke-width="1"/>';
else if(m===6)o='<path d="M34 52Q31.5 56 34 59Q36.5 56 34 52Z" fill="#000"/>';
else if(m===7)o='<circle cx="55" cy="60" r="1.4" fill="#e3a73b" stroke="#000" stroke-width=".8"/>';
else if(m===8)o='<ellipse cx="62" cy="47" rx="9" ry="6.5" fill="#3a1f3f" opacity=".6"/>';
else if(m===9)o=mir('<path d="M31 46L27.5 42.5" fill="none" stroke="#000" stroke-width="2.5"/>');
return o}

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
function accS(ac,s,E){var cw=s.cw,o='',ex=E(45),G='#e3a73b',k='stroke="#000" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"',arm='<path d="M30 45L'+(49-ex)+' 43" fill="none" '+k+'/>',br='<path d="M47 45Q50 43 53 45" fill="none" '+k+'/>';
if(ac===1)o=mir('<circle cx="38.5" cy="46" r="8.5" fill="#fff" fill-opacity=".12" '+k+'/>'+br+arm);
else if(ac===2)o=mir('<rect x="30" y="40" width="17" height="12" rx="2" fill="#fff" fill-opacity=".12" '+k+'/>'+br+arm);
else if(ac===3)o=mir('<path d="M29.5 41L47 41L45.5 51Q43 54 36 53Q32 52 29.5 41Z" fill="#111" '+k+'/><path d="M33 43.5L38 43.5" stroke="#fff" stroke-width="1.6" opacity=".4" fill="none"/>'+br+arm);
else if(ac===4)o='<path d="M31 41L'+(50-E(36))+' 35M45 40L'+(50+E(30))+' 29" fill="none" stroke="#000" stroke-width="2.4"/><ellipse cx="38.5" cy="46" rx="9" ry="8" fill="#111" '+k+'/>';
else if(ac===5)o=mir('<circle cx="'+(50-cw)+'" cy="58" r="2" fill="'+G+'" stroke="#000" stroke-width="1"/>');
else if(ac===6)o=mir('<circle cx="'+(50-cw)+'" cy="62" r="4" fill="none" stroke="#000" stroke-width="3.2"/><circle cx="'+(50-cw)+'" cy="62" r="4" fill="none" stroke="'+G+'" stroke-width="1.6"/>');
else if(ac===7)o=hx(s,s.hw,'<path d="M22.5 31Q50 24 77.5 31L77.5 37Q50 30 22.5 37Z" fill="#c8374f" '+k+'/>');
else if(ac===8)o=hx(s,s.hw,'<path d="M22 36L21 20L36 6L64 6L79 20L78 36Q50 28 22 36Z" fill="#b5322e" '+k+'/><path d="M30 18h.01M46 12h.01M60 18h.01M70 28h.01M36 28h.01M52 22h.01" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/><path d="M78 24L92 30L88 42L77 33Z" fill="#b5322e" '+k+'/>');
return o}


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
function accBack(ac,F){if(ac!==9)return '';var nx=F?7:9,d='M'+(50-nx)+' 78Q50 113 '+(50+nx)+' 78';
return '<path d="'+d+'" fill="none" stroke="#000" stroke-width="4.5"/><path d="'+d+'" fill="none" stroke="#e3a73b" stroke-width="2"/><circle cx="50" cy="95.5" r="3.4" fill="#e3a73b" stroke="#000" stroke-width="1.5"/>'}

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
function portrait(l,z){if(!l)return '';var g=l.g==='F'?'F':'M',F=g==='F',s=hd(l),hw=s.hw,cw=s.cw,sk=SKIN[l.skin|0],hc=HCOL[l.hcol|0],fc=HCOL[l.fcol==null?l.hcol|0:l.fcol|0],ec=ECOL[l.ecol|0],id='c'+(PID++),fd=faceD(s),o='',s3='stroke="#000" stroke-width="3" stroke-linejoin="miter"',s25='stroke="#000" stroke-width="2.5" stroke-linejoin="miter"',cp='clip-path="url(#'+id+')"',bt='M0 50L'+(49-EH(s,50))+' 50L'+(54-EH(s,62))+' 62L38 60L44 64L50 60L56 64L62 60L'+(EH(s,62)+46)+' 62L'+(EH(s,50)+51)+' 50L100 50V100H0Z',eb=BROW[g][l.brow|0],ey=EYE[g][l.eyes|0],E=function(y){return s.hw+(s.cw-s.hw)*clamp((y-22)/32,0,1)};
o+='<defs><clipPath id="'+id+'"><path d="'+fd+'"/></clipPath><clipPath id="'+id+'e"><path d="'+eyeP(ey)+'"/></clipPath></defs>'+hx(s,Math.max(hw,cw),hairBack(l,hc,s3));
if(F)o+='<path d="M12 100L18 86L38 82H62L82 86L88 100Z" fill="#4a3a40" '+s3+'/><path d="M38 82L50 95L62 82Z" fill="'+sk+'" '+s25+'/><path d="M43 66V84H57V66Z" fill="'+sk+'" '+s25+'/><path d="M43 66V76L57 80V66Z" fill="#000" opacity=".35"/>';
else o+='<path d="M8 100L14 84L36 80H64L86 84L92 100Z" fill="#3a3f44" '+s3+'/><path d="M41 66V84H59V66Z" fill="'+sk+'" '+s25+'/><path d="M41 66V76L59 80V66Z" fill="#000" opacity=".35"/>';
o+=accBack(l.acc|0,F);
o+='<path d="M'+(51-cw)+' 46L'+(45-cw)+' 51L'+(51-cw)+' 60Z" fill="'+sk+'" '+s25+'/><path d="M'+(49+cw)+' 46L'+(55+cw)+' 51L'+(49+cw)+' 60Z" fill="'+sk+'" '+s25+'/><path d="'+fd+'" fill="'+sk+'"/>';
o+='<g '+cp+'><path d="M28 34L40 26M27 44L44 33M27 54L46 42M30 64L48 52M34 74L50 62" stroke="#000" stroke-width="1" opacity=".55" fill="none"/>'+(F?'':beard(l,fc,sk,bt,s))+'<path d="M56 10L100 10V100H50L60 70L52 40Z" fill="#000" opacity=".35"/></g><path d="'+fd+'" fill="none" stroke="#000" stroke-width="3.5" stroke-linejoin="miter"/>';
if(!F)o+=mustache(l,fc);else o+=marks(l);
o+='<g stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">'+MOUTH[g][l.mouth|0]+'</g><path d="'+NOSE[g][l.nose|0]+'" fill="none" stroke="#000" stroke-width="2.2" stroke-linejoin="miter"/>';
o+=mir(eyeS(ey,ec,id+'e')+'<path d="'+eb[0]+'" stroke="#000" stroke-width="'+eb[1]+'" fill="none"'+(F?' stroke-linecap="round"':'')+'/>');
o+=hx(s,hw,hairFront(l,hc,s3));
if(F&&(l.fhair|0)===5)o+=mir('<circle cx="'+(50-cw)+'" cy="61" r="3" fill="none" stroke="#e3a73b" stroke-width="2"/>');
o+=accS(l.acc|0,s,E);
return '<svg viewBox="0 0 100 100" width="'+z+'" height="'+z+'" role="img" aria-label="Character portrait" style="flex:none;border-radius:10px;background:#2e3a43">'+o+'</svg>'}


/* ============================================================================
 * =============  SECTION 11: CREATION-SCREEN INPUT HANDLERS  =================
 * ========================================================================== */
/* Each handler: (1) mutates S.look / S, (2) calls render(), which redraws the
 * preview portrait and highlights. This is the Input -> State -> Render loop. */

/** Sets the head-hair colour. @param {number} i - HCOL index. @returns {void} */
function setHcol(i){S.look.hcol=i;render()}

/** Sets the facial-hair colour. @param {number} i - HCOL index. @returns {void} */
function setFcol(i){S.look.fcol=i;render()}

/** Sets the eye colour. @param {number} i - ECOL index. @returns {void} */
function setEcol(i){S.look.ecol=i;render()}

/**
 * Steps a feature forward/back with wrap-around.
 * MATH: (value + d + 10) % 10. Adding 10 first keeps the result positive
 * when d = -1 at value 0 (JavaScript's % can return negatives), so 0 - 1
 * wraps to 9.
 * @param {string} k - Feature key (e.g. 'hair').
 * @param {number} d - Direction, +1 or -1.
 * @returns {void}
 */
function cyc(k,d){S.look[k]=(S.look[k]+d+10)%10;render()}

/** Sets skin tone. @param {number} i - SKIN index. @returns {void} */
function setSkin(i){S.look.skin=i;render()}

/** Re-rolls the entire face for the current gender. @returns {void} */
function randLook(){S.look=newLook(S.gender);render()}

/**
 * Cleans a typed name: keeps only letters (any language, via the Unicode
 * property class \p{L}), apostrophes, spaces and hyphens; trims; max 14
 * characters. WHY: names are inserted into HTML strings, so stripping
 * everything else also prevents markup injection.
 * @param {string} v - Raw input.
 * @returns {string} Safe name.
 */
function cl(v){return String(v).replace(/[^\p{L}' -]/gu,'').trim().slice(0,14)}

/**
 * Stores a typed name. Typing a first name sets `named`, which stops
 * auto-name replacement when the gender is switched.
 * @param {string} k - 'name' or 'sn' (family name).
 * @param {string} v - Raw input.
 * @returns {void}
 */
function setNm(k,v){S[k]=cl(v);if(k==='name')S.named=true}

/**
 * Switches gender. A new face is generated (the face tables differ by
 * gender) but skin, hair and eye colours are carried over so the player's
 * colour choices aren't lost. The first name only auto-changes if the
 * player never typed one.
 * @param {string} g - 'M' or 'F'.
 * @returns {void}
 */
function setGender(g){if(S.gender===g)return;var o=S.look;S.gender=g;S.look=newLook(g);S.look.skin=o.skin;S.look.hcol=o.hcol;S.look.ecol=o.ecol;if(!S.named)S.name=pickName(g);render()}

/**
 * "Random name" button: random first name; on the creation screen also a
 * random family name. Resets `named` so a later gender switch can rename.
 * @returns {void}
 */
function rndName(){S.name=pickName(S.gender);S.named=false;if(S.view==='create')S.sn=famName();render()}


/* ============================================================================
 * ===============  SECTION 12: HEIR NAMING & GAME START  =====================
 * ========================================================================== */

/**
 * Builds the "Name your son/daughter" screen shown after a death.
 * Shows the inherited portrait, the two kept features (KEPT) and a name field.
 * @returns {string} HTML for #app.
 */
function heirNameView(){var inp='width:100%;min-height:44px;background:#0B0F14;color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:8px 10px;font:600 16px Barlow,sans-serif',w=S.sex==='Son'?'son':'daughter';
return '<div class="top"><h1>Kingpin: Bloodline</h1></div><div class="card"><h2>Name your '+w+'</h2><p class="log">Generation '+S.gen+' takes over at 18. They keep their parent\u2019s '+KEPT.join(' and ').toLowerCase()+'. The family name stays '+S.sn+'.</p><div style="display:flex;justify-content:center;margin:10px 0">'+portrait(S.look,150)+'</div><div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><label for="fn"><small>First name</small></label><input id="fn" style="'+inp+'" maxlength="14" autocomplete="off" value="'+S.name+'" oninput="setNm(\'name\',this.value)" onchange="this.value=S.name"></div><div class="nm" style="flex:1 1 100%"><small>Family name: '+S.sn+'</small></div></div><button class="full" onclick="rndName()">Random name</button><button class="main full" onclick="confirmHeir()">Take over</button></div>'}

/**
 * Accepts the heir's name and enters the game. The log was written earlier
 * with the heir's temporary random name (S.n0), so every occurrence is
 * replaced with the chosen name via split/join (a replace-all with no regex
 * escaping needed).
 * @returns {void}
 */
function confirmHeir(){if(!S.name)S.name=pickName(S.gender);var o=S.n0,n=S.name;if(o&&o!==n)S.log=S.log.map(function(l){return l.split(o+' '+S.sn).join(n+' '+S.sn)});S.view='day';render()}

/**
 * "Start" button on the creation screen: fills any blank names, gives the
 * founder two starting relatives (the crew), and moves to the main game view.
 * @returns {void}
 */
function startGame(){if(!S.name)S.name=pickName(S.gender);if(!S.sn)S.sn=famName();S.fam=[mkRel('Sibling',1,S.sn),mkRel('Cousin',1,S.sn)];S.view='day';render()}

/**
 * Builds the character creation screen: pinned preview portrait, name
 * fields, gender buttons, one row per feature (prev/next), colour swatches
 * (hair, facial hair for men, eyes, skin) and Randomise / Start buttons.
 * WHY the portrait is `position:sticky`: it stays visible while the player
 * scrolls through the options (a requested feature).
 * WHY aria-pressed: screen readers announce which swatch is selected.
 * @returns {string} HTML for #app.
 */
function createView(){var L=S.look,inp='width:100%;min-height:44px;background:#0B0F14;color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:8px 10px;font:600 16px Barlow,sans-serif';
/* ---- header, intro text and pinned portrait ---- */
return '<div class="top"><h1>Kingpin: Bloodline</h1></div><div class="card"><h2>Create your character</h2><p class="log">Your skin tone, hair colour, facial hair colour and eye colour pass to every heir. Each new generation keeps two other features and gets new ones for the rest. Switching between male and female gives you a fresh face to match.</p><div style="position:sticky;top:env(safe-area-inset-top,0px);z-index:5;display:flex;justify-content:center;padding:8px 0;margin:10px 0;background:var(--panel);border-bottom:1px solid var(--line)">'+portrait(L,110)+'</div>'
/* ---- name inputs and random-name button ---- */
+'<div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><label for="fn"><small>First name</small></label><input id="fn" style="'+inp+'" maxlength="14" autocomplete="off" value="'+S.name+'" oninput="setNm(\'name\',this.value)" onchange="this.value=S.name"></div><div class="nm" style="flex:1 1 100%"><label for="sn"><small>Family name</small></label><input id="sn" style="'+inp+'" maxlength="14" autocomplete="off" value="'+S.sn+'" oninput="setNm(\'sn\',this.value)" onchange="this.value=S.sn"></div><button class="full" style="margin-top:0" onclick="rndName()">Random name</button></div>'
/* ---- gender toggle ---- */
+'<div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><small>Gender</small></div><div class="btns" style="flex:1 1 100%"><button style="flex:1" class="'+(S.gender==='M'?'main':'')+'" aria-pressed="'+(S.gender==='M')+'" onclick="setGender(\'M\')">Male</button><button style="flex:1" class="'+(S.gender==='F'?'main':'')+'" aria-pressed="'+(S.gender==='F')+'" onclick="setGender(\'F\')">Female</button></div></div>'
/* ---- one row per feature (hair, brows, eyes, nose, mouth, head shape, facial hair, accessory) ---- */
+FEAT.map(function(f){var k=f[0],lb=flab(f,L.g);return '<div class="row"><div class="nm"><small>'+lb+'</small><b>'+fnm(f,L.g)[L[k]]+'</b></div><div class="btns"><button aria-label="Previous '+lb.toLowerCase()+'" onclick="cyc(\''+k+'\',-1)">\u2039</button><button aria-label="Next '+lb.toLowerCase()+'" onclick="cyc(\''+k+'\',1)">\u203a</button></div></div>'}).join('')
/* ---- hair colour swatches (outline marks the selected one) ---- */
+'<div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><small>Hair colour</small><b>'+HCN[(L.hcol|0)]+'</b></div><div class="btns" style="flex:1 1 100%;flex-wrap:wrap">'+HCOL.map(function(c,i){return '<button aria-label="'+HCN[i]+' hair" aria-pressed="'+((L.hcol|0)===i)+'" onclick="setHcol('+i+')" style="flex:1 1 17%;background:'+c+';'+((L.hcol|0)===i?'outline:3px solid var(--amber);outline-offset:2px':'')+'"></button>'}).join('')+'</div></div>'
/* ---- facial hair colour (men only; women's "marks" have fixed colours) ---- */
+(L.g==='M'?'<div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><small>Facial hair colour</small><b>'+HCN[(L.fcol==null?L.hcol|0:L.fcol|0)]+'</b></div><div class="btns" style="flex:1 1 100%;flex-wrap:wrap">'+HCOL.map(function(c,i){return '<button aria-label="'+HCN[i]+' facial hair" aria-pressed="'+((L.fcol==null?L.hcol|0:L.fcol|0)===i)+'" onclick="setFcol('+i+')" style="flex:1 1 17%;background:'+c+';'+((L.fcol==null?L.hcol|0:L.fcol|0)===i?'outline:3px solid var(--amber);outline-offset:2px':'')+'"></button>'}).join('')+'</div></div>':'')
/* ---- eye colour swatches ---- */
+'<div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><small>Eye colour</small><b>'+ECN[L.ecol|0]+'</b></div><div class="btns" style="flex:1 1 100%;flex-wrap:wrap">'+ECOL.map(function(c,i){return '<button aria-label="'+ECN[i]+' eyes" aria-pressed="'+((L.ecol|0)===i)+'" onclick="setEcol('+i+')" style="flex:1 1 17%;background:'+c+';'+((L.ecol|0)===i?'outline:3px solid var(--amber);outline-offset:2px':'')+'"></button>'}).join('')+'</div></div>'
/* ---- skin tone swatches ---- */
+'<div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><small>Skin tone</small><b>'+SKINN[L.skin]+'</b></div><div class="btns" style="flex:1 1 100%;flex-wrap:wrap">'+SKIN.map(function(c,i){return '<button aria-label="'+SKINN[i]+' skin tone" aria-pressed="'+(L.skin===i)+'" onclick="setSkin('+i+')" style="flex:1 1 17%;background:'+c+';'+(L.skin===i?'outline:3px solid var(--amber);outline-offset:2px':'')+'"></button>'}).join('')+'</div></div>'
/* ---- randomise and start ---- */
+'<button class="full" onclick="randLook()">Randomise look</button><button class="main full" onclick="startGame()">Start</button></div>'}

/* ===================== END OF PART 2 ===================== */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 13: LEVELS, XP & UNLOCKS  ==================================
 * ============================================================================
 * ========================================================================== */

/**
 * Title for a level number.
 * @param {number} l - Level 1..20.
 * @returns {string} e.g. 1 -> "Street Kid", 20 -> "Kingpin"; '' if out of range.
 */
function lvlName(l){return LVLN[l-1]||''}

/**
 * Current player level from total XP.
 * LOGIC: walk the XPT thresholds; every threshold the player's XP has
 * reached bumps the level to (index + 1). Because XPT is ascending, the last
 * threshold reached wins.
 * @returns {number} Level 1..20.
 */
function lvl(){var x=S.xp||0,l=1;XPT.forEach(function(t,i){if(x>=t)l=i+1});return l}

/**
 * Drugs the player may trade right now (level gate).
 * @returns {Object[]} Subset of GOODS where g.u <= current level.
 */
function ug(){return GOODS.filter(function(g){return g.u<=lvl()})}

/**
 * Lists everything that unlocks at exactly level `l` (drugs, properties,
 * bribes, guns, bags). Used by the level-up popup and the How-To-Play table.
 * @param {number} l - Level to inspect.
 * @returns {string[]} Display names (empty if nothing unlocks).
 */
function unlocksAt(l){var t=[];GOODS.forEach(function(g){if(g.u===l)t.push(g.n)});PROPS.forEach(function(p){if(p.u===l)t.push(p.n)});PROT.forEach(function(p){if(p.u===l)t.push(p.n+' (bribe)')});GUNS.forEach(function(p){if(p.u===l)t.push(p.n)});BAGS.forEach(function(p){if(p.u===l)t.push(p.n+' (bag)')});return t}

/**
 * Builds the HTML reference table "what unlocks at each level" (1..20).
 * @returns {string} HTML paragraphs, one per level.
 */
function levelList(){var h='<p class="lead"><b>Level unlocks.</b> Everything you unlock at each level:</p>';for(var l=1;l<=XPT.length;l++){var u=unlocksAt(l);h+='<p class="lead" style="font-size:14px;margin-bottom:6px"><b>Level '+l+' \u00b7 '+lvlName(l)+':</b> '+(u.length?u.join(', '):'Nothing new')+'</p>'}return h}

/**
 * Shows a simple one-button "OK" popup.
 * @param {string} t - Title.
 * @param {string} d - Body text (may contain simple HTML like <br>).
 * @returns {void}
 */
function note(t,d){ask(t,d,[{l:'OK',fn:function(){}}])}

/**
 * Yearly profit tracker (YP). `i` = money IN from sales this year,
 * `o` = money OUT on stock/ingredients. Created lazily on first use.
 * @returns {{i:number,o:number}}
 */
function yp(){return S.yp||(S.yp={i:0,o:0})}

/**
 * Converts this year's trading profit into XP, then resets the tracker.
 * Called at every year turn and when jailed.
 * MATH (step by step):
 *   1. net     = money in - money out (this year's trading profit).
 *   2. cost    = XPD * level^XPK   -> "profit needed per XP" grows with level
 *                (XPD=1.2649, XPK=1.965), so high levels need far more profit.
 *   3. XP      = floor( sqrt(net) / cost )
 *                The square root makes XP grow slowly with profit (diminishing
 *                returns): 4x the profit only gives 2x the XP.
 *   4. +1e-9   guards against floating-point error (e.g. 24.99999999 instead
 *                of 25 would otherwise floor down by one).
 * EXAMPLE: level 1, net 1,000 -> sqrt = 31.62 / 1.2649 = 25.0 XP.
 * A year with a loss, or no trading, earns nothing.
 * @returns {void}
 */
function yearXp(){var p=yp(),net=p.i-p.o;S.yp={i:0,o:0};if(!p.i&&!p.o)return;var x=net>0?Math.floor(Math.sqrt(net)/(XPD*Math.pow(lvl(),XPK))+1e-9):0;if(x>0){say('Net trading profit this year: '+gbp(net)+'. That earned you '+x+' XP.');gainXp(x)}else say('No net trading profit this year, so no XP.')}

/**
 * Adds XP and shows a popup listing new unlocks if a level was gained
 * (possibly several levels at once, e.g. via dev tools).
 * @param {number} n - XP to add.
 * @returns {void}
 */
function gainXp(n){var a=lvl();S.xp=(S.xp||0)+n;var b=lvl();if(b>a){var t=[];for(var l=a+1;l<=b;l++)t=t.concat(unlocksAt(l));note('Level '+b+': '+lvlName(b),t.length?'Unlocked: '+t.join(', ')+'.':'Nothing new this level, but you\u2019re getting well known.')}}

/**
 * HUD card showing the current level and a progress bar to the next level.
 * MATH: progress % = (xp - startOfLevel) / (nextLevelStart - startOfLevel) * 100.
 * @returns {string} HTML.
 */
function levelChip(){var l=lvl(),x=S.xp||0,a=XPT[l-1],b=XPT[l];
return '<div class="card" style="padding:8px 12px"><b>Level '+l+' \u00b7 '+lvlName(l)+'</b> <span class="log">'+(b===undefined?'Max level':(x-a)+' / '+(b-a)+' XP')+'</span>'+(b===undefined?'':bar((x-a)/(b-a)*100,'var(--ok)'))+'</div>'}


/* ============================================================================
 * ====================  SECTION 14: MARKET FATIGUE  ==========================
 * ========================================================================== */
/* Your own trades move prices. S.fat[districtIndex][drugId] is a MULTIPLIER
 * (1 = normal). Buying multiplies it up, selling multiplies it down, and it
 * relaxes back toward 1 each year. This stops buy-sell loops being profitable. */

/**
 * Reads the fatigue multiplier for a drug in a district.
 * @param {number} l - District index.
 * @param {string} id - Drug id.
 * @returns {number} Multiplier (1 if never traded there).
 */
function fatOf(l,id){return ((S.fat||{})[l]||{})[id]||1}

/**
 * Stores a fatigue multiplier, limited to 0.25x..4x so prices can never
 * collapse to nothing or explode.
 * @param {number} l - District index.
 * @param {string} id - Drug id.
 * @param {number} f - New multiplier.
 * @returns {void}
 */
function fatSet(l,id,f){S.fat=S.fat||{};S.fat[l]=S.fat[l]||{};S.fat[l][id]=clamp(f,.25,4)}

/**
 * Cools every market toward normal. Each year closes HALF the gap to 1.
 * MATH: k = 0.5^n (n years passed). new = 1 + (old - 1) * k.
 *   e.g. old = 2.0, one year: 1 + (2-1)*0.5 = 1.5; two years: 1.25 ...
 * Values within 2% of 1 are deleted to keep the save file tidy.
 * @param {number} [n=1] - Years elapsed (jail time passes several at once).
 * @returns {void}
 */
function coolMarkets(n){if(!S.fat)return;var k=Math.pow(.5,n||1);Object.keys(S.fat).forEach(function(l){var o=S.fat[l];Object.keys(o).forEach(function(id){var v=1+(o[id]-1)*k;if(Math.abs(v-1)<.02)delete o[id];else o[id]=v})})}

/**
 * Developer helper text: this district's no-spike price range for a drug.
 * Only shown when the dev "Price ranges" toggle is on.
 * @param {Object} g - A GOODS entry.
 * @returns {string}
 */
function rng(g){var b=AREAS[S.loc].b[g.id];return 'Range here '+gbp(g.lo*b)+' to '+gbp(g.hi*b)+' (no spikes)'}


/* ============================================================================
 * =========================  SECTION 15: GUNS & BAGS  ========================
 * ========================================================================== */

/** Index of the best (highest) gun owned. @returns {number} -1 if unarmed. */
function gunI(){return S.guns&&S.guns.length?Math.max.apply(null,S.guns):-1}

/** Fight-odds bonus of the best gun (0 if unarmed). @returns {number} */
function gunB(){var i=gunI();return i<0?0:GUNS[i].b}

/** Extra sentence years from the best gun (0 if unarmed). @returns {number} */
function gunY(){var i=gunI();return i<0?0:GUNS[i].y}

/**
 * Buys a gun. GUARDS: enough cash, level high enough, not already owned.
 * @param {number} i - GUNS index.
 * @returns {void}
 */
function buyGun(i){var g=GUNS[i];if(S.cash<g.c||lvl()<g.u||(S.guns||[]).indexOf(i)>=0)return;S.cash-=g.c;(S.guns=S.guns||[]).push(i);say('You bought a '+g.n.toLowerCase()+'.');render()}

/**
 * Builds the Guns card (rows for each gun with Buy/Owned/locked state).
 * @returns {string} HTML.
 */
function gunView(){var o=S.guns||[];return '<div class="card"><h2>Guns</h2><p class="log">Your best weapon boosts your odds in fights with police and muggers. If police find it on you, it adds years to your sentence and is taken. '+(gunI()>=0?'You carry: '+GUNS[gunI()].n.toLowerCase()+'.':'You are unarmed.')+'</p>'+GUNS.map(function(g,i){var own=o.indexOf(i)>=0,lk=lvl()<g.u;return '<div class="row"><div class="nm"><b>'+g.n+' \u00b7 '+gbp(g.c)+'</b><small>'+(lk?'Unlocks at level '+g.u:'Fights +'+Math.round(g.b*100)+'% \u00b7 +'+g.y+' year'+(g.y>1?'s':'')+' if found')+'</small></div><button onclick="buyGun('+i+')"'+(own||lk||S.cash<g.c?' disabled':'')+'>'+(own?'Owned':'Buy')+'</button></div>'}).join('')+'</div>'}

/** Index of the owned bag, or -1 if none (S.bag may be null in old saves). @returns {number} */
function bagN(){return S.bag==null?-1:S.bag}

/**
 * Pocket capacity = base CAP (15) + the owned bag's extra slots.
 * @returns {number}
 */
function cap(){return CAP+(bagN()<0?0:BAGS[bagN()].s)}

/**
 * Buys/upgrades a bag. TRADE-IN MATH: the player gets 50% of the old bag's
 * price off, so cost = new price - round(0.5 * old price).
 * GUARDS: must be strictly better than the owned bag (i > owned), level
 * high enough, enough cash.
 * @param {number} i - BAGS index.
 * @returns {void}
 */
function buyBag(i){var b=BAGS[i],o=bagN(),cost=b.c-(o>=0?Math.round(BAGS[o].c*.5):0);if(i<=o||lvl()<b.u||S.cash<cost)return;S.cash-=cost;S.bag=i;say('You bought a '+b.n.toLowerCase()+' (+'+b.s+' slots).');render()}

/**
 * Builds the Bags card. For each bag shows locked / price after trade-in /
 * owned; downgrades and the owned bag have a disabled button.
 * @returns {string} HTML.
 */
function bagView(){var o=bagN();return '<div class="card"><h2>Bags</h2><p class="log">A bigger bag means more pocket slots. You carry '+cap()+' items. A bigger bag gives you half of the old one back.</p>'+BAGS.map(function(b,i){var lk=lvl()<b.u,cost=b.c-(o>=0?Math.round(BAGS[o].c*.5):0),own=i===o,low=i<o;return '<div class="row"><div class="nm"><b>'+b.n+' \u00b7 '+gbp(b.c)+'</b><small>'+(lk?'Unlocks at level '+b.u:'+'+b.s+' slots'+(own||low?'':' \u00b7 you pay '+gbp(cost)))+'</small></div><button onclick="buyBag('+i+')"'+(own||low||lk||S.cash<cost?' disabled':'')+'>'+(own?'Owned':'Buy')+'</button></div>'}).join('')+'</div>'}


/* ============================================================================
 * ==========  SECTION 16: ODD JOBS, MUGGINGS & CHARACTER HELPERS  ============
 * ========================================================================== */

/** True if the player has already done their one odd job this year. @returns {boolean} */
function worked(){return S.worked===S.day}

/**
 * Does an odd job (one per year).
 * FLOW: lock the job for this year -> roll pay (lo..hi) -> job-specific risk:
 *  - Delivery: police-stop chance = base * district heat * (1 - bribe cut).
 *    WHY multiply by (1 - cut): a bribe of 30% removes 30% of that risk.
 *    On a stop you get no pay and face a full arrest popup.
 *  - Debt collection: `hurt` chance (30%) of a beating: -15 health, half pay.
 * Otherwise you simply get paid. (Jobs no longer cost "fed".)
 * @param {number} i - JOBS index.
 * @returns {void}
 */
function work(i){var j=JOBS[i];if(worked())return;S.worked=S.day;var pay=Math.round(rnd(j.lo,j.hi));
if(j.arr&&pick()<j.arr*AREAS[S.loc].heat*(1-(S.bribe?PROT[S.bribe.l].cut:0))){say('Police stopped you on a delivery. You got no pay.');arrest(false,0,'Caught on the job','Officers stop you with the package. You get no pay for the job.');return}
if(j.hurt&&pick()<j.hurt){hurt(15,'a debt collection gone wrong');pay=Math.round(pay*.5);S.cash+=pay;say('The debt collection went bad. You lost 15 health and only got '+gbp(pay)+'.');note('The job went wrong','The debt collection turned nasty. You took a beating and lost 15 health, and only came away with '+gbp(pay)+'.');after();return}
S.cash+=pay;say(j.n+': you earned '+gbp(pay)+'.');render()}

/**
 * Builds the Odd jobs card (buttons disabled once the yearly job is used).
 * @returns {string} HTML.
 */
function jobsView(){var w=worked();return '<div class="card"><h2>Odd jobs</h2><p class="log">'+(w?'You\u2019ve already worked this year.':'One job a year, paid in cash. Handy when you\u2019re broke.')+'</p>'+JOBS.map(function(j,i){return '<div class="row"><div class="nm"><b>'+j.n+'</b> '+gbp(j.lo)+' to '+gbp(j.hi)+'<small>'+j.info+'</small></div><button onclick="work('+i+')"'+(w?' disabled':'')+'>Work</button></div>'}).join('')+'</div>'}

/**
 * Formats a 0..1 probability as a whole-number percentage string.
 * @param {number} p - e.g. 0.45
 * @returns {string} e.g. "45%".
 */
function pc(p){return Math.round(p*100)+'%'}

/**
 * Applies a robbery loss: takes a fraction of POCKET cash only (the bank and
 * safe are untouched), counts the stat, and shows a popup.
 * @param {number} f - Fraction of cash lost (0..1).
 * @param {string} t - Popup title.
 * @param {number} [h] - Health lost, for the message only (applied by the caller).
 * @returns {void}
 */
function lose(f,t,h){var l=Math.round(S.cash*f);S.cash-=l;stat().rob++;note(t,'You were robbed of '+gbp(l)+(h?' and lost '+h+' health':'')+'.')}

/**
 * Raises a mugging/burglary choice popup with three options:
 *  - Fight: win chance = min(0.85, 0.40 + gun bonus). The 0.85 cap means even
 *    a heavy machine gun can't make a fight a sure thing. WIN: -5 health,
 *    loot £1-£50, plus a 0.5% chance the robber drops a gun you could unlock
 *    but don't own. LOSE: -20 health and lose fraction f of cash.
 *  - Run: 50% escape (costs 10 fed); fail = -10 health and lose f of cash.
 *  - Give up: certain, but only 60% of f is taken and nobody is hurt.
 * RISK/REWARD: the stakes text previews the exact pound amounts.
 * @param {number} f - Fraction of cash at risk (e.g. 0.2-0.6).
 * @param {string} t - Event title.
 * @param {string} d - Event description.
 * @returns {void}
 */
function robbery(f,t,d){ask(t,d,[{l:'Fight',s:'Win odds '+pc(Math.min(.85,.4+gunB()))+'. Lose and you lose about '+gbp(S.cash*f)+' and 20 health.',k:'danger',fn:function(){if(pick()<Math.min(.85,.4+gunB())){hurt(5,'a mugging');var lc=Math.round(rnd(1,50)),wp='',ok=[];S.cash+=lc;GUNS.forEach(function(g,i){if(g.u<=lvl()&&(S.guns||[]).indexOf(i)<0)ok.push(i)});if(ok.length&&pick()<.005){var wi=ok[Math.floor(Math.random()*ok.length)];(S.guns=S.guns||[]).push(wi);wp=' They also dropped a '+GUNS[wi].n.toLowerCase()+', which you kept.'}say('You beat off a robber and took '+gbp(lc)+' from them.'+wp);note('You fought them off','You drove them away'+(gunI()>=0?' with your '+GUNS[gunI()].n.toLowerCase():'')+', lost 5 health and took '+gbp(lc)+' off them.'+wp)}else{hurt(20,'a mugging');lose(f,'You lost the fight',20)}}},{l:'Run',s:'Escape odds 50%. Fail and you lose about '+gbp(S.cash*f)+' and 10 health.',fn:function(){if(pick()<.5){S.food=clamp(S.food-10,0,100);note('You got away','You ran and they didn\u2019t follow. You lost nothing.')}else{hurt(10,'a mugging');lose(f,'They caught you',10)}}},{l:'Give up',s:'Certain, but you only lose about '+gbp(S.cash*f*.6)+' and nobody gets hurt.',fn:function(){lose(f*.6,'You handed it over')}}])}

/**
 * Picks a random first name for a gender. @param {string} x - 'M' or 'F'. @returns {string}
 */
function pickName(x){var a=NM[x];return a[Math.floor(Math.random()*a.length)]}

/** Picks a random family surname. @returns {string} */
function famName(){return SN[Math.floor(Math.random()*SN.length)]}

/**
 * Creates a relative (crew member).
 * @param {string} kind - 'Sibling' or 'Cousin'.
 * @param {number} g - Generation number they belong to.
 * @param {string} sn - Family name.
 * @returns {{n:string,kind:string,sex:string,g:number,task:null,jail:number}}
 */
function mkRel(kind,g,sn){var x=Math.random()<.5?'M':'F';return {n:pickName(x)+' '+sn,kind:kind,sex:x,g:g,task:null,jail:0}}

/** Lifetime statistics object (created lazily). @returns {{sold:number,jail:number,arr:number,rob:number,peak:number}} */
function stat(){return S.st||(S.st={sold:0,jail:0,arr:0,rob:0,peak:0})}

/**
 * Applies health damage and remembers the cause for the death screen.
 * (Death itself is checked later in after()/sleep().)
 * @param {number} n - Health points lost.
 * @param {string} why - Cause text, e.g. "a mugging".
 * @returns {void}
 */
function hurt(n,why){S.hp-=n;S.why=why}

/**
 * NET WORTH = pocket cash + bank + pocket stock value + safe stock value.
 * This is the score at death.
 * @returns {number} Pounds, rounded.
 */
function net(){return Math.round(S.cash+(S.bank||0)+worth()+safeWorth())}

/**
 * Family relationship label as seen by the current character: same
 * generation = Sibling/Cousin; older generation = Aunt/Uncle.
 * @param {Object} r - Relative.
 * @returns {string}
 */
function relLabel(r){return r.g===S.gen?r.kind:(r.sex==='F'?'Aunt':'Uncle')}

/**
 * Builds the life record stored in the family tree when a character dies.
 * `died` is AGE0+DAYS+1 (= 68) for old age, otherwise the age at death.
 * `peak` = the best of tracked peak and final net worth.
 * @returns {Object} Life record.
 */
function lifeRec(){var nat=S.hp>0,t=stat();return {n:S.name+' '+S.sn,look:S.look,g:S.gen,sx:S.sex||'Founder',died:nat?AGE0+DAYS+1:AGE0+S.day,cause:nat?'old age':(S.why||'injuries'),net:net(),lvl:lvl(),sold:t.sold,jail:t.jail,arr:t.arr,rob:t.rob,peak:Math.max(t.peak,net())}}

/**
 * Prepares the relatives list for the next generation: keep relatives of
 * the current generation or newer, add a new sibling and cousin of the NEXT
 * generation, and cap the list at 6 by dropping the oldest first (shift()).
 * @returns {Object[]} New relatives array.
 */
function nextFam(){var G=S.gen,f=(S.fam||[]).filter(function(r){return r.g>=G});f.push(mkRel('Sibling',G+1,S.sn),mkRel('Cousin',G+1,S.sn));while(f.length>6)f.shift();return f}


/* ============================================================================
 * ===========================  SECTION 17: FAMILY CREW  ======================
 * ========================================================================== */

/**
 * Builds the Crew tab: one row per relative with Cook / Sell / Stand down.
 * A relative is disabled with no property or while jailed. The Cook button
 * is also disabled when there's no room (room() < 1).
 * @returns {string} HTML.
 */
function crewView(){var p=S.prop,c='<div class="card"><h2>Family crew</h2><p class="log">Relatives work for you once you own a property. Cooks start a batch of up to 10 each year for a 15% fee on ingredients. Sellers sell up to 10 units a year from your safe for a 15% cut. They can get arrested.</p>';
if(!S.fam||!S.fam.length)return c+'<p class="lead">No relatives to call on.</p></div>';
return c+S.fam.map(function(r,i){var t=r.task,stt=r.jail>0?'In jail for '+r.jail+' more year'+(r.jail>1?'s':''):t?(t.k==='cook'?'Cooking ':'Selling ')+gd(t.d).n:'Free',off=(!p||r.jail>0)?' disabled':'';return '<div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><b>'+r.n+'</b> \u00b7 '+relLabel(r)+'<small>'+stt+'</small></div><div class="btns" style="flex:1 1 100%"><button style="flex:1" onclick="assign('+i+',\'cook\')"'+(off||(room()<1?' disabled':''))+'>Cook'+(!off&&room()<1?' (no room)':'')+'</button><button style="flex:1" onclick="assign('+i+',\'sell\')"'+off+'>Sell</button><button style="flex:1" onclick="standDown('+i+')"'+(t?'':' disabled')+'>Stand down</button></div></div>'}).join('')+(p?'':'<p class="log">Buy a property first.</p>')+'</div>'}

/**
 * Opens the "which drug?" picker for a relative. (go() stores the menu to
 * return to, so Cancel works.)
 * @param {number} i - Relative index in S.fam.
 * @param {string} k - 'cook' or 'sell'.
 * @returns {void}
 */
function assign(i,k){AS={i:i,k:k};go('assign')}

/**
 * Confirms the picker: stores the task on the relative and closes the menu.
 * @param {string} id - Drug id.
 * @returns {void}
 */
function setTask(id){S.fam[AS.i].task={k:AS.k,d:id};M=null;render()}

/** Cancels a relative's task. @param {number} i - Relative index. @returns {void} */
function standDown(i){S.fam[i].task=null;render()}

/**
 * Runs every relative's job at the year turn and reports results in one popup.
 *  - Jailed relatives count down one year.
 *  - COOK: needs a lab, that drug's equipment and no batch already running.
 *    quantity n = min(10, free room, affordable) where each unit costs
 *    ingredients * 1.15 (the 15% family fee). Batch is queued as a normal batch.
 *  - SELL: up to 10 units from the safe. BUST CHANCE = 8% * district heat *
 *    (1 - bribe cut) (the `pick()*100<...` compares a 0..100 number to a
 *    percentage). Bust = lose the units and 2-4 years jail.
 *    REVENUE: price = average(lo,hi) * district bias * random(0.85..1.15);
 *    pay = units * price * 0.85 (15% cut to the family).
 * @returns {void}
 */
function crewYear(){var p=S.prop,out=[];if(!S.fam)return;
S.fam.forEach(function(r){if(r.jail>0){r.jail--;if(!r.jail)out.push(r.n+' is out of jail.');return}
var t=r.task;if(!t||!p)return;var g=gd(t.d);
if(t.k==='cook'){if(!p.lab||!(p.eq&&p.eq[t.d])||(p.batch&&p.batch[t.d]))return;var u=ing(g),n=Math.min(10,room(),Math.floor(S.cash/(u*1.15)));if(n<1){out.push(r.n+' couldn\u2019t start '+g.n+': no space or cash.');return}var cost=Math.round(u*n*1.15);S.cash-=cost;yp().o+=cost;(p.batch=p.batch||{})[t.d]={n:n,u:u,c:1};out.push(r.n+' started '+n+' '+g.n+' for '+gbp(cost)+'.')}
else{var sf=p.safe||{},q=Math.min(10,sf[t.d]||0);if(q<1)return;
if(pick()*100<8*AREAS[p.loc].heat*(1-(S.bribe?PROT[S.bribe.l].cut:0))){sf[t.d]-=q;r.jail=2+Math.floor(Math.random()*3);r.task=null;out.push(r.n+' was busted selling '+g.n+' and lost '+q+' units. Jailed for '+r.jail+' years.');return}
var pr=Math.round((g.lo+g.hi)/2*AREAS[p.loc].b[t.d]*rnd(.85,1.15)),rev=Math.round(q*pr*.85);sf[t.d]-=q;S.cash+=rev;yp().i+=rev;stat().sold+=q;out.push(r.n+' sold '+q+' '+g.n+' for '+gbp(rev)+'.')}});
if(out.length)note('Crew report',out.join('<br>'))}


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
function treeView(){var L=(S.line||[]).slice();if(S.view==='over')L.push(lifeRec());var tot=0;L.forEach(function(r){tot+=r.net});
var h='<div class="card"><h2>Family tree</h2><p class="log">'+S.sn+' bloodline \u00b7 generation '+S.gen+'. Wealth left behind by those who came before: '+gbp(tot)+'.</p>';
L.forEach(function(r,i){h+='<div class="row" style="border-left:3px solid var(--amber);padding-left:10px;margin-left:4px">'+portrait(r.look,52)+'<div class="nm"><b>'+r.n+'</b> \u00b7 '+r.sx+' \u00b7 Gen '+r.g+'<small>Died aged '+r.died+' of '+r.cause+'. Net worth '+gbp(r.net)+', level '+r.lvl+', '+r.sold+' units sold, '+r.arr+' arrest'+(r.arr===1?'':'s')+' ('+r.jail+' yrs inside), robbed '+r.rob+' time'+(r.rob===1?'':'s')+'.</small></div></div>'+(i<L.length-1||S.view!=='over'?'<div style="text-align:center;color:var(--dim)">\u2193</div>':'')});
if(S.view!=='over')h+='<div class="row" style="border-left:3px solid var(--ok);padding-left:10px;margin-left:4px">'+portrait(S.look,52)+'<div class="nm"><b>'+S.name+' '+S.sn+'</b> \u00b7 '+(S.sex||'Founder')+' \u00b7 Gen '+S.gen+'<small>Alive, aged '+age()+'. Net worth '+gbp(net())+', level '+lvl()+'.</small></div></div>';
return h+'<button class="main full" onclick="back()">Back</button></div>'}


/* ============================================================================
 * ============================================================================
 * ======  SECTION 19: STATE CREATION & PRICE ENGINE  =========================
 * ============================================================================
 * ========================================================================== */

/**
 * Starts a brand-new game: builds the entire state object S.
 * Defaults: cash £100, full health, 70 fed, year 1, level 0 XP, district 0,
 * view 'create' (character creation). Also clears the event queue Q, picks
 * a random gender/name/surname and two starting relatives, then rolls
 * prices and renders.
 * @returns {void}
 */
function newGame(){Q=[];var sn=famName(),GG=Math.random()<.5?'M':'F';S={day:1,gen:1,xp:0,guns:[],bag:-1,bank:0,gender:GG,name:pickName(GG),sn:sn,fam:[mkRel('Sibling',1,sn),mkRel('Cousin',1,sn)],line:[],st:{sold:0,jail:0,arr:0,rob:0,peak:0},sex:'',cash:100,hp:100,food:70,loc:0,inv:zero(),paid:zero(),prop:null,look:newLook(GG),tab:'trade',view:'create',log:['You’re 18 with £100 and fifty years ahead of you. You’ll sleep rough until you can buy a place. Eat, and don’t get caught.'],ev:null};roll();render()}

/**
 * ROLLS TODAY'S PRICES for the current district. Called on new year,
 * travel and dev "reroll".
 * MATH, per drug:
 *   price = random(lo..hi) * district bias * market fatigue
 *   then a random event on a single roll r:
 *     r < 0.10        -> x 2.2  "spike"  (flag = +1)
 *     0.10 <= r < 0.20 -> x 0.4  "cheap"  (flag = -1)
 *     otherwise       -> unchanged (flag = 0 / unset)
 * Max(1, round(...)) guarantees a price of at least £1, as a whole number.
 * @returns {void}
 */
function roll(){S.prices={};S.flag={};var a=AREAS[S.loc];GOODS.forEach(function(g){var p=rnd(g.lo,g.hi)*a.b[g.id]*fatOf(S.loc,g.id),r=pick();if(r<.1){p*=2.2;S.flag[g.id]=1}else if(r<.2){p*=.4;S.flag[g.id]=-1}S.prices[g.id]=Math.max(1,Math.round(p))})}

/**
 * Adds a line to the top of the history log, stamped with the current age.
 * The log keeps only the newest 300 lines (slice) to bound save size.
 * @param {string} t - Message.
 * @returns {void}
 */
function say(t){S.log.unshift('Age '+age()+': '+t);S.log=S.log.slice(0,300)}


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
function bar(v,c){return '<div class="bar"><i style="width:'+clamp(v,0,100)+'%;background:'+c+'"></i></div>'}

/**
 * Builds the Heat stat tile.
 * COLOUR MATH: HSL hue 120 = green, 0 = red. hue = 120 - (min(r,60)/60)*120,
 * so heat 0% is green, 30% is yellow-orange, and 60%+ is fully red.
 * (Capping at 60 keeps everything above 60% pure red.)
 * @returns {string} HTML.
 */
function heatStat(){var r=heat(undefined,true),h=Math.round(120-Math.min(r,60)/60*120);return '<div class="stat"><small>Heat</small><div class="num">'+Math.round(r)+'%</div>'+bar(r,'hsl('+h+',55%,52%)')+'</div>'}

/**
 * Builds the game header: portrait, name, age/generation/gender, Menu button,
 * the sticky Cash/Health/Fed/Heat tiles (+ optional tab bar) and the level chip.
 * Health bar turns red under 35; Fed bar turns red at 30 or less.
 * @param {string} [tb] - Optional tab-bar HTML placed inside the sticky area.
 * @returns {string} HTML.
 */
function head(tb){return '<div class="top" style="flex-wrap:nowrap;align-items:center;gap:10px">'+portrait(S.look,44)+'<div style="flex:1;min-width:0"><h1 style="font-size:24px;color:var(--amber);line-height:1.1;overflow-wrap:anywhere">'+S.name+' '+S.sn+'</h1><div class="log">Age '+age()+' \u00b7 Gen '+S.gen+' \u00b7 '+(S.gender==='F'?'Female':'Male')+'</div></div><button class="mini" onclick="go(\'menu\')">Menu</button></div><div class="stick"><div class="stats"><div class="stat"><small>Cash</small><div class="num">'+gbpS(S.cash)+'</div></div><div class="stat"><small>Health</small><div class="num">'+Math.round(S.hp)+'</div>'+bar(S.hp,S.hp>35?'var(--ok)':'var(--brick)')+'</div><div class="stat"><small>Fed</small><div class="num">'+Math.round(S.food)+'</div>'+bar(S.food,S.food>30?'var(--amber)':'var(--brick)')+'</div>'+heatStat()+'</div>'+(tb||'')+'</div>'+levelChip()}

/**
 * Builds the recent-events card (newest 4 log lines). Tapping opens the
 * full history menu.
 * @returns {string} HTML.
 */
function logb(){return '<div class="card log" onclick="go(\'log\')" style="cursor:pointer">'+S.log.slice(0,4).map(function(l){return '<p>'+l+'</p>'}).join('')+'<p style="font-size:12px">Tap for full history</p></div>'}

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
 * writing HTML, manages SCROLL (see comments below) and finally save()s.
 * @returns {void}
 */
function render(){var h='';try{stat().peak=Math.max(stat().peak,net())}catch(e){}if(M){$('app').innerHTML=menuView();return}
/* ---- DEATH SCREEN: also records a new best score to localStorage ---- */
if(S.view==='over'){var rc=lifeRec(),sc=rc.net;if(sc>best){best=sc;try{localStorage.setItem('tn_best',best)}catch(e){}}
var fr=function(a,b){return '<div class="row"><div class="nm">'+a+'</div><b>'+b+'</b></div>'};
h='<div class="top"><h1>Kingpin: Bloodline</h1><div class="day">Gen '+S.gen+'</div></div><div class="card"><h2>'+rc.n+'</h2><p class="lead">'+(rc.cause==='old age'?'Died of old age':'Died of '+rc.cause)+' aged '+rc.died+' \u00b7 '+(rc.sx==='Founder'?'founder of the bloodline':rc.sx.toLowerCase()+', generation '+rc.g)+'.</p><div style="display:flex;justify-content:center">'+portrait(S.look,96)+'</div><div class="num big">'+gbp(sc)+'</div><p class="log">Net worth at death. Best on this device: '+gbp(best)+'</p>'+fr('Level reached',rc.lvl)+fr('Peak net worth',gbp(rc.peak))+fr('Units sold',rc.sold)+fr('Arrests',rc.arr+' ('+rc.jail+' years inside)')+fr('Times robbed',rc.rob)+fr('Property',S.prop?PROPS[S.prop.i].n:'None')+'<button class="full" onclick="go(\'tree\')">View family tree</button></div><div class="card"><p class="lead">Your heir inherits half the cash, half your bank balance and half the stock (as much as they can carry)'+(S.prop?', the property':'')+', your bag, your level and your crew. Who takes over?</p><div class="btns"><button class="main" style="flex:1" onclick="heir(\'Son\')">Son</button><button class="main" style="flex:1" onclick="heir(\'Daughter\')">Daughter</button></div></div>'}
/* ---- OTHER FULL-SCREEN VIEWS ---- */
else if(S.view==='heirname'){h=heirNameView()}
else if(S.view==='create'){h=createView()}
/* ---- EVENT POPUP: choices carry class k (e.g. "danger"), optional
        sub-text s, and are greyed out when d (disabled) is true ---- */
else if(S.ev){h=head()+'<div class="card"><h2>'+S.ev.t+'</h2><p class="lead">'+S.ev.d+'</p>'+S.ev.c.map(function(c,i){return '<button class="opt '+(c.k||'')+'"'+(c.d?' disabled':'')+' onclick="choose('+i+')">'+c.l+(c.s?'<small>'+c.s+'</small>':'')+'</button>'}).join('')+'</div>'+logb()}
/* ---- MAIN DAY VIEW: header + tab bar, then the card(s) of the active tab ---- */
else{var a=AREAS[S.loc];h=head('<div class="tabs"><button class="'+(S.tab==='trade'?'on':'')+'" onclick="tab(\'trade\')">Trade</button><button class="'+(S.tab==='food'?'on':'')+'" onclick="tab(\'food\')">Care</button><button class="'+(S.tab==='go'?'on':'')+'" onclick="tab(\'go\')">Travel</button><button class="'+(S.tab==='home'?'on':'')+'" onclick="tab(\'home\')">Home</button><button class="'+(S.tab==='lab'?'on':'')+'" onclick="tab(\'lab\')">Lab</button><button class="'+(S.tab==='guns'?'on':'')+'" onclick="tab(\'guns\')">Gear</button><button class="'+(S.tab==='crew'?'on':'')+'" onclick="tab(\'crew\')">Crew</button><button class="'+(S.tab==='casino'?'on':'')+'" onclick="tab(\'casino\')">Casino</button></div>');
/* TRADE TAB: market list. Buy/Max disabled if you can't afford one unit or pockets are full; "Sell all" disabled with nothing held. Spike/cheap tags come from S.flag. */
if(S.tab==='trade'){h+='<div class="card"><h2>'+a.n+' market</h2><small class="log">Pockets: '+carried()+' of '+cap()+'</small>'+ug().map(function(g){var q=S.inv[g.id],p=S.prices[g.id],f=S.flag[g.id];return '<div class="row"><div class="nm"><b>'+g.n+'</b> '+gbp(p)+(f?' <span class="'+(f>0?'up':'down')+'">'+(f>0?'spike':'cheap')+'</span>':'')+'<small>Holding '+q+(q?' · paid avg '+gbp(S.paid[g.id]):'')+'</small>'+(DEVR?'<small style="color:var(--sleet)">'+rng(g)+'</small>':'')+'</div><div class="btns"><button class="buy" onclick="buy(\''+g.id+'\',1)" '+(S.cash<Math.round(p)||carried()>=cap()?'disabled':'')+'>Buy</button><button onclick="buy(\''+g.id+'\',99)" '+(S.cash<Math.round(p)||carried()>=cap()?'disabled':'')+'>Max</button><button class="sell" onclick="sell(\''+g.id+'\')" '+(q?'':'disabled')+'>Sell all</button></div></div>'}).join('')+'</div>'}
/* ODD JOBS sit under the market; CARE TAB = food and medicine cards */
if(S.tab==='trade')h+=jobsView();if(S.tab==='food'){h+='<div class="card"><h2>Food</h2>'+FOOD.map(function(f,i){return '<div class="row"><div class="nm"><b>'+f.n+'</b> '+gbp(f.c)+'<small>+'+f.f+' fed'+(f.h?', +'+f.h+' health':'')+'</small></div><button onclick="eat('+i+')" '+(S.cash<f.c?'disabled':'')+'>Buy</button></div>'}).join('')+'<p class="log">Each year you lose 30 fed. At zero you lose 15 health. Well fed and indoors, you heal.</p></div><div class="card"><h2>Medicine</h2>'+MEDS.map(function(m,i){return '<div class="row"><div class="nm"><b>'+m.n+'</b> '+gbp(m.c)+'<small>+'+m.h+' health</small></div><button onclick="heal('+i+')" '+(S.cash<m.c||S.hp>=100?'disabled':'')+'>Buy</button></div>'}).join('')+'</div>'}
/* TRAVEL TAB: district list with a police-presence label from heat: <0.7 light, <1.1 moderate, else heavy */
if(S.tab==='go'){h+='<div class="card"><h2>Move to another district</h2><p class="log">Travelling costs 10 fed and risks a stop or a mugging. Busier districts mean more police.</p>'+AREAS.map(function(x,i){return '<div class="row"><div class="nm"><b>'+x.n+'</b><small>Police '+(x.heat<.7?'light':x.heat<1.1?'moderate':'heavy')+'</small></div><button onclick="travel('+i+')" '+(i===S.loc?'disabled':'')+'>'+(i===S.loc?'Here':'Go')+'</button></div>'}).join('')+'</div>'}
/* HOME TAB: safe + bank + property list. Buying a new property needs cash PLUS the 80% resale of the one you'd replace (that's the S.cash+... check); blocked() adds level/lock rules. */
if(S.tab==='home'){h+=safeView()+bankView()+'<div class="card"><h2>Property</h2>'+(S.prop?'<p class="lead">You own a '+PROPS[S.prop.i].n.toLowerCase()+' in '+AREAS[S.prop.loc].n+'. Upkeep '+gbp(PROPS[S.prop.i].up)+' a year. '+(S.prop.i===0?'It can\u2019t be sold, but trading up still gives you '+gbp(PROPS[0].c*.8)+' back.':'It sells for '+gbp(PROPS[S.prop.i].c*.8)+'.')+' Safe holds '+SLOTS[S.prop.i]+'.</p>'+(S.prop.lab?'<p class="log">Your lab and equipment go with the property if you sell or trade up.</p>':'')+(locked()?'<p class="log">You can’t sell while the safe has stock or a batch is running. Upgrading moves your stock to the new safe, but the lab and equipment stay behind, so let batches finish first.</p>':'')+(S.prop.i===0?'':'<button class="danger full" onclick="sellProp()"'+(locked()?' disabled':'')+'>Sell property</button>'):'<p class="lead">No place of your own, so you sleep rough: cold, and easy prey. Buy a place in '+AREAS[S.loc].n+' to sleep safely whenever you end the day here.</p>')+PROPS.map(function(p,i){return '<div class="row"><div class="nm"><b>'+p.n+'</b> '+gbp(p.c)+'<small>Upkeep '+gbp(p.up)+' a year. Safe slots: '+SLOTS[i]+'. '+(lvl()<p.u?'Unlocks at level '+p.u:p.info)+'</small></div><button onclick="buyProp('+i+')" '+(S.cash+(S.prop?PROPS[S.prop.i].c*.8:0)<p.c||blocked(i)?'disabled':'')+'>Buy</button></div>'}).join('')+'</div>'}
/* REMAINING TABS delegate to their own builders */
if(S.tab==='home')h+=bribeView();
if(S.tab==='lab')h+=labView();
if(S.tab==='guns')h+=gunView()+bagView();
if(S.tab==='crew')h+=crewView();
if(S.tab==='casino')h+=casinoView();
/* FOOTER (every day-view tab): tonight's bed, recent log, and the fixed end-year button */
h+='<p class="log">This year: '+tonight().n+'</p>'+logb()+'<div class="endbar"><button class="main full" onclick="endDay()">Let the year pass</button></div>'}
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
var nv=(!!S.ev&&S.ev!==LEV)||S.view!==LV,tn=!nv&&S.tab!==LT;LEV=S.ev||null;LV=S.view;LT=S.tab;var ot=document.querySelector('.tabs'),sl=ot?ot.scrollLeft:0,pY=window.scrollY,ap=$('app');ap.innerHTML=h;if(nv){ap.style.minHeight='';window.scrollTo(0,0)}else if(tn){ap.style.minHeight='';var tp=document.querySelector('.top');if(tp){var ty=window.scrollY+tp.getBoundingClientRect().bottom+10-(parseFloat(getComputedStyle(document.documentElement).paddingTop)||0),tg=pY>ty?ty:pY,need=tg+window.innerHeight;if(ap.offsetHeight<need)ap.style.minHeight=need+'px';window.scrollTo(0,tg)}}var nt=document.querySelector('.tabs');if(nt){nt.scrollLeft=sl;var on=nt.querySelector('button.on');if(on){var r=on.getBoundingClientRect(),q=nt.getBoundingClientRect();if(r.left<q.left)nt.scrollLeft-=q.left-r.left+8;else if(r.right>q.right)nt.scrollLeft+=r.right-q.right+8}}save()}


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
function save(){if(S.ev)return;try{localStorage.setItem('tn_save',JSON.stringify(Object.assign({},S,{v:4})))}catch(e){}}

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
function load(){try{var j=localStorage.getItem('tn_save');if(j){var s=JSON.parse(j);if(s&&(s.v===2||s.v===3||s.v===4)&&s.inv&&s.prices&&s.day){if(s.v===2&&s.prop)s.prop.i++;if(!s.sn){s.sn=famName();s.name=pickName(Math.random()<.5?'M':'F');s.fam=[mkRel('Sibling',s.gen||1,s.sn),mkRel('Cousin',s.gen||1,s.sn)];s.line=s.line||[]}if(!s.gender)s.gender=s.sex==='Daughter'?'F':'M';s.look=fixLook(s.look,s.gender);(s.line||[]).forEach(function(r){r.look=fixLook(r.look,r.sx==='Daughter'?'F':'M')});if(!s.st)s.st={sold:0,jail:0,arr:0,rob:0,peak:0};if(s.bag==null)s.bag=-1;if(s.bank==null)s.bank=0;s.v=4;return s}}}catch(e){}return null}

/* ===================== END OF PART 3 ===================== */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 22: TAB SWITCHING & MARKET / CARE ACTIONS  =================
 * ============================================================================
 * ========================================================================== */

/**
 * Switches the active tab of the day view and redraws.
 * @param {string} t - 'trade' | 'food' | 'go' | 'home' | 'lab' | 'guns' | 'crew' | 'casino'.
 * @returns {void}
 */
function tab(t){S.tab=t;render()}

/**
 * BUYS units of a drug, with MARKET FATIGUE: every unit you buy pushes the
 * price up a little, so the 10th unit costs more than the 1st.
 * MATH (step by step):
 *   r = e^(KB / cap)      per-unit price multiplier. KB = 0.5, so buying a
 *                         FULL bag of `cap` units multiplies the price by
 *                         e^0.5 (about 1.65x). Dividing by cap means a bigger
 *                         bag spreads the same pressure over more units.
 *   loop: each unit costs the current price x, then x *= r (next one dearer).
 *   The loop stops when: asked amount reached, pockets are full, or the next
 *   total (rounded) would exceed your cash.
 *   paid = min(cash, round(total))   total actually charged.
 *   new average price paid = (oldAverage * oldQty + totalPaid) / (oldQty + newQty)
 *                            (a weighted average, shown as "paid avg").
 *   Market fatigue for this district is multiplied by r^m, which later cools
 *   back toward 1 year by year (see coolMarkets).
 * Also adds the spend to this year's "money out" for the XP profit formula.
 * @param {string} id - Drug id.
 * @param {number} n - Units wanted (99 is used by the "Max" button).
 * @returns {void} (does nothing if not even one unit can be bought)
 */
function buy(id,n){var x=S.prices[id],r=Math.exp(KB/cap()),tot=0,m=0,c=carried();while(m<n&&c+m<cap()&&Math.round(tot+x)<=S.cash){tot+=x;x*=r;m++}if(m<1)return;var paid=Math.min(S.cash,Math.round(tot)),q=S.inv[id];S.paid[id]=(S.paid[id]*q+paid)/(q+m);S.inv[id]+=m;S.cash-=paid;yp().o+=paid;fatSet(S.loc,id,fatOf(S.loc,id)*Math.pow(r,m));S.prices[id]=Math.max(1,x);say('Bought '+m+' '+id+' for '+gbp(paid)+'.');render()}

/**
 * SELLS ALL held units of a drug; each unit sold pushes the price DOWN.
 * MATH:
 *   d = e^(-KS / cap)     per-unit multiplier below 1 (KS = 0.7), so selling
 *                         a full bag cuts the price to e^-0.7 (about 0.50x).
 *   The first unit already sells at x*d (the loop decays BEFORE adding), so
 *   you never get the full displayed price for the whole stack.
 *   total = sum of all unit prices (floored to at least £1 each).
 *   profit = round(total) - (units * average price paid).
 *   Fatigue multiplier is scaled by (finalPrice / startPrice), i.e. exactly
 *   how far this sale dropped the market, then cools over the years.
 * Updates yearly "money in", lifetime units sold, and logs profit or loss.
 * @param {string} id - Drug id.
 * @returns {void}
 */
function sell(id){var q=S.inv[id];if(!q)return;var p0=S.prices[id],x=p0,d=Math.exp(-KS/cap()),tot=0;for(var i=0;i<q;i++){x=Math.max(1,x*d);tot+=x}var t=Math.round(tot),pr=t-q*S.paid[id];S.cash+=t;yp().i+=t;S.inv[id]=0;S.paid[id]=0;fatSet(S.loc,id,fatOf(S.loc,id)*x/p0);S.prices[id]=x;say('Sold '+q+' '+id+' for '+gbp(t)+(pr>=0?' (+'+gbp(pr)+' profit).':' (a loss of '+gbp(-pr)+').'));stat().sold+=q;render()}

/**
 * Buys medicine: pays and restores health (capped at 100). The button is
 * already disabled when you can't afford it or are at full health, so no
 * extra guards are needed here.
 * @param {number} i - MEDS index.
 * @returns {void}
 */
function heal(i){var m=MEDS[i],b=S.hp;S.cash-=m.c;S.hp=clamp(S.hp+m.h,0,100);say('You used '+m.n.toLowerCase()+' and recovered '+Math.round(S.hp-b)+' health.');render()}

/**
 * Buys food: restores "fed" (0..100) and, for proper meals, some health.
 * @param {number} i - FOOD index.
 * @returns {void}
 */
function eat(i){var f=FOOD[i];S.cash-=f.c;S.food=clamp(S.food+f.f,0,100);S.hp=clamp(S.hp+f.h,0,100);say('Ate at the '+f.n.toLowerCase()+'.');render()}


/* ============================================================================
 * ============================================================================
 * ======  SECTION 23: EVENT SYSTEM (POPUPS & CHOICES)  =======================
 * ============================================================================
 * ========================================================================== */
/* An EVENT is {t: title, d: description, c: [choices]}. Each choice is
 * {l: label, s: sub-text, k: css class, d: disabled?, fn: callback}.
 * Only ONE event shows at a time (S.ev); extras wait in the queue Q. */

/**
 * Shows an event popup, or queues it if one is already open.
 * @param {string} t - Title.
 * @param {string} d - Description.
 * @param {Object[]} c - Choices.
 * @returns {void}
 */
function ask(t,d,c){var e={t:t,d:d,c:c};if(S.ev)Q.push(e);else S.ev=e;render()}

/**
 * Handles the player tapping choice number i.
 * ORDER MATTERS: (1) clear S.ev first, so that the callback can raise a NEW
 * event (e.g. a failed escape triggers a jail notice) without it being
 * queued behind the old one; (2) run the callback; (3) if the callback did
 * not open another event and others are waiting, show the next one;
 * (4) after() checks for death and redraws.
 * @param {number} i - Index of the chosen option.
 * @returns {void}
 */
function choose(i){var c=S.ev.c[i];S.ev=null;c.fn();if(!S.ev&&Q.length)S.ev=Q.shift();after()}

/**
 * Post-action check: if health is zero or below, clamp it to 0 and switch to
 * the death screen; then redraw.
 * @returns {void}
 */
function after(){if(S.hp<=0){S.hp=0;S.view='over'}render()}


/* ============================================================================
 * ============================================================================
 * ======  SECTION 24: ARREST, JAIL & TRAVEL  =================================
 * ============================================================================
 * ========================================================================== */

/**
 * Base prison years from the value of the stock you carry.
 * MATH: nothing carried (v<1) = 1 year; otherwise 1 + one extra year per
 * £1,000 of stock (floor), limited to 1..8.
 * @param {number} v - Street value of carried stock in pounds.
 * @returns {number} Years 1..8.
 */
function jailDays(v){return v<1?1:clamp(1+Math.floor(v/1000),1,8)}

/**
 * Raises the ARREST popup with up to four options.
 * SENTENCE ESTIMATE: days = min(10, base years + `ex` (extra years, e.g. +3
 * for an FBI raid) + best-gun years). The actual sentence is recomputed in
 * jail(), so this is a preview.
 * ODDS USED:
 *   Run   (hidden if noRun): 45% escape. Success: you drop HALF your stock
 *         (the half that is "ceil" is dropped, "floor" is kept) and lose 10 fed.
 *   Fight : win = min(0.85, 0.35 + gun bonus). Win: -10 health, keep stock.
 *           Lose: -20 health, then jail.
 *   Give up: certain jail, but `ex - 1` so the sentence is one year shorter.
 *   Bribe : costs max(£100, 30% of cash). Success chance bp = 0.20 for FBI
 *           level (ex >= 3), 0.40 when you can't run (raids), else 0.75.
 *           Disabled if you can't afford it. Failure = jail.
 * @param {boolean} noRun - True to remove the Run option (raids).
 * @param {number} [ex=0] - Extra sentence years.
 * @param {string} [title] - Popup title.
 * @param {string} [desc] - Extra description sentence.
 * @returns {void}
 */
function arrest(noRun,ex,title,desc){ex=ex||0;var v=Math.round(worth()),days=Math.min(10,jailDays(v)+ex+gunY()),c=[],bribe=Math.max(100,Math.round(S.cash*.3)),bp=ex>=3?.2:noRun?.4:.75,fp=Math.min(.85,.35+gunB()),y1=Math.max(1,days-1);
if(!noRun)c.push({l:'Run',s:'Escape odds 45%. You drop half your stock to get clear. Fail and you\u2019re jailed.',fn:function(){if(pick()<.45){var dt=[];GOODS.forEach(function(g){var h=Math.ceil(S.inv[g.id]/2);if(h>0)dt.push(h+' '+g.n);S.inv[g.id]=Math.floor(S.inv[g.id]/2)});S.food=clamp(S.food-10,0,100);say('You ditched '+dt.join(', ')+' to get clear.');note('You got away','You ditched '+dt.join(', ')+' and got clear.')}else{say('They caught you.');jail(v,ex)}}});
c.push({l:'Fight',s:'Win odds '+pc(fp)+'. Win and you keep your stock. Lose and you\u2019re jailed.',k:'danger',fn:function(){if(pick()<fp){hurt(10,'a fight with police');note('You fought your way free','You kept your stock but lost 10 health.')}else{S.hp-=20;say('You lost the fight.');jail(v,ex)}}});
c.push({l:'Give up',s:'Certain jail, but only about '+y1+' year'+(y1>1?'s':'')+'. A year less than losing.',fn:function(){say('You gave yourself up.');jail(v,ex-1)}});
c.push({l:'Bribe '+gbp(bribe),s:'Success odds '+pc(bp)+'. Fail and you\u2019re jailed.',d:S.cash<bribe,fn:function(){if(S.cash>=bribe&&pick()<bp){S.cash-=bribe;note('The bribe worked','You paid '+gbp(bribe)+' and walked away.')}else{say('The bribe was refused.');jail(v,ex)}}});
ask(title||'You\u2019re under arrest',(desc?desc+' ':'')+(v?'You\u2019re carrying about '+gbp(v)+' of stock, which means roughly '+days+' year'+(days>1?'s':'')+' inside.':'You\u2019re clean, so it should only be about a year in the cells.'),c)}

/**
 * SENTENCES the player. Time passes as a block of years.
 * STEPS:
 *  1. Sentence d = clamp(base + x + gun years, 1, 10).
 *  2. Convert this year's trading profit into XP (yearXp) before time jumps.
 *  3. Update lifetime arrest stats; list confiscated stock and its value.
 *  4. Confiscate ALL guns and ALL pocket stock/average prices (the safe is
 *     untouched: that is its purpose).
 *  5. For each year inside: pay property upkeep if affordable, otherwise the
 *     property is evicted (once; afterwards S.prop is null so the loop skips).
 *  6. Fast-forward the calendar: day += d (limited to DAYS+1 = life over),
 *     finish lab batches without moving them to pockets (finishBatches(false)),
 *     restore health to 100 and fed to 70, cool markets d years, new prices.
 *  7. Log and popup; if the calendar ran past the last year, show the death
 *     screen ("died of old age").
 * @param {number} v - Value of stock carried at arrest (for the sentence).
 * @param {number} x - Extra sentence years (can be -1 for "give up").
 * @returns {void}
 */
function jail(v,x){var gi=gunI(),gy=gunY(),d=clamp(jailDays(v)+x+gy,1,10);yearXp();stat().arr++;stat().jail+=d;var cash0=S.cash,lost=[],lv=0;GOODS.forEach(function(g){var n=S.inv[g.id];if(n){lost.push(n+' '+g.n);lv+=n*S.prices[g.id]}});S.guns=[];GOODS.forEach(function(g){S.inv[g.id]=0;S.paid[g.id]=0});
var evt='';for(var i=0;i<d;i++){if(S.prop){var pd=PROPS[S.prop.i];if(S.cash>=pd.up)S.cash-=pd.up;else{evt=evict(true)}}}
S.day=Math.min(S.day+d,DAYS+1);finishBatches(false);S.hp=100;S.food=70;coolMarkets(d);roll();var cl=cash0-S.cash,lt=(lost.length?'Confiscated: '+lost.join(', ')+' (about '+gbp(lv)+')':'You had no stock on you')+(cl>0?'. You also paid '+gbp(cl)+' in property upkeep while inside':'');say('Sentenced to '+d+' year'+(d>1?'s':'')+'. '+lt+'.');note('Sentenced to '+d+' year'+(d>1?'s':''),lt+(gi>=0?' and the '+GUNS[gi].n.toLowerCase()+' found on you added '+gy+' year'+(gy>1?'s':'')+' to the sentence':'')+'. You come out with full health and 70 fed.'+(evt?' '+evt:''));if(S.day>DAYS&&S.hp>0)S.view='over'}

/**
 * TRAVELS to another district.
 * FLOW: move + lose 10 fed -> new local prices -> jump to Trade tab -> log.
 * Then two dice rolls:
 *  1. POLICE: only if you carry stock AND heat is at least 5%. `pick()*100 < heat`
 *     turns the heat percentage into a probability (heat 20% = 20% chance).
 *     The police action tier is chosen from the heat band (see heatBand).
 *     If that opened a popup, stop here (so a mugging doesn't stack on top).
 *  2. MUGGER: flat 10% chance of a robbery popup taking 20-40% of cash.
 * Heat here is computed WITHOUT the bed/lab terms (heat() with no `full`)
 * because you're travelling, not sleeping.
 * @param {number} i - AREAS index to move to.
 * @returns {void}
 */
function travel(i){S.loc=i;S.food=clamp(S.food-10,0,100);roll();S.tab='trade';var a=AREAS[i];say('You made your way to '+a.n+'.');
var th=heat(),hit=carried()>0&&th>=5&&pick()*100<th;if(hit){runTier(heatBand(th));if(S.ev)return}
if(pick()<.1){robbery(rnd(.2,.4),'Mugger','Someone steps out of a doorway with a hand in their pocket.');return}
render()}


/* ============================================================================
 * ============================================================================
 * ======  SECTION 25: HEIRS, PROPERTY & EVICTION  ============================
 * ============================================================================
 * ========================================================================== */

/**
 * Creates the NEXT GENERATION after a death. Replaces S entirely.
 * INHERITANCE RULES:
 *  - Stock: take the most valuable drugs first (sort by current price,
 *    descending), half of each stack (rounded UP) until the heir's pockets
 *    (`left` = cap()) are full. Average prices travel with the stock.
 *  - Cash and bank: floor(half) of each.
 *  - Kept as-is: property, bag, XP/level, generation +1 etc., family surname,
 *    relatives (nextFam), life record appended to the family line.
 *  - Property safe stock: halved (rounded up) in place.
 *  - NOT carried over: guns (reset to none), bribes, market fatigue, casino
 *    plays, yearly profit tracker, lifetime stats (reset).
 * The heir starts at day 1 with 100 health and 70 fed, a new random name
 * (temporary until confirmHeir) and a face from heirLook(). View becomes
 * 'heirname'.
 * @param {string} sx - 'Son' or 'Daughter'.
 * @returns {void}
 */
function heir(sx){var st={},pd={},left=cap();GOODS.slice().sort(function(a,b){return S.prices[b.id]-S.prices[a.id]}).forEach(function(g){var n=Math.min(Math.ceil(S.inv[g.id]/2),left);st[g.id]=n;pd[g.id]=n?S.paid[g.id]:0;left-=n});
var c=Math.floor(S.cash/2),bk2=Math.floor(bk()/2);Q=[];S={day:1,gen:S.gen+1,bank:bk2,xp:S.xp||0,guns:[],bag:S.bag,name:pickName(sx==='Son'?'M':'F'),sn:S.sn,fam:nextFam(),line:(S.line||[]).concat([lifeRec()]),st:{sold:0,jail:0,arr:0,rob:0,peak:0},sex:sx,gender:sx==='Son'?'M':'F',look:heirLook(S.look,sx==='Son'?'M':'F'),cash:c,hp:100,food:70,loc:S.loc,inv:st,paid:pd,prop:S.prop,tab:'trade',view:'day',ev:null,log:[],prices:S.prices,flag:S.flag};
if(S.prop&&S.prop.safe)Object.keys(S.prop.safe).forEach(function(k){S.prop.safe[k]=Math.ceil(S.prop.safe[k]/2)});
say('They have their parent\u2019s '+KEPT.join(' and ').toLowerCase()+'.');say(S.name+' '+S.sn+', your '+sx.toLowerCase()+', takes over at 18 with '+gbp(c)+' and whatever stock they can carry.');S.view='heirname';S.n0=S.name;S.named=false;roll();render()}

/**
 * Where you sleep tonight, and its risks.
 * RULE: only if you own a property IN THE CURRENT DISTRICT do you sleep in it
 * (safe, no cold). Anywhere else you sleep rough (ROUGH).
 * @returns {{n:string,rob:number,arr:number,cold:number}} Bed description.
 */
function tonight(){var p=S.prop;if(p&&p.loc===S.loc){var d=PROPS[p.i];return {n:'your '+d.n.toLowerCase(),rob:d.rob,arr:d.arr,cold:0}}return ROUGH}

/**
 * Buys a property here (also used to trade UP from the current one).
 * TRADE-UP MATH: the old property is sold back at 80% FIRST so those funds
 * count toward the purchase; if you still can't afford it, that credit is
 * reversed and nothing changes. The safe (and its cost basis) moves with you;
 * the lab, equipment and batches are LEFT BEHIND (and lost) -- the UI warns
 * about this.
 * @param {number} i - PROPS index.
 * @returns {void}
 */
function buyProp(i){var d=PROPS[i];if(blocked(i))return;var old=S.prop;if(S.prop)S.cash+=Math.round(PROPS[S.prop.i].c*.8);if(S.cash<d.c){if(S.prop)S.cash-=Math.round(PROPS[S.prop.i].c*.8);return}S.cash-=d.c;S.prop={i:i,loc:S.loc};if(old&&old.safe){S.prop.safe=old.safe;S.prop.sp=old.sp}say('You bought a '+d.n.toLowerCase()+' in '+AREAS[S.loc].n+'.');render()}

/**
 * EVICTS the player (unpaid upkeep): everything in the safe, running lab
 * batches, and the lab itself are lost. Builds the message, clears S.prop,
 * logs it and returns the text so callers can also show it in a popup.
 * @param {boolean} [jl] - True if it happened while the player was in jail.
 * @returns {string} The eviction message.
 */
function evict(jl){var p=S.prop,d=PROPS[p.i],l=[],v=0,sf=p.safe||{},bt=p.batch||{},bl=[];GOODS.forEach(function(g){var n=sf[g.id]||0;if(n){l.push(n+' '+g.n);v+=n*S.prices[g.id]}});Object.keys(bt).forEach(function(k){if(bt[k].n>0)bl.push(bt[k].n+' '+gd(k).n)});
var t='You were evicted from your '+d.n.toLowerCase()+' in '+AREAS[p.loc].n+' for unpaid upkeep'+(jl?' while you were inside':'')+'. '+(l.length?'You lost everything in the safe: '+l.join(', ')+' (about '+gbp(v)+')':'The safe was empty')+(bl.length?', plus the batches cooking in your lab: '+bl.join(', '):'')+(p.lab?', and your lab and equipment':'')+'.';S.prop=null;say(t);return t}

/**
 * Sells the property for 80% of its price. Refused if it is the Hostel
 * (cannot be sold) or if the safe holds stock / a batch is running.
 * @returns {void}
 */
function sellProp(){var d=PROPS[S.prop.i];if(locked()||S.prop.i===0)return;S.cash+=Math.round(d.c*.8);S.prop=null;say('You sold the '+d.n.toLowerCase()+'.');render()}

/**
 * Whether the Buy button for property i must be disabled (rules beyond cash).
 * RULES: level too low -> blocked. If you already own one: upgrading
 * (i higher) is blocked while batches are running (they'd be lost); buying
 * anything else is blocked while the safe or lab is in use (locked()).
 * @param {number} i - PROPS index.
 * @returns {boolean}
 */
function blocked(i){return lvl()<PROPS[i].u||(!!S.prop&&(i>S.prop.i?pend()>0:locked()))}


/* ============================================================================
 * ============================================================================
 * ======  SECTION 26: THE YEAR TURN (CORE GAME LOOP)  ========================
 * ============================================================================
 * ========================================================================== */

/**
 * "Let the year pass" button. Pays property upkeep (or evicts if you can't),
 * then runs the night via sleep().
 * @returns {void}
 */
function endDay(){var p=S.prop;if(p){var d=PROPS[p.i];if(S.cash>=d.up){S.cash-=d.up;say('You paid '+gbp(d.up)+' in upkeep for your '+d.n.toLowerCase()+'.')}else{note('Evicted',evict())}}sleep(tonight())}

/**
 * RUNS ONE YEAR'S END. This is the main simulation step.
 * ORDER OF EVENTS:
 *  1. Burglary/robbery roll using the bed's `rob` chance (popup).
 *  2. Cold exposure (only when sleeping rough): 20% chance of losing b.cold health.
 *  3. Hunger: fed -30. At 0: health -15 (starvation). Otherwise, if fed is
 *     still 40+ AND you slept indoors (cold === 0), heal +10.
 *  4. Show one combined "Health lost" popup if anything hurt you.
 *  5. Calendar: day++. Police raid roll (skipped if a robbery just happened,
 *     so two bad things don't land in one turn).
 *  6. Lab batches finish (moved to pockets only when no popup is open).
 *  7. Markets cool one year, NEW PRICES, relatives do their jobs, yearly
 *     profit converts to XP (may level up).
 *  8. Log lines. DEATH CHECK: health <= 0 -> death screen; day past the last
 *     year -> death screen (old age). Then render.
 * @param {{n:string,rob:number,arr:number,cold:number}} b - Tonight's bed.
 * @returns {void}
 */
function sleep(b){var msgs=[],hl=[],bad=false;
if(pick()<b.rob){bad=true;robbery(rnd(.3,.6),'Robbed in the night',b.cold?'Someone found you sleeping rough and went through your things.':'Someone broke into your place while you slept.')}

if(b.cold&&pick()<.2){hurt(b.cold,'exposure to the cold');hl.push([b.cold,'the cold']);msgs.push('The cold got into your bones.')}
S.food-=30;if(S.food<=0){S.food=0;hurt(15,'starvation');hl.push([15,'starvation']);msgs.push('Starving. Health took a hit.')}else if(S.food>=40&&b.cold===0){S.hp=clamp(S.hp+10,0,100)}
if(hl.length){var tot=hl.reduce(function(t,x){return t+x[0]},0);note('Health lost','You lost '+tot+' health this year: '+hl.map(function(x){return x[0]+' from '+x[1]}).join(' and ')+'. You\u2019re on '+Math.max(0,Math.round(S.hp))+'.')}
S.day++;raid(bad);finishBatches(!S.ev);S.view='day';coolMarkets(1);roll();crewYear();yearXp();
msgs.forEach(function(m){if(m)say(m)});if(!msgs.filter(Boolean).length)say('A quiet year. Nothing went wrong.');
if(S.hp<=0){S.hp=0;S.view='over'}else if(S.day>DAYS){S.view='over'}
render()}


/* ============================================================================
 * ============================================================================
 * ======  SECTION 27: POLICE HEAT & RAIDS  ===================================
 * ============================================================================
 * ========================================================================== */

/**
 * Converts a heat percentage into a police-action TIER 0..5.
 * Thresholds: <5 nothing, <16 stop & search, <31 pulled over, <56 sting,
 * <90 police raid, otherwise FBI raid.
 * @param {number} h - Heat percent.
 * @returns {number} Tier 0..5.
 */
function heatBand(h){return h<5?0:h<16?1:h<31?2:h<56?3:h<90?4:5}

/**
 * HEAT = the chance (in %) police act against you this year. Components:
 *   stock : if carrying anything: 4 + 10 * (carried/capacity)
 *           + min(20, stockValue/2000). So a baseline 4, up to +10 for full
 *           pockets, up to +20 when carrying £40,000+ of stock.
 *   bed   : (only when `full`) tonight's arrest chance as a percent
 *           (arr*100), x1.6 if carrying stock, x0.3 if clean. Sleeping rough
 *           (arr=0.16) is therefore far worse than a Safehouse.
 *   cook  : (only when `full`, with a lab) k = number of drugs cooking.
 *           Heat term = (2k + k*(k-1)) * 1.5 = k*(k+1)*1.5, which grows
 *           faster than linearly (1 drug = 3, 2 = 9, 3 = 18, 5 = 45), scaled
 *           by the LAB's district heat (not where you're standing).
 *   Combine: ((stock + bed) * districtHeat + cook) * (1 - bribeCut).
 *   Then clamp to 1..100 and round to one decimal (x10, round, /10).
 * @param {number} [k] - Hypothetical number of drugs cooking (default: actual).
 * @param {boolean} [full] - Include the sleeping and lab terms.
 * @returns {number} Heat percent 1..100.
 */
function heat(k,full){var cut=S.bribe?PROT[S.bribe.l].cut:0,hl=AREAS[S.loc].heat,c=carried(),stock=c>0?4+10*c/cap()+Math.min(20,worth()/2000):0,bed=0,cook=0;
if(full){bed=tonight().arr*100*(c>0?1.6:.3);if(S.prop&&S.prop.lab){if(k===undefined)k=cooks();cook=(2*k+k*(k-1))*1.5*AREAS[S.prop.loc].heat}}
return Math.round(Math.max(1,Math.min(100,((stock+bed)*hl+cook)*(1-cut)))*10)/10}

/**
 * Heat including bed and lab, optionally for a hypothetical cook count
 * (the Lab tab uses this to preview "one more drug would make it X%").
 * @param {number} [k] - Hypothetical drugs cooking.
 * @returns {number} Heat percent.
 */
function raidPct(k){return heat(k,true)}

/**
 * TIER 1: stop and search. Clean = nothing happens. Otherwise police take
 * ceil(30%) of every drug stack and fine 3% of pocket cash.
 * @returns {void}
 */
function searched(){var c=carried();if(c<1){say('Police stopped and searched you. You were clean.');return}
var fine=Math.round(S.cash*.03),tk=[];GOODS.forEach(function(g){var t=Math.ceil(S.inv[g.id]*.3);if(t>0)tk.push(t+' '+g.n);S.inv[g.id]-=t;if(!S.inv[g.id])S.paid[g.id]=0});S.cash-=fine;say('Stopped and searched. They took '+tk.join(', ')+' and fined you '+gbp(fine)+'.');note('Stopped and searched','They took '+tk.join(', ')+' and fined you '+gbp(fine)+'.')}

/**
 * TIER 2: pulled over. Clean = waved on. Carrying stock = arrest popup
 * (with Run available).
 * @returns {void}
 */
function stopped(){if(carried()<1){say('Pulled over and searched. They found nothing and moved you on.');return}arrest(false,0,'Pulled over','Officers stop you and want to search your things.')}

/**
 * Seizes every RUNNING lab batch (batches already finished and "waiting"
 * for room are not touched).
 * @returns {number} How many batches were seized.
 */
function seize(){var p=S.prop,n=0;if(p&&p.batch)Object.keys(p.batch).forEach(function(id){if(!p.batch[id].w){delete p.batch[id];n++}});return n}

/**
 * Dispatches a heat tier to its police action.
 * @param {number} t - Tier 1..5 (0 does nothing).
 * @returns {void}
 */
function runTier(t){if(t===1)searched();else if(t===2)stopped();else if(t===3)sting();else if(t===4)policeRaid();else if(t>=5)fbi()}

/**
 * TIER 3: undercover sting. A "buyer" is a cop; arrest only if you carry stock.
 * @returns {void}
 */
function sting(){if(carried()<1){say('A buyer turned out to be an undercover officer, but you had nothing on you.');return}say('Undercover sting! The “buyer” was a police officer.');arrest()}

/**
 * TIER 4: police raid. Seizes running batches. You are arrested (NO running)
 * if you carry stock OR you are standing at your lab's property.
 * @returns {void}
 */
function policeRaid(){var n=seize(),p=S.prop;note('Police raid!',(n?'They seized '+n+' running batch'+(n>1?'es':'')+'.':'They searched the place and found nothing running.'));if(carried()>0||(n&&p&&S.loc===p.loc))arrest(true)}

/**
 * TIER 5: FBI raid. Seizes batches, DESTROYS the lab and equipment, fines
 * 25% of cash, and arrests you with +3 extra years and no escape.
 * @returns {void}
 */
function fbi(){var n=seize(),p=S.prop,fine=Math.round(S.cash*.25),lab=p&&p.lab;S.cash-=fine;if(p){p.lab=false;p.eq={}}
note('FBI raid!',(n?'They seized '+n+' batch'+(n>1?'es':'')+', ':'')+(lab?'wrecked your lab and equipment, ':'')+'and fined you '+gbp(fine)+'.');arrest(true,3)}

/**
 * Yearly police check (run in sleep()). Rolls once against the full heat
 * (bed and lab included); a hit fires that heat band's action. Then ticks
 * down any active bribe by one year and removes it when it expires.
 * @param {boolean} skip - True to skip the police roll (a robbery already happened).
 * @returns {void}
 */
function raid(skip){var h=heat(undefined,true);if(!skip&&h>=5&&pick()*100<h)runTier(heatBand(h));
if(S.bribe){S.bribe.y--;if(S.bribe.y<=0){S.bribe=null;say('Your police protection has run out.')}}}


/* ============================================================================
 * ============================================================================
 * ======  SECTION 28: POLICE BRIBES  =========================================
 * ============================================================================
 * ========================================================================== */

/**
 * Builds the Police bribes card. A tier is disabled if you can't afford it,
 * its level isn't unlocked, or you already hold a STRONGER one (b.l > i).
 * @returns {string} HTML.
 */
function bribeView(){var b=S.bribe;return '<div class="card"><h2>Police bribes</h2><p class="log">'+(b?'Protected by '+PROT[b.l].n.toLowerCase()+' for '+b.y+' more year'+(b.y>1?'s':'')+'.':'No protection. A bribe lowers your heat for a few years, so fewer stops, arrests and raids.')+'</p>'+PROT.map(function(x,i){var off=S.cash<x.c||(b&&b.l>i)||lvl()<x.u?' disabled':'';return '<div class="row"><div class="nm"><b>'+x.n+' · '+gbp(x.c)+'</b><small>'+(lvl()<x.u?'Unlocks at level '+x.u:(x.cut>=1?'No police trouble':'Heat down '+Math.round(x.cut*100)+'%')+' for '+x.y+' years')+'</small></div><button onclick="bribe('+i+')"'+off+'>Pay</button></div>'}).join('')+'</div>'}

/**
 * Pays a bribe: replaces any weaker (or equal) protection and sets its
 * duration in years. Guards repeat the button's disabled rules.
 * @param {number} i - PROT index.
 * @returns {void}
 */
function bribe(i){var x=PROT[i];if(S.cash<x.c||lvl()<x.u||(S.bribe&&S.bribe.l>i))return;S.cash-=x.c;S.bribe={l:i,y:x.y};say('You paid off the '+x.n.toLowerCase()+'. Protection for '+x.y+' years.');render()}


/* ============================================================================
 * ============================================================================
 * ======  SECTION 29: SAFE STORAGE & SPACE ACCOUNTING  =======================
 * ============================================================================
 * ========================================================================== */
/* The property's safe is S.prop.safe = {drugId: units}; S.prop.sp holds the
 * AVERAGE COST per unit of the safe stock (for profit tracking). Stock in the
 * safe cannot be mugged, seized, fined or confiscated. */

/** Safe capacity of the owned property (SLOTS table). @returns {number} */
function safeCap(){return SLOTS[S.prop.i]}

/** Units currently in the safe. @returns {number} */
function safeCount(){var s=S.prop.safe||{};return GOODS.reduce(function(t,g){return t+(s[g.id]||0)},0)}

/** Street value of the safe stock at local prices (counts toward net worth). @returns {number} */
function safeWorth(){var s=(S.prop&&S.prop.safe)||{};return GOODS.reduce(function(t,g){return t+(s[g.id]||0)*S.prices[g.id]},0)}

/** Units in lab batches still running or waiting. @returns {number} */
function pend(){var b=S.prop.batch||{};return Object.keys(b).reduce(function(t,k){return t+b[k].n},0)}

/**
 * FREE SPACE for new production: pocket space + safe space, minus what
 * running batches will need when they finish.
 * @returns {number} Units (never below 0).
 */
function room(){return Math.max(0,cap()-carried()+safeCap()-safeCount()-pend())}

/**
 * True if the property holds stock or running batches (so it cannot be
 * sold/downgraded without losing them).
 * @returns {boolean}
 */
function locked(){return !!S.prop&&(safeCount()>0||pend()>0)}

/**
 * Number of drugs currently being cooked (not waiting for space).
 * Feeds the cook term of the heat formula.
 * @returns {number}
 */
function cooks(){var b=(S.prop&&S.prop.batch)||{};return Object.keys(b).filter(function(k){return !b[k].w}).length}

/**
 * COMPLETES lab batches at the year turn.
 * ORDER: crew batches (flag c) first, then the player's, by sorting on the
 * flag (c?1:0 descending). Each batch's output goes to:
 *   1. the SAFE first (up to free safe space),
 *   2. then POCKETS (only if `home` is true),
 *   3. anything left stays at the lab flagged `w` (waiting for room) and a
 *      popup tells the player once; it can be collected later.
 * COST BASIS: each addition updates the stock's average unit cost with a
 * weighted average: newAvg = (oldAvg*oldQty + batchUnitCost*addedQty) / (oldQty+addedQty).
 * @param {boolean} home - True if finished stock may be placed in pockets.
 * @returns {void}
 */
function finishBatches(home){var p=S.prop;if(!p||!p.batch)return;var sf=p.safe=p.safe||{},sp=p.sp=p.sp||{};
Object.keys(p.batch).sort(function(a,c){return (p.batch[c].c?1:0)-(p.batch[a].c?1:0)}).forEach(function(id){var b=p.batch[id],g=gd(id),m=Math.min(b.n,safeCap()-safeCount());
if(m>0){var q=sf[id]||0;sp[id]=((sp[id]||0)*q+b.u*m)/(q+m);sf[id]=q+m;b.n-=m;say(m+' '+g.n+' finished cooking and went into the safe.')}
if(b.n>0&&home){var k=Math.min(b.n,cap()-carried());if(k>0){var pq=S.inv[id];S.paid[id]=(S.paid[id]*pq+b.u*k)/(pq+k);S.inv[id]+=k;b.n-=k;say(k+' '+g.n+' finished cooking and went into your pockets.')}}
if(b.n>0){if(!b.w)note('Batch waiting for room',b.n+' '+g.n+' are waiting at the lab because there\u2019s no room for them.');b.w=1}else delete p.batch[id]})}

/**
 * DEPOSITS stock from pockets into the safe (weighted-average cost basis).
 * Moves min(requested, held, free safe space) units.
 * @param {string} id - Drug id.
 * @param {number} n - Units (99999 = "max").
 * @returns {void}
 */
function dep(id,n){var p=S.prop,sf=p.safe=p.safe||{},sp=p.sp=p.sp||{},m=Math.min(n,S.inv[id],safeCap()-safeCount());if(m<1)return;var q=sf[id]||0;sp[id]=((sp[id]||0)*q+S.paid[id]*m)/(q+m);sf[id]=q+m;S.inv[id]-=m;if(!S.inv[id])S.paid[id]=0;say('Put '+m+' '+gd(id).n+' in the safe.');render()}

/**
 * WITHDRAWS stock from the safe into pockets (weighted-average cost basis).
 * Moves min(requested, in safe, free pocket space) units.
 * @param {string} id - Drug id.
 * @param {number} n - Units (99999 = "max").
 * @returns {void}
 */
function wd(id,n){var p=S.prop,sf=p.safe=p.safe||{},sp=p.sp=p.sp||{},m=Math.min(n,sf[id]||0,cap()-carried());if(m<1)return;var q=S.inv[id];S.paid[id]=(S.paid[id]*q+(sp[id]||0)*m)/(q+m);S.inv[id]+=m;sf[id]-=m;if(!sf[id])sp[id]=0;say('Took '+m+' '+gd(id).n+' out of the safe.');render()}

/**
 * COLLECTS a finished batch that was "waiting for room": fills the safe
 * first, then pockets, with as much as fits. If nothing fits, does nothing.
 * Deletes the batch when empty.
 * @param {string} id - Drug id.
 * @returns {void}
 */
function collect(id){var p=S.prop,b=p&&p.batch&&p.batch[id];if(!b||!b.w)return;var g=gd(id),sf=p.safe=p.safe||{},sp=p.sp=p.sp||{},t=0,m=Math.min(b.n,Math.max(0,safeCap()-safeCount()));
if(m>0){var q=sf[id]||0;sp[id]=((sp[id]||0)*q+b.u*m)/(q+m);sf[id]=q+m;b.n-=m;t+=m}
var k=Math.min(b.n,Math.max(0,cap()-carried()));if(k>0){var pq=S.inv[id];S.paid[id]=(S.paid[id]*pq+b.u*k)/(pq+k);S.inv[id]+=k;b.n-=k;t+=k}
if(t<1)return;say('Collected '+t+' '+g.n+' from the lab.');if(b.n<=0)delete p.batch[id];render()}

/**
 * Builds the Safe card (only when you are in the property's district):
 * per drug "in safe / in pockets" and In 1 / In max / Out 1 / Out max buttons,
 * each disabled when it couldn't move anything.
 * @returns {string} HTML ('' if no property here).
 */
function safeView(){var p=S.prop;if(!p||p.loc!==S.loc)return '';var sf=p.safe||{},sc=safeCap(),n=safeCount();
return '<div class="card"><h2>Safe</h2><p class="log">Safe from muggings, raids and jail. Holds '+n+' of '+sc+'.</p>'+ug().map(function(g){var q=sf[g.id]||0,pk=S.inv[g.id],bi=pk&&n<sc?'':' disabled',bo=q&&carried()<cap()?'':' disabled',a='<button style="flex:1" onclick="';return '<div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><b>'+g.n+'</b><small>In safe '+q+' · in pockets '+pk+'</small></div><div class="btns" style="flex:1 1 100%">'+a+'dep(\''+g.id+'\',1)"'+bi+'>In 1</button>'+a+'dep(\''+g.id+'\',99999)"'+bi+'>In max</button>'+a+'wd(\''+g.id+'\',1)"'+bo+'>Out 1</button>'+a+'wd(\''+g.id+'\',99999)"'+bo+'>Out max</button></div></div>'}).join('')+'</div>'}


/* ============================================================================
 * ============================================================================
 * ======  SECTION 30: LAB (COOKING DRUGS)  ===================================
 * ============================================================================
 * ========================================================================== */

/**
 * Ingredient cost per unit: a FIXED price, identical every year.
 * MATH: cost = round(g.lo * (1 - LABDISC)). g.lo is the drug's lowest
 * standard list price (the bottom of its GOODS range), so it ignores district
 * bias, market fatigue and the random "cheap"/"spike" events. Example: Weed
 * lo = 15 -> 15 * 0.9 = 13.5 -> rounds to £14. Because the price never reads
 * S.prices, the player and the crew pay the same amount every batch (the crew
 * adds its 15% fee on top in crewYear). Minimum £1, whole number.
 * @param {Object} g - A GOODS entry.
 * @returns {number} Pounds per unit.
 */
function ing(g){return Math.max(1,Math.round(g.lo*(1-LABDISC)))}

/**
 * Finds a GOODS entry by id.
 * @param {string} id - Drug id.
 * @returns {Object|undefined} The entry.
 */
function gd(id){return GOODS.filter(function(x){return x.id===id})[0]}

/** Builds a lab in the current property (costs LAB). @returns {void} */
function buildLab(){S.cash-=LAB;S.prop.lab=true;S.prop.eq=S.prop.eq||{};say('You built a lab in your '+PROPS[S.prop.i].n.toLowerCase()+'.');render()}

/**
 * Buys the equipment for one drug (price g.eq). Permanent until the lab is lost.
 * @param {string} id - Drug id.
 * @returns {void}
 */
function buyEq(id){var g=gd(id);S.cash-=g.eq;(S.prop.eq=S.prop.eq||{})[id]=1;say('You bought the '+g.n+' equipment.');render()}

/**
 * Starts a cooking batch (ready next year). One batch per drug at a time.
 * QUANTITY: m = min(requested, free room, units you can afford). If that is
 * less than asked (and the ask wasn't the "Max" 9999), a popup explains
 * which limit applied: room if room < affordable, otherwise cash.
 * Money spent counts as "money out" for the yearly XP profit.
 * @param {string} id - Drug id.
 * @param {number} n - Units requested (9999 = Max).
 * @returns {void}
 */
function cook(id,n){var g=gd(id),u=ing(g),p=S.prop,b=p.batch=p.batch||{};if(b[id])return;var r=room(),af=Math.floor(S.cash/u),m=Math.min(n,r,af);
if(m<1){note('Can\u2019t cook '+g.n,r<1?'There\u2019s no space left in your safe or pockets.':'You can\u2019t afford the ingredients ('+gbp(u)+' each).');return}
if(m<n&&n<9999)note('Smaller batch than asked','You asked for '+n+' '+g.n+' but only '+m+' were started: '+(r<af?'there\u2019s only room for '+r+' (safe and pockets, minus running batches).':'you can only afford ingredients for '+af+'.'));
S.cash-=u*m;yp().o+=u*m;b[id]={n:m,u:u};say('Started cooking '+m+' '+g.n+' for '+gbp(u*m)+'. It will be ready next year.');render()}

/**
 * Builds the Lab tab. STATES: no property -> hint; property elsewhere ->
 * travel hint; no lab -> Build button; lab present -> per-drug rows that are
 * either "buy equipment", "cook 1/10/max", or the status of a running /
 * waiting batch (with a Collect button sized to the free space `cf`).
 * The header previews heat now and (if under 5 drugs cooking) what ONE MORE
 * cooking drug would raise it to, via raidPct(cooks()+1).
 * @returns {string} HTML.
 */
function labView(){var p=S.prop,c='<div class="card"><h2>Lab</h2>';
if(!p)return c+'<p class="lead">You need a property first. Buy one in the Home tab, then build a lab there.</p></div>';
if(p.loc!==S.loc)return c+'<p class="lead">Your lab is at your '+PROPS[p.i].n.toLowerCase()+' in '+AREAS[p.loc].n+'. Travel there to cook.</p></div>';
if(!p.lab)return c+'<p class="lead">Your '+PROPS[p.i].n.toLowerCase()+' has no lab yet. Selling or trading up the property loses the lab and its equipment.</p><button class="main full" onclick="buildLab()" '+(S.cash<LAB?'disabled':'')+'>Build lab · '+gbp(LAB)+'</button></div>';
var eq=p.eq||{},free=room(),bt=p.batch||{},cf=Math.max(0,safeCap()-safeCount())+Math.max(0,cap()-carried());
return c+'<p class="log">One batch of each drug at a time, ready next year. Ingredients always cost the same: 10% below the lowest normal price of that drug, whatever the market is doing. Space for '+free+' more. Heat is '+raidPct()+'%'+(cooks()<5?'; one more drug cooking would make it '+raidPct(cooks()+1)+'%':'')+'.</p>'+ug().map(function(g){var u=ing(g),has=eq[g.id],m=Math.min(free,Math.floor(S.cash/u)),off=m<1?'disabled':'',b=bt[g.id];return '<div class="row"><div class="nm"><b>'+g.n+'</b><small>'+(has?'Ingredients '+gbp(u)+' each · market '+gbp(S.prices[g.id]):'Equipment '+gbp(g.eq))+'</small></div>'+(has&&b?'<div style="text-align:right"><small>'+(b.w?b.n+' waiting for room':'Cooking '+b.n+', ready next year')+'</small>'+(b.w?'<button class="mini" style="display:block;margin:4px 0 0 auto" onclick="collect(\''+g.id+'\')"'+(cf<1?' disabled':'')+'>Collect '+Math.min(b.n,cf)+'</button>':'')+'</div>':has?'<div class="btns"><button onclick="cook(\''+g.id+'\',1)" '+off+'>Cook 1</button><button onclick="cook(\''+g.id+'\',10)" '+off+'>Cook 10</button><button onclick="cook(\''+g.id+'\',9999)" '+off+'>Max '+m+'</button></div>':'<button onclick="buyEq(\''+g.id+'\')" '+(S.cash<g.eq?'disabled':'')+'>Buy</button>')+'</div>'}).join('')+'</div>'}


/* ============================================================================
 * ============================================================================
 * ======  SECTION 31: BANK  ==================================================
 * ============================================================================
 * ========================================================================== */
/* Bank money (S.bank) is immune to robbery, raids and fines, counts toward
 * net worth, and half of it passes to the heir. */

/** Current bank balance (0 for old saves without the field). @returns {number} */
function bk(){return S.bank||0}

/**
 * Deposits cash. Amount is limited to whole pounds you actually hold, so
 * "All" can pass a huge number (1e15) safely.
 * @param {number} n - Pounds requested.
 * @returns {void}
 */
function bankIn(n){var m=Math.min(n,Math.floor(S.cash));if(m<1)return;S.cash-=m;S.bank=bk()+m;say('Deposited '+gbp(m)+' in the bank.');render()}

/**
 * Withdraws cash, limited to the balance.
 * @param {number} n - Pounds requested.
 * @returns {void}
 */
function bankOut(n){var m=Math.min(n,bk());if(m<1)return;S.bank=bk()-m;S.cash+=m;say('Withdrew '+gbp(m)+' from the bank.');render()}

/**
 * Builds the Bank card with Deposit and Withdraw button rows (£100, £1k,
 * £10k, All). A button is disabled when the source (cash or balance) is
 * below that amount. `a` is a small helper that renders one button.
 * @returns {string} HTML.
 */
function bankView(){var b=bk(),a=function(f,n,l,off){return '<button style="flex:1" onclick="'+f+'('+n+')"'+(off?' disabled':'')+'>'+l+'</button>'};
return '<div class="card"><h2>Bank</h2><p class="log">Balance '+gbp(b)+'. Money in the bank can\u2019t be robbed, seized or fined. Only the cash in your pocket is at risk. Your heir inherits half the balance.</p><div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><small>Deposit</small></div><div class="btns" style="flex:1 1 100%">'+a('bankIn',100,'\u00a3100',S.cash<100)+a('bankIn',1000,'\u00a31k',S.cash<1000)+a('bankIn',10000,'\u00a310k',S.cash<10000)+a('bankIn',1e15,'All',S.cash<1)+'</div></div><div class="row" style="flex-wrap:wrap"><div class="nm" style="flex:1 1 100%"><small>Withdraw</small></div><div class="btns" style="flex:1 1 100%">'+a('bankOut',100,'\u00a3100',b<100)+a('bankOut',1000,'\u00a31k',b<1000)+a('bankOut',10000,'\u00a310k',b<10000)+a('bankOut',1e15,'All',b<1)+'</div></div></div>'}

/* ===================== END OF PART 4 ===================== */

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
var CASINO_LIMIT=3;

/** Selectable bet sizes in pounds (shown as £10, £100, £1k, £10k, £100k, £1m). */
var CBETS=[10,100,1000,10000,100000,1000000];

/** CANIM : true while a slot/roulette animation is running (locks the UI).
 *  RROT  : the roulette wheel's current angle (0..359), remembered so the
 *          next spin continues from where the wheel stopped. */
var CANIM=false,RROT=0;

/** SLOT SYMBOLS, from rarest to commonest.
 *  e : emoji.   w : weight (higher = appears more often).
 *  p : payout multiplier for THREE matching symbols (x bet).
 *  q : payout multiplier for any TWO matching symbols (x bet).
 *  The police car is the "bust" symbol: it never pays. */
var SLS=[{e:'\uD83D\uDCB0',w:1,p:500,q:14},{e:'\uD83D\uDC8E',w:2,p:100,q:5},{e:'\uD83C\uDFE0',w:3,p:40,q:3.5},{e:'\uD83D\uDCB5',w:5,p:20,q:2.5},{e:'\uD83D\uDD2B',w:6,p:10,q:1.5},{e:'\uD83D\uDD2A',w:7,p:6,q:1},{e:'\uD83D\uDE94',w:8,p:0,q:0}];

/** ROULETTE DATA.
 *  RWH  : the 37 pockets in their real clockwise wheel order, starting at 0.
 *  RRED : which numbers are red (every other number not 0 is black).
 *  RN   : display names for outside-bet codes. */
var RWH=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26],RRED=[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
var RN={r:'Red',b:'Black',o:'Odd',e:'Even',lo:'1 to 18',hi:'19 to 36',d1:'1st dozen (1-12)',d2:'2nd dozen (13-24)',d3:'3rd dozen (25-36)'};


/* ---------------------- shared casino helpers ---------------------- */

/**
 * Plays used in the CURRENT year. S.cas = {d: yearNumber, n: plays}. If the
 * stored year differs from today's, the counter has implicitly reset to 0.
 * @returns {number}
 */
function casUsed(){var c=S.cas;return c&&c.d===S.day?c.n:0}

/** Plays still available this year. @returns {number} (never negative) */
function casLeft(){return Math.max(0,CASINO_LIMIT-casUsed())}

/** Spends one play (stamps the current year). @returns {void} */
function casUse(){S.cas={d:S.day,n:casUsed()+1}}

/** Current bet size (default £100). @returns {number} */
function casBet(){return S.cbet||100}

/** Changes the bet size; ignored while a game is in progress. @param {number} v - Pounds. @returns {void} */
function setCbet(v){if(casBusy())return;S.cbet=v;render()}

/**
 * True while the player must not change settings or leave a game:
 * an animation is running, a blackjack hand is unfinished, or a slot /
 * roulette result is still waiting to be paid.
 * @returns {boolean}
 */
function casBusy(){return CANIM||!!(S.bj&&!S.bj.done)||!!S.sl||!!S.rl}

/** Switches the casino game tab ('bj' | 'sl' | 'rl') unless busy. @param {string} g @returns {void} */
function casGame(g){if(casBusy())return;S.cg=g;render()}

/**
 * Settles any slot/roulette game left pending (e.g. the page was reloaded
 * mid-spin). Passing true tells the end functions NOT to re-render (we are
 * already inside a render).
 * @returns {void}
 */
function casResolve(){if(S.sl&&!CANIM)slEnd(true);if(S.rl&&!CANIM)rlEnd(true)}


/* ======================== BLACKJACK ======================== */
/* A card is an integer 0..51: rank = n % 13 (0 = Ace, 1..8 = 2..9,
 * 9 = 10, 10 = J, 11 = Q, 12 = K), suit = floor(n / 13). */

/** Rank label. @param {number} n - Card 0..51. @returns {string} 'A','2'..'10','J','Q','K'. */
function cRank(n){return ['A','2','3','4','5','6','7','8','9','10','J','Q','K'][n%13]}

/** Suit symbol (spade, heart, diamond, club). @param {number} n - Card. @returns {string} */
function cSuit(n){return ['\u2660','\u2665','\u2666','\u2663'][Math.floor(n/13)]}

/**
 * Blackjack value of one card. Ace = 11 here (demoted later by hv),
 * J/Q/K (ranks 10..12) = 10, others = rank + 1.
 * @param {number} n - Card.
 * @returns {number}
 */
function cVal(n){var r=n%13;return r===0?11:r>9?10:r+1}

/**
 * Hand value with the standard ace rule: count every ace as 11, then while
 * the total is over 21 turn one ace into a 1 (subtract 10). This makes the
 * hand as high as possible without busting.
 * @param {number[]} h - Cards.
 * @returns {number}
 */
function hv(h){var t=0,a=0;h.forEach(function(n){t+=cVal(n);if(n%13===0)a++});while(t>21&&a>0){t-=10;a--}return t}

/**
 * Is the hand "soft" (contains an ace still counting as 11)?
 * LOGIC: total with ALL aces as 1; if there is an ace and adding 10 still
 * fits within 21, one ace is being counted as 11.
 * @param {number[]} h - Cards.
 * @returns {boolean}
 */
function hsoft(h){var t=0,a=0;h.forEach(function(n){t+=n%13===0?1:cVal(n);if(n%13===0)a++});return a>0&&t+10<=21}

/**
 * HTML for one card (red for hearts/diamonds, i.e. suit index 1 or 2),
 * or a face-down card back.
 * @param {number} n - Card.
 * @param {boolean} [hide] - True to show the back.
 * @returns {string}
 */
function cardH(n,hide){if(hide)return '<span class="pc back" aria-label="Hidden card"></span>';var s=Math.floor(n/13);return '<span class="pc'+(s===1||s===2?' rd':'')+'"><b>'+cRank(n)+'</b><i>'+cSuit(n)+'</i></span>'}

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
function bjDeal(){if(casLeft()<1||casBusy())return;var b=casBet();if(S.cash<b)return;S.cash-=b;casUse();var d=[],i,j,t;for(i=0;i<52;i++)d.push(i);for(i=51;i>0;i--){j=Math.floor(Math.random()*(i+1));t=d[i];d[i]=d[j];d[j]=t}
S.bj={bet:b,p:[d.pop(),d.pop()],d:[d.pop(),d.pop()],k:d,done:false,msg:''};if(hv(S.bj.p)===21||hv(S.bj.d)===21)bjEnd();else render()}

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
function bjEnd(){var g=S.bj,p=hv(g.p),nat=g.p.length===2&&p===21,dn=g.d.length===2&&hv(g.d)===21;
if(p<=21&&!nat&&!dn)while(hv(g.d)<17)g.d.push(g.k.pop());
var d=hv(g.d),pay=0,m;
if(p>21)m='Bust. You lose '+gbp(g.bet)+'.';
else if(nat&&dn){pay=g.bet;m='Both have blackjack. Push, bet returned.'}
else if(nat){pay=Math.round(g.bet*2.5);m='Blackjack! You win '+gbp(pay-g.bet)+'.'}
else if(dn)m='Dealer has blackjack. You lose '+gbp(g.bet)+'.';
else if(d>21){pay=g.bet*2;m='Dealer busts. You win '+gbp(g.bet)+'.'}
else if(p>d){pay=g.bet*2;m='You win '+gbp(g.bet)+'.'}
else if(p===d){pay=g.bet;m='Push. Bet returned.'}
else m='Dealer wins. You lose '+gbp(g.bet)+'.';
S.cash+=pay;g.done=true;g.msg=m;say('Blackjack: '+m);render()}

/** Player takes a card; at 21 or more the hand ends automatically. @returns {void} */
function bjHit(){var g=S.bj;if(!g||g.done)return;g.p.push(g.k.pop());if(hv(g.p)>=21)bjEnd();else render()}

/** Player stands: dealer plays and the hand is settled. @returns {void} */
function bjStand(){var g=S.bj;if(!g||g.done)return;bjEnd()}

/**
 * Double down: only on the first two cards and if you can afford a second
 * stake. Takes the extra stake, doubles the bet, deals EXACTLY ONE more card
 * and ends the hand.
 * @returns {void}
 */
function bjDouble(){var g=S.bj;if(!g||g.done||g.p.length!==2||S.cash<g.bet)return;S.cash-=g.bet;g.bet*=2;g.p.push(g.k.pop());bjEnd()}

/**
 * Builds the Blackjack card. While the hand is live the dealer's second card
 * is hidden (hid && index 1) and only the first card's value is shown; the
 * action buttons are Hit / Stand / Double. When finished it shows the result
 * and a "Deal again" button.
 * @returns {string} HTML.
 */
function bjView(){var j=S.bj,left=casLeft(),b=casBet(),c='<div class="card"><h2>Blackjack</h2><p class="log">Get closer to 21 than the dealer without going over. Dealer stands on 17. Blackjack pays 3 to 2. You can double down on your first two cards.</p>';
if(!j)return c+'<button class="main full" onclick="bjDeal()"'+(left<1||S.cash<b?' disabled':'')+'>Deal \u00b7 bet '+gbp(b)+'</button>'+(left<1?'<p class="log">No plays left this year.</p>':S.cash<b?'<p class="log">Not enough cash for that bet.</p>':'')+'</div>';
var hid=!j.done;
c+='<p class="lead"><b>Dealer</b> \u00b7 '+(hid?'showing '+cVal(j.d[0]):hv(j.d))+'</p><div class="hand">'+j.d.map(function(n,i){return cardH(n,hid&&i===1)}).join('')+'</div>';
c+='<p class="lead"><b>You</b> \u00b7 '+hv(j.p)+(hsoft(j.p)&&hv(j.p)<21?' (soft)':'')+' \u00b7 bet '+gbp(j.bet)+'</p><div class="hand">'+j.p.map(function(n){return cardH(n)}).join('')+'</div>';
if(hid)c+='<div class="btns"><button class="buy" style="flex:1" onclick="bjHit()">Hit</button><button class="sell" style="flex:1" onclick="bjStand()">Stand</button><button style="flex:1" onclick="bjDouble()"'+(j.p.length!==2||S.cash<j.bet?' disabled':'')+'>Double</button></div>';
else c+='<p class="lead"><b>'+j.msg+'</b></p><button class="main full" onclick="bjDeal()"'+(left<1||S.cash<b?' disabled':'')+'>'+(left<1?'No plays left this year':'Deal again \u00b7 bet '+gbp(b))+'</button>';
return c+'</div>'}


/* ============================ SLOTS ============================ */

/**
 * Picks one reel symbol with WEIGHTED randomness.
 * MATH: total = sum of weights. Draw r in [0,total). Walk the symbols
 * subtracting each weight; the first time r goes below zero, that symbol is
 * the winner. A symbol with weight 8 is therefore chosen 8 times as often as
 * one with weight 1. (The last line is a safety net for rounding.)
 * @returns {number} Index into SLS.
 */
function slPick(){var t=0,i;SLS.forEach(function(s){t+=s.w});var r=Math.random()*t;for(i=0;i<SLS.length;i++){r-=SLS[i].w;if(r<0)return i}return SLS.length-1}

/**
 * Payout multiplier for three reels r = [a,b,c] (symbol indexes).
 * Three equal -> the symbol's `p`; otherwise any equal pair
 * (reels 1&2, 1&3 or 2&3) -> that symbol's `q`; otherwise 0.
 * @param {number[]} r - Three symbol indexes.
 * @returns {number} Multiplier of the bet.
 */
function slMult(r){if(r[0]===r[1]&&r[1]===r[2])return SLS[r[0]].p;if(r[0]===r[1]||r[0]===r[2])return SLS[r[0]].q;if(r[1]===r[2])return SLS[r[1]].q;return 0}

/**
 * Pulls the lever: takes the stake, spends a play, DECIDES THE RESULT NOW
 * (S.sl.r), saves immediately (anti-cheat: a reload cannot undo the loss),
 * then runs the animation.
 * @returns {void}
 */
function slSpin(){if(casLeft()<1||casBusy())return;var b=casBet();if(S.cash<b)return;S.cash-=b;casUse();S.sl={bet:b,r:[slPick(),slPick(),slPick()]};save();slRun()}

/**
 * Animates the reels. Every 80 ms each still-spinning reel shows a random
 * emoji; reels stop one by one at 0.9 s, 1.5 s and 2.1 s on their predetermined
 * symbol. When the third stops, the flicker timer is cleared, the busy flag
 * is released and the result is paid. (Elements are looked up each tick
 * because render() may have replaced them.)
 * @returns {void}
 */
function slRun(){CANIM=true;render();var st=[0,0,0],fin=S.sl.r,iv=setInterval(function(){for(var i=0;i<3;i++){if(st[i])continue;var e=$('sl'+i);if(e)e.textContent=SLS[Math.floor(Math.random()*SLS.length)].e}},80);
[900,1500,2100].forEach(function(t,i){setTimeout(function(){st[i]=1;var e=$('sl'+i);if(e)e.textContent=SLS[fin[i]].e;if(i===2){clearInterval(iv);CANIM=false;slEnd()}},t)})}

/**
 * Pays the slot result. payout = round(bet x multiplier); net = payout - bet.
 * (A "small return" is a payout that is less than the stake: a partial loss.)
 * @param {boolean} [q] - Quiet: skip render() (used when already rendering).
 * @returns {void}
 */
function slEnd(q){var s=S.sl;if(!s)return;var pay=Math.round(s.bet*slMult(s.r)),net=pay-s.bet,m=net>0?'You won '+gbp(net)+'.':net===0?'You got your bet back.':pay>0?'Small return of '+gbp(pay)+', a loss of '+gbp(-net)+'.':'No win. You lose '+gbp(s.bet)+'.';
S.cash+=pay;S.slr={r:s.r,m:m};S.sl=null;say('Slots: '+m);if(!q)render()}

/**
 * Builds the Slots card: three reels (a "?" while spinning, the last result
 * after a spin, a default trio initially), the spin button and the pay table.
 * @returns {string} HTML.
 */
function slView(){var left=casLeft(),b=casBet(),sh=S.sl?null:(S.slr&&S.slr.r),c='<div class="card"><h2>Slots</h2><p class="log">Three reels. Three matching symbols pay big, and any two matching pay a smaller prize.</p><div class="reels">';
[0,1,2].forEach(function(i){c+='<div class="reel" id="sl'+i+'">'+(sh?SLS[sh[i]].e:S.sl?'\u2754':SLS[[3,4,2][i]].e)+'</div>'});
c+='</div>'+(S.slr&&!S.sl?'<p class="lead" style="text-align:center"><b>'+S.slr.m+'</b></p>':'')+'<button class="main full" onclick="slSpin()"'+(left<1||S.cash<b||casBusy()?' disabled':'')+'>'+(left<1?'No plays left this year':'Spin \u00b7 bet '+gbp(b))+'</button><p class="lead" style="margin-top:12px"><b>Pay table</b> (times your bet)</p>';
SLS.forEach(function(s){c+='<div class="row"><div class="nm">'+s.e+s.e+s.e+' \u00b7 '+(s.p?'\u00d7'+s.p:'busted, nothing')+'</div><div class="log">'+(s.q?'any two '+s.e+' \u00d7'+s.q:'')+'</div></div>'});
return c+'</div>'}


/* =========================== ROULETTE =========================== */

/**
 * Colour of a number: 0 = green, in RRED = red, otherwise black.
 * @param {number} n - 0..36.
 * @returns {string} 'g' | 'r' | 'b' (also the CSS class suffix rg / rr / rb).
 */
function rCol(n){return n===0?'g':RRED.indexOf(n)>=0?'r':'b'}

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
function rMult(s,n){var t=s.t;if(t==='n')return n===s.v?36:0;if(n===0)return 0;var c=rCol(n);
return t==='r'?(c==='r'?2:0):t==='b'?(c==='b'?2:0):t==='o'?(n%2?2:0):t==='e'?(n%2===0?2:0):t==='lo'?(n<=18?2:0):t==='hi'?(n>=19?2:0):t==='d1'?(n<=12?3:0):t==='d2'?(n>12&&n<=24?3:0):t==='d3'?(n>24?3:0):0}

/** Display name of a bet (e.g. "number 17" or "Red"). @param {{t:string,v:number}} s @returns {string} */
function rName(s){return s.t==='n'?'number '+s.v:RN[s.t]}

/** Selects the bet to place (ignored while busy). @param {string} t - Bet type. @param {number} [v] - Number for 'n' bets. @returns {void} */
function rSel(t,v){if(casBusy())return;S.rsel={t:t,v:v};render()}

/**
 * Spins the wheel: takes the stake, uses a play, DECIDES the winning number
 * now (uniform 0..36), saves, then animates.
 * @returns {void}
 */
function rlSpin(){if(casLeft()<1||casBusy()||!S.rsel)return;var b=casBet();if(S.cash<b)return;S.cash-=b;casUse();S.rl={bet:b,sel:S.rsel,n:Math.floor(Math.random()*37)};save();rlRun()}

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
function rlRun(){CANIM=true;var i=RWH.indexOf(S.rl.n),a=360/37,need=((-(i+.5)*a-RROT)%360+360)%360,tgt=RROT+1800+need;render();var w=$('rlw'),bl=$('rlb');
if(w&&bl){void w.getBoundingClientRect();var tr='transform 5.5s cubic-bezier(.15,.6,.15,1)';w.style.transition=tr;w.style.transform='rotate('+tgt+'deg)';bl.style.transition=tr;bl.style.transform='rotate(-2520deg)'}
setTimeout(function(){RROT=tgt%360;CANIM=false;rlEnd()},5800)}

/**
 * Pays the roulette result: payout = round(bet x multiplier); net = payout - bet.
 * @param {boolean} [q] - Quiet: skip render().
 * @returns {void}
 */
function rlEnd(q){var s=S.rl;if(!s)return;var n=s.n,pay=Math.round(s.bet*rMult(s.sel,n)),net=pay-s.bet,col=n===0?'green':rCol(n)==='r'?'red':'black',m='The ball lands on '+n+' ('+col+'). '+(net>0?'You won '+gbp(net)+' on '+rName(s.sel)+'.':'You lose '+gbp(s.bet)+' on '+rName(s.sel)+'.');
S.cash+=pay;S.rlr={n:n,m:m};S.rl=null;say('Roulette: '+m);if(!q)render()}

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
function wheelSvg(){var a=360/37,R2=92,R1=58,o='<circle cx="100" cy="100" r="97" fill="#3a2a14" stroke="#e3a73b" stroke-width="2"/>';
function P(r,t){var d=t*Math.PI/180;return (100+r*Math.sin(d)).toFixed(2)+' '+(100-r*Math.cos(d)).toFixed(2)}
RWH.forEach(function(n,i){var c=rCol(n),col=c==='r'?'#c8374f':c==='b'?'#1b1f27':'#23863b';o+='<path d="M'+P(R2,i*a)+'A'+R2+' '+R2+' 0 0 1 '+P(R2,(i+1)*a)+'L'+P(R1,(i+1)*a)+'A'+R1+' '+R1+' 0 0 0 '+P(R1,i*a)+'Z" fill="'+col+'" stroke="#8b97a8" stroke-width=".6"/><text transform="rotate('+((i+.5)*a).toFixed(2)+' 100 100)" x="100" y="19.5" text-anchor="middle" font-size="7.5" font-weight="700" fill="#fff" font-family="Barlow Condensed,sans-serif">'+n+'</text>'});
o+='<circle cx="100" cy="100" r="58" fill="#161D26" stroke="#e3a73b" stroke-width="2"/><circle cx="100" cy="100" r="30" fill="#0B0F14" stroke="#e3a73b" stroke-width="1.5"/><path d="M100 72V128M72 100H128" stroke="#e3a73b" stroke-width="3"/><circle cx="100" cy="100" r="6" fill="#e3a73b"/>';
return '<div class="wl"><svg id="rlw" viewBox="0 0 200 200" role="img" aria-label="Roulette wheel" style="transform:rotate('+RROT+'deg)">'+o+'</svg><svg id="rlb" viewBox="0 0 200 200"><circle cx="100" cy="36" r="4.5" fill="#fff" stroke="#999" stroke-width=".8"/></svg><svg viewBox="0 0 200 200"><path d="M92 0H108L100 15Z" fill="#FFB547" stroke="#000" stroke-width=".8"/></svg></div>'}

/**
 * Builds the Roulette card: wheel, last result, current bet label, nine
 * outside-bet buttons, the 0..36 number grid and the Spin button.
 * `k(t,v)` returns ' sel' for the currently selected bet so style.css can
 * outline it. All bet buttons are disabled while busy.
 * @returns {string} HTML.
 */
function rlView(){var left=casLeft(),b=casBet(),s=S.rsel,busy=casBusy(),off=busy?' disabled':'',k=function(t,v){return s&&s.t===t&&s.v===v?' sel':''},c='<div class="card"><h2>Roulette</h2><p class="log">European wheel with a single zero. Pick one bet, then spin. Numbers pay 35 to 1, dozens 2 to 1, everything else 1 to 1. Zero beats every outside bet.</p>'+wheelSvg();
if(S.rlr&&!S.rl&&!CANIM)c+='<p class="lead" style="text-align:center"><b>'+S.rlr.m+'</b></p>';
c+='<p class="lead"><b>Your bet:</b> '+(s?rName(s):'none selected')+'</p><div class="btns" style="flex-wrap:wrap;margin-bottom:6px"><button class="rr'+k('r')+'" style="flex:1 1 30%"'+off+' onclick="rSel(\'r\')">Red</button><button class="rb'+k('b')+'" style="flex:1 1 30%"'+off+' onclick="rSel(\'b\')">Black</button><button class="'+k('o').trim()+'" style="flex:1 1 30%"'+off+' onclick="rSel(\'o\')">Odd</button><button class="'+k('e').trim()+'" style="flex:1 1 30%"'+off+' onclick="rSel(\'e\')">Even</button><button class="'+k('lo').trim()+'" style="flex:1 1 30%"'+off+' onclick="rSel(\'lo\')">1-18</button><button class="'+k('hi').trim()+'" style="flex:1 1 30%"'+off+' onclick="rSel(\'hi\')">19-36</button><button class="'+k('d1').trim()+'" style="flex:1 1 30%"'+off+' onclick="rSel(\'d1\')">1st 12</button><button class="'+k('d2').trim()+'" style="flex:1 1 30%"'+off+' onclick="rSel(\'d2\')">2nd 12</button><button class="'+k('d3').trim()+'" style="flex:1 1 30%"'+off+' onclick="rSel(\'d3\')">3rd 12</button></div><div class="rgrid">';
for(var n=0;n<=36;n++)c+='<button class="r'+rCol(n)+k('n',n)+'"'+off+' onclick="rSel(\'n\','+n+')">'+n+'</button>';
return c+'</div><button class="main full" onclick="rlSpin()"'+(left<1||S.cash<b||!s||busy?' disabled':'')+'>'+(left<1?'No plays left this year':!s?'Pick a bet first':'Spin \u00b7 bet '+gbp(b))+'</button></div>'}


/* ======================== CASINO TAB ROOT ======================== */

/**
 * Builds the Casino tab: header with plays left, bet-size buttons, the game
 * switcher, then the active game's card (default blackjack).
 * First settles any game left pending by a reload (when no animation runs).
 * While a game is in progress other games and bet sizes are disabled so a
 * round cannot be abandoned.
 * @returns {string} HTML.
 */
function casinoView(){if(!CANIM)casResolve();var left=casLeft(),busy=casBusy(),g=S.cg||'bj',b=casBet();
var h='<div class="card"><h2>Casino</h2><p class="log">Plays left this year: <b>'+left+'</b> of '+CASINO_LIMIT+'. Each hand, spin or round uses one play. You bet with the cash in your pocket, and the house always has an edge.</p><p class="lead"><b>Bet size</b></p><div class="btns" style="flex-wrap:wrap;margin-bottom:8px">'+CBETS.map(function(v){return '<button style="flex:1 1 28%" class="'+(v===b?'main':'')+'"'+(busy?' disabled':'')+' onclick="setCbet('+v+')">'+gbpS(v)+'</button>'}).join('')+'</div><div class="btns">'+[['bj','Blackjack'],['sl','Slots'],['rl','Roulette']].map(function(x){return '<button style="flex:1" class="'+(g===x[0]?'main':'')+'"'+(busy&&g!==x[0]?' disabled':'')+' onclick="casGame(\''+x[0]+'\')">'+x[1]+'</button>'}).join('')+'</div></div>';
return h+(g==='sl'?slView():g==='rl'?rlView():bjView())}


/* ============================================================================
 * ============================================================================
 * ======  SECTION 33: HOW-TO-PLAY TEXT  ======================================
 * ============================================================================
 * ========================================================================== */

/**
 * HELP: the full "How to play" HTML, used by both the in-game menu and the
 * start screen. It is built at LOAD TIME, so it needs CASINO_LIMIT (above)
 * and levelList() (which reads GOODS/PROPS/PROT/GUNS/BAGS). The level
 * paragraph explains the XP formula in plain English; keep it in step with
 * yearXp() if you ever change XPD or XPK.
 */
var HELP='<p class="lead">Build a fortune across generations. Each turn is one year of your life, from age 18 to 68.</p>'
+'<p class="lead"><b>Trade.</b> Buy stock where it’s cheap and sell where it’s dear. Prices change by district and every year. You can carry 15 items, more with a bag.</p>'
+'<p class="lead"><b>Survive.</b> You lose 30 fed each year. Eat, or your health drops. Well fed and indoors, you heal.</p>'
+'<p class="lead"><b>Odd jobs.</b> Broke? The Trade tab has cash-in-hand jobs: wash dishes, deliver a package or collect a debt. You can work one job a year. Some carry a risk of police or a beating.</p>'
+'<p class="lead"><b>Shelter.</b> With no property you sleep rough: it’s cold, and you’re far more likely to be robbed or arrested. Buy a property in the Home tab and you sleep there whenever you end the year in that district. It has yearly upkeep and sells back for 80%.</p>'
+'<p class="lead"><b>Bloodline.</b> Every character has a name and a life record. When they die your son or daughter takes over, and the Family tree in the menu shows everyone who came before.</p>'
+'<p class="lead"><b>Looks.</b> Choose male or female, then shape the face: hair, hair colour, facial hair colour, eyebrows, eyes, nose, mouth, head shape, accessories and facial hair (or marks for women), with 10 options each. Skin tone, hair colour, facial hair colour and eye colour pass down every generation. Each heir keeps two random features from their parent, and the rest change.</p>'
+'<p class="lead"><b>Crew.</b> Relatives can work for you once you have a property. Cooks start a batch every year for a 15% fee on ingredients. Sellers sell up to 10 units a year from your safe for a 15% cut. They can be arrested, which takes them out for a few years.</p>'
+'<p class="lead"><b>Bags.</b> Buy a bag in the Gear tab for more pocket slots. Better bags unlock as you level, and they pass on to your heirs.</p>'
+'<p class="lead"><b>Market.</b> Your trades move prices in that district. Buying pushes the price up and selling pushes it down, so buying and selling back and forth just loses you money. Buy cheap, travel and sell dear. Prices settle back toward normal as years pass.</p>'
+'<p class="lead"><b>Levels.</b> You earn XP once a year, when you let the year pass. The game takes the money your trading brought in that year (sales and crew sales) and subtracts what you spent on stock and lab ingredients. Your XP is the square root of that profit divided by 1.2649, then divided again by your level raised to the power 1.965, so the higher your level, the more profit each XP costs. At level 1, £1,000 profit earns 25 XP. At level 20 you need about £130 million for the same 25 XP. A loss earns nothing. Each level unlocks something new: a drug, a property, someone higher up to bribe, a bigger bag or a better weapon. There are 20 levels, from Street Kid to Kingpin. You start with Weed, Shrooms and Hash, a hostel, the beat cops and a knife. Levels carry on to your heirs.</p>'
+levelList()
+'<p class="lead"><b>Guns.</b> Buy them in the Guns tab. Your best one boosts your odds in fights but adds years to your sentence if police find it.</p>'
+'<p class="lead"><b>Bank.</b> Open the Home tab to deposit or withdraw cash. Money in the bank can’t be robbed, seized in a raid or taken by a fine, and it counts toward your net worth. Your heir inherits half.</p>'
+'<p class="lead"><b>Safe.</b> Every property has a safe. Stock inside is safe from muggings, raids and jail, but you can only reach it when you’re at the property. Better properties hold more. You can’t sell the property while the safe has stock in it, but you can upgrade and the stock moves with you.</p>'
+'<p class="lead"><b>Lab.</b> At a property you can build a lab, buy equipment for each drug, then cook one batch of each drug at once. A batch finishes when the year passes and goes into your safe first. Ingredients always cost the same: 10% below the lowest normal price of each drug, whatever the market is doing. The lab and equipment go with the property. If a finished batch is waiting for room, free some space and press Collect to take what fits straight away. Crew batches are collected first at the turn of the year.</p>'
+'<p class="lead"><b>Heat.</b> The heat bar at the top shows your chance of police attention each year, from green (cool) to red (hot). It rises when you carry stock, sleep rough or cook, and more so in heavily policed districts. The safe is never touched. If the police do come for you, what happens depends on your heat:<br><b>Under 5%:</b> they leave you alone.<br><b>5–15%:</b> stop and search. They take some of your stock and fine you. Nothing happens if you are clean.<br><b>16–30%:</b> pulled over. If you are carrying stock you are arrested, with a chance to run, fight, give up or bribe.<br><b>31–55%:</b> undercover sting. A buyer turns out to be a cop and you are arrested if you are carrying stock.<br><b>56–89%:</b> police raid. Any batches cooking are seized, and you are arrested if you are carrying stock or are at your lab. You cannot run.<br><b>90% or more:</b> FBI raid. Your batches are seized, your lab and equipment are wrecked, you are fined 25% of your cash and you are arrested with extra years added to your sentence.<br>Bribe police in the Home tab to cut your heat for a few years, all the way up to the mayor.</p>'
+'<p class="lead"><b>Trouble.</b> Travelling can bring police stops and muggers. Police stops and arrests give you four choices: run, fight, give up for a shorter sentence, or bribe. Muggers and burglars give you the first three. Fail and you go to jail for a sentence based on your stock, and you leave with full health and 70 fed. Lose and you go to jail for longer the more stock you carried. The stock is confiscated and the years pass.</p>'
+'<p class="lead"><b>Casino.</b> Open the Casino tab to play blackjack, slots or roulette with your pocket cash. You get '+CASINO_LIMIT+' plays a year across all three games, and each hand, spin or round uses one. The house always has an edge, so it is a gamble, not a plan.</p>'
+'<p class="lead"><b>Death.</b> At 68, or if your health hits zero, you die. Your son or daughter inherits half your cash and stock (as much as they can carry) and your property. Your score is your net worth at death.</p>';


/* ============================================================================
 * ============================================================================
 * ======  SECTION 34: DEVELOPER TOOLS  =======================================
 * ============================================================================
 * ========================================================================== */
/* Reached from Menu -> Dev tools after entering a password. NOTE: this is a
 * convenience gate, NOT real security: the password is visible to anyone who
 * opens game.js. Do not rely on it for anything that matters. */

/**
 * Runs one dev action, then saves and redraws.
 * ACTIONS:
 *   cash   : add money (x = pounds).
 *   fill   : fill free pocket slots with drug x at the current price
 *            (updates the weighted average price paid).
 *   clear  : empty pockets.          heal : health and fed to 100.
 *   roll   : re-roll today's prices.
 *   range  : toggle the "price range" hints (persisted as tn_devr).
 *   xp     : add x XP (may trigger a level-up popup).
 *   year   : skip one year (batches finish, XP is awarded, markets cool,
 *            new prices); ends the life if past the final year.
 *   cas    : reset casino plays.
 *   old    : jump to the final year (age 67).
 *   die    : end the life now.
 *   manor  : give the TOP property (the last PROPS entry) with a lab and
 *            all equipment, here.
 * @param {string} a - Action code.
 * @param {string|number} [x] - Argument (strings come from onclick HTML).
 * @returns {void}
 */
function dv(a,x){
if(a==='cash')S.cash+=+x;
else if(a==='fill'){var f=cap()-carried();if(f>0){var q=S.inv[x];S.paid[x]=(S.paid[x]*q+S.prices[x]*f)/(q+f);S.inv[x]+=f}}
else if(a==='clear')GOODS.forEach(function(g){S.inv[g.id]=0;S.paid[g.id]=0});
else if(a==='heal'){S.hp=100;S.food=100}
else if(a==='roll')roll();
else if(a==='range'){DEVR=!DEVR;try{localStorage.setItem('tn_devr',DEVR?'1':'')}catch(e){}}
else if(a==='xp')gainXp(+x);
else if(a==='year'){S.day++;finishBatches(true);yearXp();coolMarkets(1);roll();if(S.day>DAYS){S.view='over';M=null}}
else if(a==='cas')S.cas=null;
else if(a==='old')S.day=DAYS;
else if(a==='die'){S.hp=0;S.view='over';M=null}
else if(a==='manor'){var e={};GOODS.forEach(function(g){e[g.id]=1});S.prop={i:PROPS.length-1,loc:S.loc,lab:true,eq:e}}
save();render()}

/** True when the last password attempt was wrong (shows the red message). */
var DERR=false;

/** Opens the password prompt (clears any old error). @returns {void} */
function devGate(){DERR=false;go('devpw')}

/**
 * Checks the typed password (case-sensitive). Right: open the dev tools.
 * Wrong: set the error flag and redraw the prompt.
 * @returns {void}
 */
function devCheck(){var el=$('dpw'),v=el?el.value:'';if(v==='Empire'){DERR=false;go('dev')}else{DERR=true;render()}}


/* ============================================================================
 * ============================================================================
 * ======  SECTION 35: MENUS & NAVIGATION  ====================================
 * ============================================================================
 * ========================================================================== */
/* M is the open menu screen (null = none). render() shows menuView() whenever
 * M is set, so "opening a menu" is just: set M, call render(). */

/**
 * Opens a menu screen. For screens you may need to come back from (help,
 * confirm, tree, assign) the PREVIOUS menu is remembered in MB.
 * @param {string} m - Menu id.
 * @returns {void}
 */
function go(m){if(m==='help'||m==='confirm'||m==='tree'||m==='assign')MB=M;M=m;render()}

/** Returns to the remembered previous menu (MB), then clears MB. @returns {void} */
function back(){M=MB;MB=null;render()}

/**
 * Builds the HTML for whichever menu is open.
 * SCREENS (in order): log (full history), tree (family tree), assign
 * (choose a drug for a relative), help, confirm (new-game confirmation),
 * devpw (password prompt), dev (dev tools), and the default main menu.
 * The assign list shows drugs you may trade: for 'sell' any unlocked drug,
 * for 'cook' only drugs whose equipment you own.
 * The main menu has Resume / How to play / Family tree / New game /
 * Dev tools / Quit to title.
 * @returns {string} HTML.
 */
function menuView(){var t='<div class="top"><h1>Kingpin: Bloodline</h1></div>';
if(M==='log')return t+'<div class="card"><h2>History</h2><p class="log">Everything this character has been through.</p>'+S.log.map(function(l){return '<p class="lead" style="font-size:14px">'+l+'</p>'}).join('')+'<button class="main full" onclick="M=null;render()">Back</button></div>';
if(M==='tree')return t+treeView();
if(M==='assign'){var k=AS.k,pp=S.prop,list=ug().filter(function(g){return k==='sell'||(pp&&pp.eq&&pp.eq[g.id])});return t+'<div class="card"><h2>'+(k==='cook'?'Cook which drug?':'Sell which drug?')+'</h2><p class="log">'+S.fam[AS.i].n+'. '+(k==='cook'?'Needs the lab and equipment for that drug.':'Sells up to 10 units a year from your safe.')+'</p>'+(list.length?list.map(function(g){return '<button class="opt" onclick="setTask(\''+g.id+'\')">'+g.n+'</button>'}).join(''):'<p class="lead">Nothing available yet.</p>')+'<button class="full" onclick="back()">Cancel</button></div>'}
if(M==='help')return t+'<div class="card"><h2>How to play</h2>'+HELP+'<button class="main full" onclick="back()">Back</button></div>';
if(M==='confirm')return t+'<div class="card"><h2>Start a new game?</h2><p class="lead">This erases your current character and their whole family line. You can’t undo it.</p><button class="danger full" onclick="M=null;newGame()">Yes, start over</button><button class="full" onclick="back()">Cancel</button></div>';
if(M==='devpw'){var pi='width:100%;min-height:44px;background:#0B0F14;color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:8px 10px;font:600 16px Barlow,sans-serif';return t+'<div class="card"><h2>Dev tools</h2><p class="log">Enter the password to continue.</p><label for="dpw"><small class="log">Password</small></label><input id="dpw" type="password" style="'+pi+'" autocomplete="off" autocapitalize="off" onkeydown="if(event.key===\'Enter\')devCheck()">'+(DERR?'<p class="up" role="alert" style="margin:8px 0 0">Wrong password.</p>':'')+'<button class="main full" onclick="devCheck()">Unlock</button><button class="full" onclick="go(\'menu\')">Cancel</button></div>'}
if(M==='dev'){var d=function(l,a,x){return '<button style="flex:1;min-width:30%" onclick="dv(\''+a+'\',\''+(x===undefined?'':x)+'\')">'+l+'</button>'},g=function(s){return '<div class="btns" style="flex-wrap:wrap;margin-bottom:12px">'+s+'</div>'};
return t+'<div class="card"><h2>Dev tools</h2><p class="log">Cash '+gbp(S.cash)+' · Age '+age()+' · Pockets '+carried()+'/'+cap()+'</p><p class="lead"><b>Money</b></p>'+g(d('+£1k','cash',1000)+d('+£10k','cash',10000)+d('+£100k','cash',100000)+d('+£1m','cash',1000000))+'<p class="lead"><b>Stock (fills free pockets)</b></p>'+g(GOODS.map(function(x){return d(x.n,'fill',x.id)}).join('')+d('Clear','clear'))+'<p class="lead"><b>Player</b></p>'+g(d('Heal and feed','heal')+d('Reroll prices','roll')+d('Top property + lab here','manor')+d('Price ranges: '+(DEVR?'ON':'OFF'),'range')+d('+100 XP','xp',100)+d('+1000 XP','xp',1000)+d('+5000 XP','xp',5000))+'<p class="lead"><b>Time</b></p>'+g(d('+1 year','year')+d('Jump to 67','old')+d('Reset casino plays','cas')+d('End this life','die'))+'<button class="main full" onclick="go(\'menu\')">Back</button></div>'}
/* ---- default: the main in-game menu ---- */
return t+'<div class="card"><h2>Menu</h2><button class="main opt" onclick="M=null;render()">Resume</button><button class="opt" onclick="go(\'help\')">How to play</button><button class="opt" onclick="go(\'tree\')">Family tree</button><button class="opt" onclick="go(\'confirm\')">New game</button><button class="opt" onclick="devGate()">Dev tools</button><button class="opt" onclick="toTitle()">Quit to title</button><p class="log">Your game saves automatically.</p><p class="log" style="text-align:center">Version '+VERSION+'</p></div>'}


/* ============================================================================
 * ============================================================================
 * ======  SECTION 36: START SCREEN & BOOT SEQUENCE  ==========================
 * ============================================================================
 * ========================================================================== */
/* The start screen (#start in index.html) is a separate UI from the in-game
 * menus. Its animation is class-driven (see style.css section 7):
 *   (none) -> p1 -> p2 -> p3 -> p4, timed by stIntro(). */

/** ST: the #start overlay element. STT: pending intro timer ids (so they can be cancelled). */
var ST=document.getElementById('start'),STT=[];

/** Is there a valid saved game? @returns {boolean} */
function hasSave(){return !!load()}

/**
 * Fills the start-screen panel with one of its views and scrolls it to the top.
 * VIEWS: 'main' (New / Load / How to play / Quit + version), 'confirm'
 * (erase existing save?), 'help', anything else = the "Thanks for playing"
 * quit message. The `.sub` class hides the big title on every sub-view so
 * they have room.
 * @param {string} v - View id.
 * @returns {void}
 */
function stPanel(v){var p=document.getElementById('st-panel'),h='';ST.classList.toggle('sub',v!=='main');
if(v==='main'){var hs=hasSave();h='<button class="main opt" onclick="stNew()">New Game</button><button class="opt" onclick="stLoad()"'+(hs?'':' disabled')+'>Load Game'+(hs?'':'<small>No saved game found</small>')+'</button><button class="opt" onclick="stPanel(\'help\')">How to Play</button><button class="opt" onclick="stQuit()">Quit</button><p class="log" style="text-align:center;margin-top:14px">Version '+VERSION+'</p>'}
else if(v==='confirm')h='<div class="card"><h2>Start a new game?</h2><p class="lead">This erases your saved character and their whole family line. You can\u2019t undo it.</p><button class="danger full" onclick="stBegin()">Yes, start over</button><button class="full" onclick="stPanel(\'main\')">Cancel</button></div>';
else if(v==='help')h='<div class="card"><h2>How to play</h2>'+HELP+'<button class="main full" onclick="stPanel(\'main\')">Back</button></div>';
else h='<div class="card"><h2>Thanks for playing</h2><p class="lead">You can close this tab or window now. Your game saves automatically.</p><button class="main full" onclick="stPanel(\'main\')">Back to menu</button></div>';
p.innerHTML=h;document.getElementById('st-main').scrollTop=0}

/** Hides the start overlay and reveals the game (#app). @returns {void} */
function stHide(){ST.style.display='none';$('app').style.display=''}

/** "New Game": asks for confirmation first if a save exists (it would be erased). @returns {void} */
function stNew(){if(hasSave())stPanel('confirm');else stBegin()}

/** Starts a fresh game: clears any open menu, hides the start screen, builds new state. @returns {void} */
function stBegin(){M=null;stHide();newGame()}

/**
 * "Load Game": loads the validated save into S, clears any stale event, and
 * settles any casino game that was mid-spin when the page closed.
 * @returns {void}
 */
function stLoad(){var s=load();if(!s)return;S=s;S.ev=null;M=null;casResolve();stHide();render()}

/**
 * "Quit": browsers only allow window.close() on windows a script opened, so
 * this usually does nothing; the panel then tells the player to close the tab.
 * @returns {void}
 */
function stQuit(){try{window.close()}catch(e){}stPanel('quit')}

/**
 * "Quit to title" from the in-game menu: saves, shows the start overlay again
 * (already in its final state: classes p3 and p4) and displays the main panel.
 * @returns {void}
 */
function toTitle(){M=null;try{save()}catch(e){}ST.style.display='flex';$('app').style.display='none';ST.className='p3 p4';stPanel('main')}

/** Skips the intro animation: cancels timers and jumps to the final state. @returns {void} */
function stSkip(){STT.forEach(clearTimeout);STT=[];ST.className='p3 p4'}

/**
 * Plays the intro. Timeline (milliseconds after start):
 *   60 -> p1: logo fades in (and slowly zooms)     3500 -> p2: logo fades out
 *   4600 -> p3: title fades up                     6400 -> p4: menu appears
 * Users who prefer reduced motion skip straight to the final state. Every
 * timer id is stored in STT so a click (stSkip) can cancel the rest.
 * @returns {void}
 */
function stIntro(){STT.forEach(clearTimeout);STT=[];ST.className='';stPanel('main');
if(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches){ST.className='p3 p4';return}
[[60,'p1'],[3500,'p2'],[4600,'p3'],[6400,'p4']].forEach(function(s){STT.push(setTimeout(function(){ST.classList.add(s[1])},s[0]))})}


/* ============================================================================
 * ============================================================================
 * ======  SECTION 37: BOOT (RUNS ONCE WHEN THE SCRIPT LOADS)  ================
 * ============================================================================
 * ========================================================================== */

/* Clicking anywhere on the start screen BEFORE the menu has appeared (no p4
   class yet) skips the animation; once the menu is up, clicks do nothing here
   so the menu buttons work normally. */
ST.addEventListener('click',function(){if(!ST.classList.contains('p4'))stSkip()});

/* Hide the game until the player picks New or Load, then start the intro. */
$('app').style.display='none';stIntro();

/* ======================= END OF game.js ======================= */
