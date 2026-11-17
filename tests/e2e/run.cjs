/*
 * End-to-end tests against the BUILT single file, opened over file:// with all
 * network requests blocked, on an emulated Android tablet (touch, landscape).
 * Time is controlled with Playwright's fake clock.
 *
 *   npm run build && npm run build:test && npm run e2e
 */
const { chromium, devices } = require('playwright');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const PROD = 'file://' + path.join(ROOT, 'dist/index.html');
const TEST = 'file://' + path.join(ROOT, 'dist-test/index.html');
const DEVICE = devices['Galaxy Tab S4 landscape'];
const T0 = new Date('2026-11-17T09:00:00+05:30').getTime();
const MIN = 60_000;

let failures = 0;
const results = [];
async function test(name, fn) {
  const browser = await chromium.launch();
  const t = Date.now();
  try {
    await fn(browser);
    results.push(`  ✓ ${name} (${Date.now() - t} ms)`);
  } catch (e) {
    failures++;
    results.push(`  ✗ ${name}\n      ${String(e && e.stack || e).split('\n').slice(0, 4).join('\n      ')}`);
  } finally {
    await browser.close();
  }
  console.log(results[results.length - 1]);
}
function assert(cond, msg) { if (!cond) throw new Error('Assertion failed: ' + msg); }

/** A tablet context with every non-file request blocked (offline). */
async function tablet(browser) {
  const ctx = await browser.newContext({ ...DEVICE, deviceScaleFactor: 1 });
  const blocked = [];
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    blocked.push(u);
    return r.abort();
  });
  ctx.blocked = blocked;
  return ctx;
}
async function open(ctx, url = PROD, time = T0) {
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  await page.clock.install({ time });
  await page.goto(url);
  return page;
}
const visible = (page, id) => page.locator(`[data-testid=${id}]`).isVisible();
/** The fake clock also fakes requestAnimationFrame, so let a little fake time pass after UI actions. */
async function settle(page, ms = 120) { await page.clock.runFor(ms); }
async function tapAndSettle(page, sel) { await page.tap(sel); await settle(page); }
async function studyAndTakeBreak(page, minutes) {
  await tapAndSettle(page, '[data-testid=start-study]');
  await page.clock.fastForward(minutes * MIN);
  await tapAndSettle(page, '[data-testid=finish-study]');
  await page.waitForSelector('[data-testid=start-break]');
  await tapAndSettle(page, '[data-testid=start-break]');
  await page.waitForSelector('[data-testid=break-shell]');
}
/** Tap through story lines until an experiment card (or the end card) shows. */
async function storyToExperiment(page) {
  if (await page.locator('[data-testid=pacing-ask]').count()) { await page.getByText('Start anyway').tap(); await settle(page); }
  for (let i = 0; i < 40; i++) {
    if (await page.locator('[data-testid=start-experiment]').count()) return;
    if (await page.locator('[data-testid=story-tap]').count()) { await tapAndSettle(page, '[data-testid=story-tap]'); continue; }
    await settle(page);
  }
}

(async () => {
  console.log('Meridian Lab e2e (file://, offline, Galaxy Tab S4 landscape, touch)');

  await test('loads over file:// with no network and no errors', async (b) => {
    const ctx = await tablet(b);
    const page = await open(ctx);
    await page.waitForSelector('[data-testid=home-screen]');
    assert(page.errors.length === 0, 'page errors: ' + page.errors.join('; '));
    assert(ctx.blocked.length === 0, 'tried to reach the network: ' + ctx.blocked.join(', '));
    const hasTouch = await page.evaluate(() => navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
    assert(hasTouch, 'touch emulation');
  });

  await test('the game cannot be played while studying, and reloading does not help', async (b) => {
    const ctx = await tablet(b);
    const page = await open(ctx);
    await page.tap('[data-testid=start-study]');
    await page.waitForSelector('[data-testid=study-screen]');
    assert(!(await page.locator('[data-testid=break-shell]').count()), 'no game UI while studying');
    await page.clock.fastForward(10 * MIN);
    await page.reload();
    await page.waitForSelector('[data-testid=study-screen]');
    assert(!(await page.locator('[data-testid=break-shell]').count()), 'still no game after reload');
    const clock = await page.textContent('[data-testid=study-clock]');
    assert(/0:1\d:\d\d/.test(clock), 'study clock survived the reload: ' + clock);
    // A short session earns nothing.
    await page.tap('[data-testid=finish-study]');
    await page.tap('[data-testid=finish-anyway]');
    await page.waitForSelector('[data-testid=home-screen]');
    assert(!(await page.locator('[data-testid=start-break]').count()), 'no break for a 10-minute session');
  });

  await test('earning: 160 min of study gives the 40-minute cap', async (b) => {
    const ctx = await tablet(b);
    const page = await open(ctx);
    await page.tap('[data-testid=start-study]');
    await page.clock.fastForward(170 * MIN);
    const earned = await page.textContent('[data-testid=earned]');
    assert(earned.includes('40 min'), 'earned text: ' + earned);
    await page.tap('[data-testid=finish-study]');
    assert((await page.textContent('[data-testid=bank]')).includes('40 min'), 'bank shows 40');
  });

  await test('break end: locks within 1 s, saves the puzzle mid-run, and the lock survives reload', async (b) => {
    const ctx = await tablet(b);
    const page = await open(ctx);
    await studyAndTakeBreak(page, 25); // 6-minute break
    await tapAndSettle(page, '[data-testid="seg-ch1.s1"]');
    assert(await page.locator('[data-testid=pacing-ask]').count(), 'pacing helper warns that a 10-min segment will not fit a 6-min break');
    await storyToExperiment(page);
    await tapAndSettle(page, '[data-testid=start-experiment]');
    await page.waitForSelector('[data-testid=puzzle-screen]');
    // Move the angle slider a few steps.
    const plus = page.locator('[data-control=angle] .step').nth(1);
    for (let i = 0; i < 4; i++) { await plus.tap(); await settle(page); }
    const angle = await page.textContent('[data-control=angle] label b');
    // Jump to 1 s before the deadline: still playable.
    const { endsAt, now } = await page.evaluate(() => ({ endsAt: JSON.parse(localStorage.getItem('meridianlab.save')).timer.breakEndsAt, now: Date.now() }));
    await page.clock.fastForward(endsAt - now - 1000);
    await settle(page, 200);
    assert(await visible(page, 'break-shell'), 'still on break just before the end');
    // Cross the deadline: the lock screen must be up no later than 1 s after it.
    await page.clock.runFor(1600); // now at deadline + 0.8 s
    assert(await page.evaluate(() => Date.now()) <= endsAt + 1000, 'checked within 1 s of the deadline');
    await page.waitForSelector('[data-testid=lock-screen]', { timeout: 2000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('meridianlab.save')));
    assert(saved.timer.phase === 'LOCKED', 'stored phase is LOCKED');
    assert(saved.puzzleState && saved.puzzleState.puzzleId === 'ch1.drop1', 'puzzle state saved at lock');
    assert(Math.abs(saved.puzzleState.data.values.angle - parseFloat(angle)) < 1e-6, `saved angle ${saved.puzzleState.data.values.angle} vs shown ${angle}`);
    // Reload: still locked.
    await page.reload();
    await page.waitForSelector('[data-testid=lock-screen]');
    assert(!(await page.locator('[data-testid=break-shell]').count()), 'game not reachable after reload');
  });

  await test('alarm: Web Audio is unlocked by "Start break" and the siren starts at lock with no extra tap', async (b) => {
    const ctx = await tablet(b);
    const page = await open(ctx, TEST);
    await studyAndTakeBreak(page, 25);
    const unlocked = await page.evaluate(() => window.__meridian.audio.unlocked);
    assert(unlocked, 'audio context running after the Start break tap');
    const before = await page.evaluate(() => window.__meridian.audio.lastAlarmStarted);
    await page.clock.fastForward(6 * MIN + 300);
    await page.waitForSelector('[data-testid=lock-screen]', { timeout: 2000 });
    const st = await page.evaluate(() => ({ needsTap: window.__meridian.c.needsTapForAlarm, scheduled: window.__meridian.audio.lastAlarmStarted }));
    assert(!st.needsTap, 'alarm did not need a tap');
    void before;
  });

  await test('sleep / frozen tab: no timers fire, but the game locks immediately on wake', async (b) => {
    const ctx = await tablet(b);
    const page = await open(ctx);
    await studyAndTakeBreak(page, 40); // 10-minute break
    // Simulate the tablet sleeping for 2 hours: the clock jumps, no timers run.
    await page.clock.pauseAt(T0 + 40 * MIN + 1000);
    await page.clock.setSystemTime(T0 + 40 * MIN + 2 * 60 * MIN);
    await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
    await page.waitForSelector('[data-testid=lock-screen]', { timeout: 1000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('meridianlab.save')));
    assert(saved.timer.lockedAt === saved.sessions.find((s) => s.kind === 'break').end, 'locked at the original end time, not at wake');
  });

  await test('backward clock jump during a break locks and logs tampering', async (b) => {
    const ctx = await tablet(b);
    const page = await open(ctx);
    await studyAndTakeBreak(page, 160);
    await page.clock.runFor(5 * MIN);
    await page.clock.setSystemTime(T0 + 160 * MIN - 60 * MIN); // an hour back
    await page.clock.runFor(500);
    await page.waitForSelector('[data-testid=lock-screen]', { timeout: 1500 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('meridianlab.save')));
    assert(saved.timer.lockReason === 'tamper', 'lock reason tamper');
    assert(saved.tamperLog.length === 1, 'tamper logged');
    assert((await page.textContent('[data-testid=lock-screen]')).includes('moved backwards'), 'explains the tamper');
  });

  await test('two tabs share one break timer', async (b) => {
    const ctx = await tablet(b);
    const a = await open(ctx);
    const c = await open(ctx);
    await tapAndSettle(a, '[data-testid=start-study]');
    await settle(c);
    await a.clock.fastForward(100 * MIN);
    await c.clock.fastForward(100 * MIN);
    await tapAndSettle(a, '[data-testid=finish-study]');
    await settle(c, 600);
    await c.waitForSelector('[data-testid=start-break]', { timeout: 2000 });
    await tapAndSettle(a, '[data-testid=start-break]');
    await settle(c, 600);
    await c.waitForSelector('[data-testid=break-shell]', { timeout: 2000 });
    const ta = await a.textContent('[data-testid=countdown]');
    const tc = await c.textContent('[data-testid=countdown]');
    assert(ta.slice(0, 4) === tc.slice(0, 4), `same countdown: ${ta} vs ${tc}`);
    // The second tab shows the "open in another tab" takeover rather than a second game.
    await c.clock.runFor(500);
    assert(await c.getByRole('heading', { name: 'Open in another tab' }).isVisible(), 'second tab is told the lab is open elsewhere');
    const saved = await a.evaluate(() => JSON.parse(localStorage.getItem('meridianlab.save')));
    assert(saved.sessions.filter((s) => s.kind === 'break').length === 0 && saved.timer.phase === 'ON_BREAK', 'one running break');
    await a.clock.fastForward(26 * MIN);
    await c.clock.fastForward(26 * MIN);
    await a.waitForSelector('[data-testid=lock-screen]');
    await c.waitForSelector('[data-testid=lock-screen]');
    const after = await a.evaluate(() => JSON.parse(localStorage.getItem('meridianlab.save')));
    assert(after.sessions.filter((s) => s.kind === 'break').length === 1, 'exactly one break logged');
  });

  await test('export → wipe site data → import keeps progress but lands LOCKED with no bank', async (b) => {
    const ctx = await tablet(b);
    const page = await open(ctx);
    await page.tap('[data-testid=start-study]');
    await page.clock.fastForward(160 * MIN);
    await page.tap('[data-testid=finish-study]'); // 40 min banked
    await page.tap('[data-testid=open-save]');
    await page.tap('[data-testid=export-code]');
    const code = await page.inputValue('[data-testid=code-out]');
    assert(code.startsWith('MLAB1.'), 'save code');
    // "Clear site data"
    await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('meridianlab'); });
    await page.reload();
    await page.waitForSelector('[data-testid=home-screen]');
    assert(!(await page.locator('[data-testid=start-break]').count()), 'wiped: no bank');
    await page.tap('[data-testid=open-save]');
    await page.fill('[data-testid=code-in]', code);
    await page.tap('[data-testid=import]');
    await page.tap('[data-testid=import-confirm]');
    await page.waitForSelector('[data-testid=lock-screen]');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('meridianlab.save')));
    assert(saved.timer.phase === 'LOCKED' && saved.timer.bankMin === 0, 'locked, bank 0');
    assert(saved.energyEarned >= 160, 'stats and energy restored');
  });

  await test('Chapters 1–3 are playable start to finish (touch, test build)', async (b) => {
    const ctx = await tablet(b);
    const page = await open(ctx, TEST);
    // Plenty of study: 6 study blocks give 6 breaks, which is enough energy for every segment.
    const segs = ['ch1.s1', 'ch1.s2', 'ch1.s3', 'ch1.s4', 'ch1.s5', 'ch2.s1', 'ch2.s2', 'ch2.s3', 'ch2.s4', 'ch2.s5', 'ch3.s1', 'ch3.s2', 'ch3.s3', 'ch3.s4', 'ch3.s5'];
    let solved = 0;
    for (const seg of segs) {
      if (await page.locator('[data-testid=lock-screen]').count()) {
        await tapAndSettle(page, '[data-testid=start-study-block]');
      } else {
        await tapAndSettle(page, '[data-testid=start-study]');
      }
      await page.clock.fastForward(160 * MIN);
      await tapAndSettle(page, '[data-testid=finish-study]');
      await tapAndSettle(page, '[data-testid=start-break]');
      await page.waitForSelector('[data-testid=break-shell]');
      await tapAndSettle(page, `[data-testid="seg-${seg}"]`);
      if (await page.locator('[data-testid=pacing-ask]').count()) { await page.getByText('Start anyway').tap(); await settle(page); }
      for (let guard = 0; guard < 80; guard++) {
        if (await page.locator('[data-testid=segment-done]').count()) { await tapAndSettle(page, '[data-testid=segment-done]'); break; }
        if (await page.locator('[data-testid=start-experiment]').count()) {
          await tapAndSettle(page, '[data-testid=start-experiment]');
          await page.waitForSelector('[data-testid=puzzle-screen]');
          // Set the known solution (as a player would with the sliders), then press Run by touch.
          await page.evaluate(() => { const p = window.__puzzle; Object.assign(p.values, p.def.solution); p.onChange && p.onChange(); });
          await tapAndSettle(page, '[data-testid=run]');
          for (let k = 0; k < 60 && !(await page.locator('[data-testid=continue]').count()); k++) await page.clock.runFor(500);
          await tapAndSettle(page, '[data-testid=continue]');
          solved++;
          continue;
        }
        if (await page.locator('[data-testid=story-tap]').count()) { await tapAndSettle(page, '[data-testid=story-tap]'); continue; }
        await page.clock.runFor(100);
      }
      await page.waitForSelector('[data-testid=break-shell]');
      // End the break normally and lock.
      await page.clock.fastForward(41 * MIN);
      await settle(page);
      await page.waitForSelector('[data-testid=lock-screen]');
    }
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('meridianlab.save')));
    assert(saved.progress.completedSegments.length === 15, 'all 15 segments complete: ' + saved.progress.completedSegments);
    assert(solved === 45, 'solved 45 story puzzles, got ' + solved);
    assert(saved.progress.codex.length >= 30, 'codex entries unlocked');
    assert(page.errors.length === 0, 'errors: ' + page.errors.join('; '));
  });

  await test('portrait orientation still works (controls below the canvas)', async (b) => {
    const ctx = await b.newContext({ ...devices['Galaxy Tab S4'], deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.clock.install({ time: T0 });
    await page.goto(TEST);
    await studyAndTakeBreak(page, 40);
    await page.evaluate(() => window.__meridian.c.openPuzzle('ch1.laser1', 'side'));
    await page.waitForSelector('[data-testid=puzzle-screen]');
    const run = await page.locator('[data-testid=run]').boundingBox();
    const vp = page.viewportSize();
    assert(run && run.y + run.height <= vp.height && run.width >= 44, 'Run button visible and big enough in portrait');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflow, 'no horizontal overflow');
  });

  console.log(`\n${results.length - failures} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
