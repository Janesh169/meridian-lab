import { describe, expect, it } from 'vitest';
import { allPuzzleDefs, createPuzzle } from '../../src/puzzles';

describe('every puzzle is solvable and not pre-solved', () => {
  for (const def of allPuzzleDefs()) {
    describe(def.id, () => {
      it('known solution wins', () => {
        const p = createPuzzle(def);
        Object.assign(p.values, def.solution);
        const st = p.simulateToEnd(60);
        expect(st, p.message).toBe('win');
      });
      it('starting setting fails', () => {
        const p = createPuzzle(def);
        const st = p.simulateToEnd(60);
        expect(st, p.message).toBe('fail');
        expect(p.message.length).toBeGreaterThan(5);
      });
      it('serialize / restore round-trips controls', () => {
        const p = createPuzzle(def);
        Object.assign(p.values, def.solution);
        p.simulateToEnd(60);
        const q = createPuzzle(def);
        q.restore(JSON.parse(JSON.stringify(p.serialize())));
        expect(q.values).toEqual(p.values);
        expect(q.ghosts.length).toBe(p.ghosts.length);
      });
      it('every control has sane initial and solution values', () => {
        const p = createPuzzle(def);
        for (const c of p.controls()) {
          for (const v of [def.initial[c.id], def.solution[c.id]]) {
            expect(v, c.id).not.toBeUndefined();
            if (c.kind === 'slider') {
              expect(v).toBeGreaterThanOrEqual(c.min);
              expect(v).toBeLessThanOrEqual(c.max);
              // on the slider grid
              const k = (v - c.min) / c.step;
              expect(Math.abs(k - Math.round(k)), `${c.id}=${v} off-grid`).toBeLessThan(1e-6);
            } else {
              expect(c.options.map((o) => o.value)).toContain(v);
            }
          }
        }
      });
    });
  }
});

describe('puzzles reward understanding', () => {
  it('drop1: both complementary angles work (θ and 90°−θ)', () => {
    const def = allPuzzleDefs().find((d) => d.id === 'ch1.drop1')!;
    const wins: number[] = [];
    for (let a = 5; a <= 85; a += 0.5) {
      const p = createPuzzle(def);
      p.values.angle = a;
      if (p.simulateToEnd(30) === 'win') wins.push(a);
    }
    expect(wins.some((a) => a < 45)).toBe(true);
    expect(wins.some((a) => a > 45)).toBe(true);
  });

  it('laser3: an untilted prism turns the beam only if it can totally internally reflect', () => {
    const def = allPuzzleDefs().find((d) => d.id === 'ch1.laser3')!;
    const run = (mat: number) => {
      const p = createPuzzle(def);
      Object.assign(p.values, { ...def.solution, 'P.mat': mat });
      return p.simulateToEnd(10);
    };
    expect(run(1)).toBe('win'); // crown glass, n = 1.52 > √2
    expect(run(0)).toBe('fail'); // water, n = 1.33 < √2: light leaks out of the 45° face
  });

  it('laser2: acrylic cannot shift the beam far enough, flint glass can', () => {
    const def = allPuzzleDefs().find((d) => d.id === 'ch1.laser2')!;
    const winsFor = (mat: number) => {
      const w: number[] = [];
      for (let ang = -40; ang <= 40; ang += 0.5) {
        const p = createPuzzle(def);
        Object.assign(p.values, { 'S.pos': 50, 'S.ang': ang, 'S.mat': mat });
        if (p.simulateToEnd(10) === 'win') w.push(ang);
      }
      return w;
    };
    expect(winsFor(0)).toHaveLength(0);
    expect(winsFor(1).length).toBeGreaterThan(0);
  });
  it('particle1: reversing the field sends the beam the wrong way', () => {
    const def = allPuzzleDefs().find((d) => d.id === 'ch1.part1')!;
    const p = createPuzzle(def);
    Object.assign(p.values, { ...def.solution, B: -def.solution.B });
    expect(p.simulateToEnd(30)).toBe('fail');
  });
});
