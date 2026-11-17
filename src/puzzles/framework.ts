/**
 * Puzzle framework. A puzzle is data (PuzzleDef) plus a type class that knows how
 * to simulate and draw it. Every type follows the same loop:
 *   edit (sliders, drag, rotate) → Run → physically accurate simulation → win or fail.
 * Puzzle classes never touch the DOM. They draw onto a canvas through `Draw` and
 * expose their controls as specs that the UI turns into widgets, so they can be
 * tested headless.
 */
import type { Draw, View } from '../render/draw';

export type PuzzleStatus = 'edit' | 'running' | 'win' | 'fail';

export type ControlSpec =
  | { kind: 'slider'; id: string; label: string; min: number; max: number; step: number; unit?: string; fmt?: (v: number) => string; help?: string }
  | { kind: 'choice'; id: string; label: string; options: { value: number; label: string }[]; help?: string };

export interface BonusSpec {
  /** Shown to the player before and after solving, e.g. "Hit it at 15 m/s or less". */
  text: string;
}

export interface PuzzleDef<P = any> {
  id: string;
  type: string;
  title: string;
  /** One-line in-world objective shown above the puzzle. */
  brief: string;
  /** Expected minutes for a first-time player (used by the pacing helper). */
  estMinutes: number;
  params: P;
  /** Initial control values. */
  initial: Record<string, number>;
  /** A known winning setting. Used by tests and by the calibration guide. */
  solution: Record<string, number>;
  /** Concept nudges from MOSS (no formulas), revealed one by one after failed runs. */
  hints: string[];
  codex: string;
  bonus?: BonusSpec & { check: (values: Record<string, number>, runs: number) => boolean };
}

export interface Pt { x: number; y: number }

export abstract class Puzzle<P = any> {
  status: PuzzleStatus = 'edit';
  values: Record<string, number>;
  message = '';
  runs = 0;
  fails = 0;
  bonusEarned = false;
  /** Previous attempts (drawn faint), most recent last. */
  ghosts: Pt[][] = [];
  /** Shown after enough failed runs: part of the correct answer drawn faintly. */
  showGuide = false;
  /** Selected draggable (for the UI to show which object the sliders affect). */
  selected: string | null = null;
  /** Wall-clock milliseconds spent on this puzzle (excluding pauses). */
  elapsedMs = 0;
  /** Sim time since Run. */
  simT = 0;
  onChange: (() => void) | null = null;

  constructor(public def: PuzzleDef<P>) {
    this.values = { ...def.initial };
  }

  get params(): P { return this.def.params; }

  abstract view(): View;
  abstract controls(): ControlSpec[];
  /** Start the simulation for the current values. */
  protected abstract start(): void;
  /** Advance the simulation by dt real seconds. Call finish() when decided. */
  protected abstract advance(dt: number): void;
  abstract draw(d: Draw, t: number): void;
  /** The current attempt's path, saved as a ghost after the run. */
  protected currentPath(): Pt[] | null { return null; }

  set(id: string, v: number): void {
    if (this.status === 'running') return;
    const spec = this.controls().find((c) => c.id === id);
    if (spec && spec.kind === 'slider') {
      v = Math.min(spec.max, Math.max(spec.min, v));
      v = Math.round(v / spec.step) * spec.step;
      v = Number(v.toFixed(6));
    }
    this.values[id] = v;
    if (this.status === 'fail' || this.status === 'win') this.status = this.status === 'win' ? 'win' : 'edit';
    this.changed();
  }

  protected changed(): void {
    this.onChange?.();
  }

  run(): void {
    if (this.status === 'running' || this.status === 'win') return;
    this.status = 'running';
    this.message = '';
    this.runs++;
    this.simT = 0;
    this.start();
    this.changed();
  }

  update(dt: number): void {
    if (this.status !== 'running') return;
    this.advance(dt);
  }

  /** Stop the current run and go back to editing. */
  abort(): void {
    if (this.status !== 'running') return;
    this.status = 'edit';
    this.changed();
  }

  protected finish(win: boolean, message: string): void {
    if (this.status !== 'running') return;
    const path = this.currentPath();
    if (path && path.length > 1) {
      const step = Math.max(1, Math.ceil(path.length / 160));
      const thin = path.filter((_, i) => i % step === 0 || i === path.length - 1).map((q) => ({ x: q.x, y: q.y }));
      this.ghosts.push(thin);
      if (this.ghosts.length > 4) this.ghosts.shift();
    }
    this.status = win ? 'win' : 'fail';
    this.message = message;
    if (win) this.bonusEarned = !!this.def.bonus?.check(this.values, this.runs);
    else {
      this.fails++;
      if (this.fails >= 6) this.showGuide = true;
    }
    this.changed();
  }

  /** Back to editing after a failed run. */
  retry(): void {
    if (this.status === 'fail') {
      this.status = 'edit';
      this.changed();
    }
  }

  /** Hint text for the current number of failures (null if none yet). */
  hint(): string | null {
    const h = this.def.hints;
    if (!h.length || this.fails < 3) return null;
    const idx = Math.min(h.length - 1, Math.floor((this.fails - 3) / 2));
    return h[idx];
  }

  canSkip(): boolean {
    return this.fails >= 10;
  }

  stars(): number {
    if (this.status !== 'win') return 0;
    return 1 + (this.runs <= 3 ? 1 : 0) + (this.bonusEarned ? 1 : 0);
  }

  /* Pointer interaction in world coordinates. Return true if handled. */
  pointerDown(_p: Pt, _pxPerM: number): boolean { return false; }
  pointerMove(_p: Pt): void {}
  pointerUp(): void {}
  /** Two-finger twist on the selected object (radians). */
  twist(_dAngle: number): boolean { return false; }

  serialize(): unknown {
    return { values: this.values, ghosts: this.ghosts.map((g) => g.map((p) => [round4(p.x), round4(p.y)])), fails: this.fails, showGuide: this.showGuide };
  }

  restore(data: any): void {
    if (!data || typeof data !== 'object') return;
    if (data.values) for (const k of Object.keys(this.values)) if (typeof data.values[k] === 'number') this.values[k] = data.values[k];
    if (Array.isArray(data.ghosts)) this.ghosts = data.ghosts.map((g: [number, number][]) => g.map(([x, y]) => ({ x, y })));
    if (typeof data.fails === 'number') this.fails = data.fails;
    this.showGuide = !!data.showGuide;
  }

  /** Headless helper for tests: run to completion. */
  simulateToEnd(maxSeconds = 120, dt = 1 / 60): PuzzleStatus {
    this.run();
    let t = 0;
    while (this.status === 'running' && t < maxSeconds) {
      this.update(dt);
      t += dt;
    }
    return this.status;
  }
}

function round4(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

export type PuzzleCtor = new (def: PuzzleDef) => Puzzle;

const registry = new Map<string, PuzzleCtor>();
export function registerPuzzleType(type: string, ctor: PuzzleCtor): void {
  registry.set(type, ctor);
}
export function createPuzzle(def: PuzzleDef): Puzzle {
  const C = registry.get(def.type);
  if (!C) throw new Error('Unknown puzzle type ' + def.type);
  return new C(def);
}
export function registeredTypes(): string[] {
  return [...registry.keys()];
}

/** Format helpers for control labels. */
export const fmt = {
  deg: (v: number) => `${v.toFixed(v % 1 ? 1 : 0)}°`,
  unit: (u: string, d = 1) => (v: number) => `${v.toFixed(d)} ${u}`,
};
