# Kingpin: Bloodline

A single-player trading and dynasty game by Black Obsidian Games. Build a fortune
across generations: each turn is one year of a life from 18 to 68, and when you
die your son or daughter takes over.

It is plain HTML, CSS and JavaScript with **no build step and no dependencies**.
Open `index.html` in a browser to play. Everything (fonts, logo, scripts, sounds)
is local, so it runs offline, ready to wrap as an Android app.

## Project layout

```
index.html        Page skeleton: mount points (#app, #start, #toast) + script list
style.css         All styling (theme tokens at the top)
logo.jpg          Studio logo for the intro
fonts/            Barlow + Barlow Condensed (SIL Open Font Licence, fonts/OFL.txt)
js/               The game, one file per system, loaded in numeric order
```

### Script map

All files are plain `<script defer>` files that share one global scope. Order only
matters for code that runs at load time (data tables first, `99-boot.js` last).

| File | What it does |
| --- | --- |
| `01-config.js` | Version, **release switch** (`DEV_TOOLS`), balance constants, all data tables (drugs, districts, food, properties, guns, bags, bribes, jobs, XP), global variables |
| `02-utils.js` | Random numbers, clamping, money formatting, inventory totals |
| `03-looks-data.js` | Character look tables and how looks are generated and inherited |
| `04-portrait.js` | The procedural SVG portrait |
| `05-character.js` | Character creation, heir naming, starting a game |
| `06-levels.js` | Levels, XP and unlocks |
| `07-market-fatigue.js` | How your own trades move prices |
| `08-gear-jobs.js` | Guns, bags, odd jobs, muggings, character helpers |
| `09-family.js` | Family crew and family tree |
| `10-state.js` | New game state; rolling district prices (`rollBoard`, `roll`) |
| `11-render.js` | The renderer: state → HTML |
| `12-save.js` | Save/load with old-save migrations |
| `13-actions.js` | Tabs, buy/sell/eat/heal, the event popup system |
| `14-arrest-travel.js` | Arrests, jail, travel (with fares) |
| `15-heirs-property.js` | Inheritance, property, eviction |
| `16-year.js` | The year turn |
| `17-police.js` | Heat, raids, bribes |
| `18-safe-lab.js` | Safes, storage space, labs |
| `19-bank.js` | Bank |
| `20-casino.js` | Blackjack, slots, roulette |
| `21-settings.js` | Settings (sound, volume, vibration, tutorial, intro) |
| `22-audio.js` | Synthesised sound effects and vibration |
| `23-achievements.js` | The 15 achievements and toast notices |
| `24-tutorial.js` | First-year tutorial |
| `25-news.js` | Street-news headlines for price spikes and crashes |
| `26-intel.js` | Tip-offs, fares and the Travel tab |
| `27-help.js` | How-to-play text |
| `28-dev.js` | Developer tools |
| `29-menus.js` | In-game menus |
| `30-start.js` | Animated start screen |
| `99-boot.js` | Starts everything |

## How the game flows

```
PLAYER TAP (inline onclick="fn(args)")
      |
      v
ACTION FUNCTION   buy / sell / eat / heal / travel / buyTip / buyProp / dep / wd /
(mutates S)       cook / bankIn / bribe / work / bjDeal / slSpin / rlSpin
      |   (most actions also call sfx('name') for their sound)
      |
      |-- may raise an EVENT --> ask(title, text, choices) puts it in S.ev
      |        |                  (or queues it in Q if one is already open)
      |        v
      |   player taps a choice --> choose(i) --> choice.fn() --> after()
      v
render()  <------------------------------------------------------------+
      |   reads S (and M for menus), builds HTML for the current view:   |
      |   create / heirname / event / day (tabs) / over                  |
      v                                                                  |
save()   S -> localStorage "tn_save" (skipped while an event is open)    |
achCheck()  unlocks any achievement whose condition is now true          |
                                                                         |
THE YEAR TURN (button "Let the year pass")                               |
endDay() -> upkeep / eviction -> sleep(bed): robbery roll -> cold/hunger  |
    -> S.day++ -> raid(heat roll) -> finishBatches -> coolMarkets         |
    -> roll() new prices -> crewYear -> yearXp -> death check -> render() +

DEATH: S.hp<=0 or S.day>DAYS -> S.view='over' -> heir(sex) builds a new S
STARTUP: stIntro() -> stPanel('main') -> stNew()/stLoad() -> newGame()/load() -> render()
```

### Key state (`S`, saved in `tn_save`)

`day` (year of life), `gen`, `cash`, `bank`, `hp`, `food`, `loc` (district),
`inv{}` / `paid{}` (stock and average cost), `prices{}`, `base{}`, `flag{}`
(spike/cheap), `news{}` (headline per flagged drug), `yb{}` (this year's price board per district, one per year), `pre{}` (bought tip-offs),
`props[]`, `guns[]`, `bag`, `xp`, `bribe`, `fat{}` (market fatigue), `yp{}` (XP
ledger), `fam[]`, `line[]`, `look{}`, `view`, `tab`, `tut` (tutorial step), `ev`,
`log[]`.

Device-wide storage (not part of a save): `kb_settings`, `kb_ach` (achievements),
`tn_best` (best score), `tn_devr` (dev price hints).

### Short names you'll see

The engine keeps the original compact names. The common ones:
`S` state, `M` open menu, `Q` event queue, `P()` property in this district,
`PA(loc)` property in a district, `gd(id)` drug by id, `ug()` unlocked drugs,
`lvl()` level, `net()` net worth, `bk()` bank balance, `say()` add a log line,
`note()` OK-only popup, `ask()` popup with choices, `sfx()` sound, `vib()` vibrate.

## Before uploading to Google Play

1. In `js/01-config.js`, set `DEV_TOOLS = false`. This removes Dev tools from the menu.
2. Bump `VERSION` in the same file.
3. Wrap the folder as an app (for example Capacitor or a Trusted Web Activity).
   The game needs no network access. If you want the Vibration setting to work,
   the Android app needs the `VIBRATE` permission.
4. Play through a first year with the tutorial on, then with sound on and off.

To change the dev password, run `strHash('NewPassword')` in the browser console
and paste the result into `DEV_PW_HASH` in `js/01-config.js`.
