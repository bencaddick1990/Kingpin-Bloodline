/* Kingpin: Bloodline  |  js/99-boot.js
 * Boot: runs once when all scripts have loaded.
 * Part of one game split across plain <script> files that share global scope;
 * index.html loads them in numeric order. See README.md for the full map. */

/* ============================================================================
 * ============================================================================
 * ======  SECTION 37: BOOT (RUNS ONCE WHEN THE SCRIPT LOADS)  ================
 * ============================================================================
 * ========================================================================== */

/* Clicking anywhere on the start screen BEFORE the menu has appeared (no p4
   class yet) skips the animation; once the menu is up, clicks do nothing here
   so the menu buttons work normally. */
ST.addEventListener('click', function () {
  if (!ST.classList.contains('p4')) stSkip();
});

/* Automatic tap sounds, and pausing audio in the background (22-audio.js). */
audioInit();

/* Hide the game until the player picks New or Load, then start the intro. */
$('app').style.display = 'none';
stIntro();
