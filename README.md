# Meridian Lab

A story-driven physics lab adventure for **study breaks**, with a hard study lock built in.

You study, which earns break time and charges the lab's reactor. You take a break, restoring a half-abandoned research station by solving physics puzzles that are accurately simulated. When the break ends, the game **saves mid-puzzle, sounds an alarm, vibrates and locks itself** until you finish another study block.

- 6 puzzle families: projectiles, laser routing (ray optics), particle steering (E/B fields), circuit repair, mechanisms (Newton's laws, friction, Atwood, collisions, torque), and oscillation sync (SHM, resonance)
- Chapters 1–3 (“Cold Start”, “Reserve Power”, “The Orbital Garden”): 15 segments, 45 story puzzles, plus 7 side experiments. Outline for Chapters 4–6 in `src/content/chapters/outline.ts`
- Touch only. Ships as **one self-contained `index.html`** that runs offline from `file://`
- Optional GitHub Pages build with Wake Lock, notifications and Add to Home Screen

---

## 1. Run it on your computer

Needs Node 20+.

```bash
npm install
```

```bash
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). Chrome DevTools' device toolbar with touch emulation is the closest thing to the tablet.

```bash
npm run build
```

`npm run build` type-checks, builds, and checks that **`dist/index.html` is a single file with no external references**. This is the file that goes on the tablet.

### Tests

```bash
npm test
```

The unit tests cover the state machine, storage, tabs, physics against analytical answers, and that every puzzle is solvable.

```bash
npm run build && npm run build:test && npm run e2e
```

The e2e tests run the built file over `file://`, offline, on an emulated touch tablet.

| Suite | What it checks |
|---|---|
| `tests/unit/machine.test.ts` | Earning rules and caps, every transition, reload, sleep (large time jumps), backward clock jump (tampering), two tabs sharing one timer, import → LOCKED, update-safe loading of old or partial saves, delayed loosening of rules, streaks |
| `tests/unit/physics/physics.test.ts` | Range `u²sin2θ/g`, max height, minimum-speed launch, mirror reflection, lens `1/v − 1/u = 1/f`, concave mirror focus, Snell's law and slab shift, critical angle and TIR, prism minimum deviation, `r = mv/qB`, `T = 2πm/qB`, helix pitch, velocity selector `v = E/B`, series/parallel, Kirchhoff, Wheatstone balance, RC charging, incline plus friction, Atwood, collisions with restitution, torque, pendulum (small-angle and exact), spring–mass, driven resonance amplitude, string harmonics |
| `tests/unit/puzzles.test.ts` | Every puzzle's known solution wins, its starting setting fails, its save round-trips, and some puzzles reward understanding (complementary angles, TIR needs n > √2, and so on) |
| `tests/e2e/run.cjs` | Loads offline with no errors, no game while studying (even after a reload), lock within 1 s of the deadline with the puzzle saved, alarm with no extra tap, sleep, clock tampering, two tabs, export → wipe → import, **a full playthrough of Chapters 1–3 by touch**, portrait layout |

---

## 2. Put it on the Android tablet (primary route: one file)

1. Run `npm run build` on your computer.
2. Copy **`dist/index.html`** to the tablet (USB cable, or any app you're allowed to use for files). Put it somewhere permanent, for example `Internal storage/Documents/MeridianLab/index.html`.
3. On the tablet, open the file manager, tap `index.html`, and choose **Chrome** (or whichever browser works).
4. Optional: bookmark the page, or add it to the home screen from Chrome's menu, so you always open the same copy.
5. In the tablet's **Settings → Display → Screen timeout**, choose more than 40 minutes. Opened from a file, the page can't keep the screen awake by itself. The game reminds you once.

### Updating without losing your save

Your save is stored in the browser and belongs to the file's **exact location**, not to the file itself.

- To update, **copy the new `index.html` over the old one: same folder, same file name.** Open it the same way (same file manager, same browser). Your progress, stats and lock state are all kept.
- The save format is versioned (`SCHEMA` in `src/core/save.ts`). A newer game upgrades older saves automatically and keeps a `.bak` copy first, and missing fields are filled with defaults.
- **Don't** rename the file, move it to a different folder, or open it through a different app. Android file managers sometimes open files as `content://…` URLs, and a different path or app means a different (empty) save.
- **Make a backup now and then:** Hub → *Save backup* → *Copy save code* (paste it into a note or a message to yourself) or *Download .json file*.

If the browser data is ever cleared, open the game, go to *Save backup*, paste the code (or choose the file) and tap *Import*. Your story, Lab Notes and stats come back. **An import always lands in the locked state with no banked break**, so restoring a backup can never be used to skip a study block.

---

## 3. GitHub Pages (optional route: one whitelisted URL)

The same build also deploys to GitHub Pages. Over HTTPS the game additionally uses:

- **Wake Lock**, which keeps the screen on during a break
- **Notifications** through a service worker, so "Break over" shows up if you switched away
- **Add to Home Screen / install** (PWA, works offline after the first visit)

Setup:

1. Create a GitHub repository, for example `meridian-lab`, and push this project to its `main` branch.
2. In the repository, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` runs `.github/workflows/pages.yml` (tests, build, deploy).

**The URL for the admin to whitelist is:**

```
https://<your-github-username>.github.io/<repository-name>/
```

For this repository, that is **`https://janesh169.github.io/meridian-lab/`**. The game loads nothing from any other host. Everything (the service worker, manifest and icons) is under that same path.

Note: the HTTPS copy and the `file://` copy keep **separate saves**. To move between them, use *Save backup* (export from one, import into the other).

---

## 4. How the study/break loop works

```
IDLE ──start study──► STUDYING ──finish (≥25 min)──► BREAK_AVAILABLE ──start break──► ON_BREAK
  ▲                      │ finish (<25 min)                                              │ time up
  └──────────────────────┘                                                               ▼
                         STUDYING (lock block) ◄──── start study block ───────────── LOCKED
                         └─ finish ≥25 min: unlocked · finish <25 min: back to LOCKED
```

- **Earning:** 1 min of break per 4 min of study, nothing under 25 min, capped at 40 min. The bank never goes past the cap.
- **During study** the game shows only the study timer, the break earned so far and a calm MOSS line. The game screens aren't rendered at all.
- **During a break** the countdown is always visible. At 5 min and 1 min left, MOSS warns you in character, the HUD flashes and a soft chime plays.
- **At 0** the open puzzle is saved synchronously, then the alarm sounds (a square-wave siren that nothing else in the game uses), the tablet vibrates, and the full-screen lock appears. The alarm repeats every 60 s until you start a study block, and there's no in-game mute.
- **Overrun:** starting the study block more than 3 minutes after the lock (`overrunGraceMin`) marks that break as an overrun, which breaks your streak.
- **Ending a break early** forfeits the rest (no hoarding).

### Robustness

- All timers are **absolute timestamps** saved in storage. The app re-checks the clock every 250 ms, at the exact deadline, and on `visibilitychange` / `focus` / `pageshow` / `resume`. It never counts time, so reloads, closed tabs and sleep can't stretch a break.
- **Backward clock jumps** of more than 2 min lock the game, void any running study session and the bank, and are logged (shown in Stats).
- **Several tabs** share one save with a revision counter (BroadcastChannel, plus storage polling as a fallback), so there is only ever one break timer. Only one tab plays at a time; the other gets an "open in another tab" screen.
- **Clearing site data** is the one bypass a browser can't stop. It costs you all story progress, and restoring from a backup lands you in the lock.
- A copy of the save is mirrored to IndexedDB. If only `localStorage` is cleared, it comes back automatically.

### Things a web page can't guarantee (read this)

- **Sound and vibration while the screen is off or the tab is in the background** depend on Android. The game *is* locked the instant the time is up (that is just a timestamp comparison), and the alarm fires the moment you return. To keep it audible on time, it (a) pre-schedules the siren on the Web Audio clock, (b) plays a quiet lab-ambience loop during breaks (Chrome doesn't freeze tabs that are playing audio; you can turn it off in Settings), and (c) uses Wake Lock over HTTPS. **Check this on your tablet** with the checklist below.
- After a **reload**, Android allows no sound until you tap the screen. A reloaded lock screen flashes red, and your first tap starts the alarm.
- The game can't override the **tablet's volume buttons** or system mute.
- **Notifications** (HTTPS only) come from the page while it's alive. With no server, a service worker can't wake itself at a set time.
- **Moving the clock forward** while the game is closed looks the same as time passing, so it could fake a finished study session. Studying is ultimately on your honour: the game can't see your books.

### 2-minute on-device checklist

Do this once on the tablet, with the **test build** (`npm run build:test` → `dist-test/index.html`). It has a *Grant a 2-minute break* button in Settings. Never ship that file as your real copy.

1. Open the test file, go to Settings, tap **Grant a 2-minute break**, then go back and tap **Start 2-minute break**.
2. Start a puzzle and move a slider. Then **turn the screen off** with the power button and wait 2½ minutes.
3. Did the alarm sound with the screen off? Turn the screen on: the lock screen should be up, and when you reopen the puzzle later the slider should be where you left it.
4. Repeat with *Lab ambience* turned off in Settings to see whether your tablet needs it.

---

## 5. Changing the numbers

Everything is in **`src/config.ts`**:

- `DEFAULT_RULES`: study:break ratio (`studyMinPerBreakMin`), minimum session, 40-min cap, lock-release block length, overrun grace, streak threshold, warning times
- `ENGINE`: tick rate, clock-jump tolerance, alarm repeat and length, vibration pattern, autosave interval
- `RULE_LIMITS`: the ranges the in-game Settings screen allows

The rules are copied into your save on first run and can also be changed **in-game** (Settings, only while idle). Changes that make the rules stricter apply immediately, and changes that loosen them take effect **24 hours later**.

---

## 6. Adding content

All content is data. The engine code doesn't change.

### A new puzzle

1. Add a `PuzzleDef` to `src/content/puzzles/ch1.ts` (or a new file imported in `src/puzzles/index.ts`). Pick a `type`: `projectile`, `laser`, `particle`, `circuit`, `incline`, `atwood`, `collision`, `torque`, `rolling`, `puck`, `governor`, `pendulum`, `spring` or `resonance`. Copy a similar puzzle and edit `params` (all SI units), `initial`, `solution`, `hints`, `estMinutes` and an optional `bonus`.
2. Add its concept to `src/content/codex.ts` and point the puzzle's `codex` field at it.
3. Run `npm test`. The puzzle test checks that your `solution` wins, `initial` fails, and every value sits on its slider grid. To explore win ranges, temporarily copy a loop from `tests/unit/puzzles.test.ts`.

### A new side experiment

Add an entry to `src/content/puzzles/side.ts`, with `unlockAfter` set to the story puzzle that unlocks it.

### A new chapter

1. Create `src/content/chapters/ch2.ts` in the same shape as `ch1.ts`: segments of about 8–12 min, each a list of nodes (`line`, `log`, `puzzle`, `reward`, `end`).
2. Register it in `src/content/chapters/index.ts` (`CHAPTERS = [CH1, CH2]`), and add any new upgrades to `UPGRADES`.
3. End every segment on an `end` node with a cliffhanger, so the hook is "next break", not "five more minutes".

### A new puzzle type

Subclass `Puzzle` in `src/puzzles/framework.ts` (implement `view`, `controls`, `start`, `advance`, `draw`, optionally pointer handlers), then call `registerPuzzleType('name', Class)` and import the file in `src/puzzles/index.ts`. Put the physics in `src/physics/` with analytical tests.

---

## 7. Project layout

```
src/
  config.ts              all tunable numbers
  core/                  pure logic: state machine, save schema and migrations, store and tab sync, stats, save codes
  app/                   browser glue: lifecycle (ticks, lock sequence, wake lock), platform detection, screens
  audio/engine.ts        synthesised sound: SFX, ambience, alarm (no audio files)
  physics/               simulators: projectile, optics, em, circuits, mechanics, oscillations
  puzzles/               framework and the puzzle types (types/*.ts)
  render/draw.ts         world-space canvas drawing with SI units and glow
  input/                 touch widgets and the gesture-aware puzzle canvas
  story/                 story engine and pacing
  content/               chapters, puzzles, codex, MOSS lines (all data)
public/                  service worker, manifest, icons (used over HTTPS only)
tests/unit, tests/e2e
.github/workflows/pages.yml
```

The physics is written from scratch, with no game-physics engine:

- **Projectiles** use the exact closed-form solution.
- **Optics** is exact ray tracing: true circular mirrors, an ideal thin lens, and Snell's law with TIR.
- **Charged particles** use the Boris pusher, which conserves energy exactly in a magnetic field.
- **Circuits** use modified nodal analysis, with backward-Euler stepping for capacitors.
- **Inclines** use closed-form piecewise kinematics; **rolling bodies** use a = g sinθ/(1+k) with a friction check for skidding.
- **Air-table pucks** use impulse collisions along the line of centres, with restitution.
- **The flyball governor** solves the arm's equation of motion in the rotating frame (RK4).
- **The pendulum** is the full nonlinear equation solved with RK4.
