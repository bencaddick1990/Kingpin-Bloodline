/* Kingpin: Bloodline  |  js/27-help.js
 * The How-to-play text.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 33: HOW-TO-PLAY TEXT  ======================================
 * ============================================================================
 * ========================================================================== */

/**
 * HELP: the full "How to play" HTML, used by both the in-game menu and the
 * start screen. It is built at LOAD TIME, so every file it reads must load
 * before this one: CASINO_LIMIT (20-casino.js), WALK_FED (01-config.js),
 * ACH (23-achievements.js) and levelList() (which reads GOODS/PROPS/PROT/
 * GUNS/BAGS). The level
 * paragraph explains the XP formula in plain English; keep it in step with
 * yearXp() if you ever change XPD or XPK.
 */
var HELP =
  '<p class="lead">Build a fortune across generations. Each turn is one year of your life, from age 18 to 68.</p>' +
  '<p class="lead"><b>Trade.</b> Buy stock where it’s cheap and sell where it’s dear. Prices change by district and every year. You can carry 15 items, more with a bag.</p>' +
  '<p class="lead"><b>Street news.</b> When a drug is tagged <span class="down">cheap</span> or <span class="up">spike</span>, a news line underneath says why: a big bust or a customs crackdown dries up supply and sends the price soaring, while a bulk shipment or oversupply makes it cheap.</p>' +
  '<p class="lead"><b>Travel.</b> Getting to another district costs a small fare (more as you level up) and 10 fed. If you can\u2019t afford the fare you walk, which costs ' +
  WALK_FED +
  ' fed instead. Each trip risks a police stop or a mugger.</p>' +
  '<p class="lead"><b>Tip-offs.</b> On the Travel tab you can pay a contact to tell you a district\u2019s prices for this year, along with any news. The tip is exact: those are the prices you will find if you go there before the year ends. It is used up when you arrive.</p>' +
  '<p class="lead"><b>Survive.</b> You lose 30 fed each year. Eat, or your health drops. Well fed and indoors, you heal.</p>' +
  '<p class="lead"><b>Odd jobs.</b> Broke? The Trade tab has cash-in-hand jobs: wash dishes, deliver a package or collect a debt. You can work one job a year. Some carry a risk of police or a beating.</p>' +
  '<p class="lead"><b>Shelter.</b> With no property you sleep rough: it’s cold, and you’re far more likely to be robbed or arrested. Buy a property in the Home tab and you sleep there whenever you end the year in that district. You can own one property in each district, and each has its own safe, lab, bed and crew. Every property has yearly upkeep and sells back for 80%.</p>' +
  '<p class="lead"><b>Bloodline.</b> Every character has a name and a life record. When they die your son or daughter takes over, and the Family tree in the menu shows everyone who came before.</p>' +
  '<p class="lead"><b>Looks.</b> Choose male or female, then shape the face: hair, hair colour, facial hair colour, eyebrows, eyes, nose, mouth, head shape, accessories and facial hair (or marks for women), with 10 options each. Skin tone, hair colour, facial hair colour and eye colour pass down every generation. Each heir keeps two random features from their parent, and the rest change.</p>' +
  '<p class="lead"><b>Crew.</b> Relatives can work for you once you have a property. Each relative works at one property, which you choose by assigning them while you are in that district. Cooks start a batch every year for a 15% fee on ingredients. Sellers sell up to 10 units a year from your safe for a 15% cut. They can be arrested, which takes them out for a few years.</p>' +
  '<p class="lead"><b>Bags.</b> Buy a bag in the Gear tab for more pocket slots. Better bags unlock as you level, and they pass on to your heirs.</p>' +
  '<p class="lead"><b>Market.</b> Your trades move prices in that district, and only ever against you. Buying pushes your buy price up and selling pushes your sell price down, and those moves last until the market settles over the coming years. Your own buying never raises what you can sell for there, and your own selling never makes it cheaper for you to buy back, so buying and selling back and forth just loses you money. Buy cheap, travel and sell dear.</p>' +
  '<p class="lead"><b>Levels.</b> You earn XP once a year, when you let the year pass. XP comes from the profit you actually make on what you sell: for every sale, what you got minus what those units cost you (including lab ingredients and your crew’s 15% cut). Buying stock doesn’t count until you sell it. Anything taken from you, whether stock, lab batches or cash lost to muggers, police and raids, counts against that profit at what it cost you, and a year that ends in a loss carries the shortfall into the next. Your XP is the square root of that profit divided by 1.2649, then divided again by your level raised to the power 1.965, so the higher your level, the more profit each XP costs. At level 1, £1,000 profit earns 25 XP. At level 20 you need about £130 million for the same 25 XP. Each level unlocks something new: a drug, a property, someone higher up to bribe, a bigger bag or a better weapon. There are 20 levels, from Street Kid to Kingpin. You start with Weed, Shrooms and Hash, a hostel, the beat cops and a knife. Levels carry on to your heirs, but each heir starts with a fresh XP ledger, and inherited stock only earns XP on the margin above what it originally cost.</p>' +
  levelList() +
  '<p class="lead"><b>Guns.</b> Buy them in the Gear tab. Your best one boosts your odds in fights but adds years to your sentence if police find it.</p>' +
  '<p class="lead"><b>Bank.</b> Open the Home tab to deposit or withdraw cash. Money in the bank can’t be robbed, seized in a raid or taken by a fine, and it counts toward your net worth. Your heir inherits half.</p>' +
  '<p class="lead"><b>Safe.</b> Every property has a safe. Stock inside is safe from muggings, raids and jail, but you can only reach it when you’re at the property. Better properties hold more. You can’t sell the property while the safe has stock in it, but you can upgrade and the stock moves with you.</p>' +
  '<p class="lead"><b>Lab.</b> At a property you can build a lab, buy equipment for each drug, then cook one batch of each drug at once. A batch finishes when the year passes and goes into your safe first. Ingredients always cost the same: 10% below the lowest normal price of each drug, whatever the market is doing. The lab and equipment go with the property. If a finished batch is waiting for room, free some space and press Collect to take what fits straight away. Crew batches are collected first at the turn of the year. Every property can have its own lab, heat from all your labs adds up, and a raid hits the property with the most batches cooking.</p>' +
  '<p class="lead"><b>Heat.</b> The heat bar at the top shows your chance of police attention each year, from green (cool) to red (hot). It rises when you carry stock, sleep rough or cook, and more so in heavily policed districts. The safe is never touched. If the police do come for you, what happens depends on your heat:<br><b>Under 5%:</b> they leave you alone.<br><b>5–15%:</b> stop and search. They take some of your stock and fine you. Nothing happens if you are clean.<br><b>16–30%:</b> pulled over. If you are carrying stock you are arrested, with a chance to run, fight, give up or bribe.<br><b>31–55%:</b> undercover sting. A buyer turns out to be a cop and you are arrested if you are carrying stock.<br><b>56–89%:</b> police raid. Any batches cooking are seized, and you are arrested if you are carrying stock or are at your lab. You cannot run.<br><b>90% or more:</b> FBI raid. Your batches are seized, your lab and equipment are wrecked, you are fined 25% of your cash and you are arrested with extra years added to your sentence.<br>Bribe police in the Home tab to cut your heat for a few years, all the way up to the mayor.</p>' +
  '<p class="lead"><b>Trouble.</b> Travelling can bring police stops and muggers. Police stops and arrests give you four choices: run, fight, give up for a shorter sentence, or bribe. Muggers and burglars give you the first three. Fail and you go to jail for a sentence based on your stock, and you leave with full health and 70 fed. Lose and you go to jail for longer the more stock you carried. The stock is confiscated and the years pass.</p>' +
  '<p class="lead"><b>Casino.</b> Open the Casino tab to play blackjack, slots or roulette with your pocket cash. You get ' +
  CASINO_LIMIT +
  ' plays a year across all three games, and each hand, spin or round uses one. The house always has an edge, so it is a gamble, not a plan.</p>' +
  '<p class="lead"><b>Death.</b> At 68, or if your health hits zero, you die. Your son or daughter inherits half your cash and stock (as much as they can carry) and your property. Your score is your net worth at death.</p>' +
  '<p class="lead"><b>Achievements.</b> There are ' +
  ACH.length +
  ' to earn, from your first deal to a three-generation dynasty. They are kept on this device, through new games and every heir. See them in the Menu.</p>' +
  '<p class="lead"><b>Settings.</b> Turn sound effects, vibration, the first-year tutorial and the intro animation on or off, and set the volume, from the Menu or the start screen.</p>';
