import { describe, expect, it } from 'vitest';
import {
  parseOctal,
  grundy,
  provePeriod,
  summarize,
  digitsString,
  legalMoves,
  applyMove,
  nimSum,
  winningMoves,
  type Octal,
} from './octal.ts';
import literature from './literature.json';
import results from './results.json';

describe('parseOctal', () => {
  it('normalizes codes and rejects anything else', () => {
    expect(parseOctal('.6').code).toBe('0.6');
    expect(parseOctal('0.770').code).toBe('0.77');
    expect(parseOctal('4.344').digits).toEqual([4, 3, 4, 4]);
    expect(parseOctal('0.137').t).toBe(3);
    for (const bad of ['2.5', '0.8', '1.7', 'kayles', '0.'])
      expect(() => parseOctal(bad)).toThrow();
  });
});

describe('Grundy values', () => {
  it('Kayles (0.77): period 12 from n = 71, proved from 168 values', () => {
    const g = grundy(parseOctal('0.77'), 400);
    expect(digitsString(g, 24)).toBe('012314321426412714321467');
    expect(provePeriod(g, 2)).toEqual({ period: 12, preperiod: 71, needed: 168 });
  });

  it("Dawson's Kayles: 0.07 has period 34, and 0.137 is the same game shifted by one", () => {
    const a = grundy(parseOctal('0.07'), 600);
    const b = grundy(parseOctal('0.137'), 600);
    expect(provePeriod(a, 2)).toMatchObject({ period: 34, preperiod: 53 });
    for (let n = 0; n + 1 < 600; n++) expect(b[n]).toBe(a[n + 1]);
  });

  it('does not claim a period it cannot prove', () => {
    // Kayles needs 168 values; 160 is not enough, and no shorter period is provable
    expect(provePeriod(grundy(parseOctal('0.77'), 160), 2)).toBeNull();
    // Officers (0.6) is open: nothing provable in a few thousand values
    expect(provePeriod(grundy(parseOctal('0.6'), 3000), 1)).toBeNull();
  });

  it('a leading 4 splits a heap without removing anything (4.344 matches Flammenkamp)', () => {
    const lit = literature.standard.find((s) => s.code === '4.344')!;
    expect(digitsString(grundy(parseOctal('4.344'), 40), 40)).toBe(lit.first40);
  });

  it('all 74 games Flammenkamp lists as periodic: period, preperiod, max, P-positions, first 40', () => {
    const periodic = literature.standard.filter((s) => s.period !== null);
    expect(periodic).toHaveLength(74);
    for (const s of periodic) {
      const game = parseOctal(s.code);
      const g = grundy(game, 1200);
      const per = provePeriod(g, game.t)!;
      expect([s.code, per.period, per.preperiod]).toEqual([s.code, s.period, s.preperiod]);
      const sum = summarize(g, per);
      expect([s.code, sum.max, sum.lost.count, sum.lost.perPeriod]).toEqual([s.code, s.max, s.lost, s.lostPerPeriod]);
      expect(digitsString(g, 40)).toBe(s.first40);
    }
  });
});

describe('play', () => {
  const kayles = parseOctal('0.77');

  it('generates moves and splits rows', () => {
    // a row of 3 in Kayles: take 1 at three places, take 2 at two places
    expect(legalMoves(kayles, [3])).toHaveLength(5);
    expect(applyMove([5, 4], { heap: 0, take: 1, left: 2, right: 2 })).toEqual([2, 2, 4]);
    expect(applyMove([5, 4], { heap: 1, take: 2, left: 0, right: 2 })).toEqual([5, 2]);
    // Dawson's Kayles can never take a single pin
    expect(legalMoves(parseOctal('0.07'), [1])).toHaveLength(0);
    // 4.344: a row of 4 may be cut into 1+3, 2+2, 3+1 without taking anything
    expect(legalMoves(parseOctal('4.344'), [4]).filter((m) => m.take === 0)).toHaveLength(3);
  });

  function bruteWins(game: Octal, heaps: number[], memo: Map<string, boolean>): boolean {
    const key = [...heaps].sort((a, b) => a - b).join(',');
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const win = legalMoves(game, heaps).some((m) => !bruteWins(game, applyMove(heaps, m), memo));
    memo.set(key, win);
    return win;
  }

  it('nim-sum != 0 exactly when a plain game-tree search says the mover wins', () => {
    for (const code of ['0.77', '0.07', '0.137', '4.344', '0.6']) {
      const game = parseOctal(code);
      const g = grundy(game, 32);
      const memo = new Map<string, boolean>();
      let checked = 0;
      for (let a = 1; a <= 7; a++)
        for (let b = 0; b <= a; b++)
          for (let c = 0; c <= b; c++) {
            const heaps = [a, b, c].filter((x) => x > 0);
            expect([code, heaps, bruteWins(game, heaps, memo)]).toEqual([code, heaps, nimSum(g, heaps) !== 0]);
            checked++;
          }
      expect(checked).toBe(119);
    }
  });

  it('winning moves exist exactly in N-positions and all lead to nim-sum 0', () => {
    const g = grundy(kayles, 64);
    for (const heaps of [[12], [13, 8, 5], [1, 2, 3], [6, 6]]) {
      const wins = winningMoves(kayles, g, heaps);
      expect(wins.length > 0).toBe(nimSum(g, heaps) !== 0);
      for (const m of wins) expect(nimSum(g, applyMove(heaps, m))).toBe(0);
    }
    // the symmetry strategy: a single Kayles row is always a first-player win
    for (let n = 1; n <= 60; n++) expect(g[n]).toBeGreaterThan(0);
  });
});

describe('the measured table (src/results.json)', () => {
  it('every one of the 167 standard forms agrees with Flammenkamp', () => {
    expect(results.standard).toHaveLength(167);
    expect(results.standard.every((s) => s.agree)).toBe(true);
    expect(results.standard.filter((s) => s.period !== null)).toHaveLength(82);
  });

  it('every "known structure" game that was run reproduces its published period', () => {
    const run = results.solved.filter((s) => s.n !== null);
    expect(run).toHaveLength(13);
    for (const s of run) expect([s.code, s.period, s.preperiod]).toEqual([s.code, s.literature.period, s.literature.preperiod]);
  });

  it('1,016 of the 1,024 codes equal their compendium entry up to a shift', () => {
    expect(results.compendium.codes).toBe(1024);
    expect(results.compendium.exact).toBe(1016);
    expect(results.compendium.near.map((x) => x.code)).toEqual(['0.102', '0.112', '0.121', '0.123', '0.131', '0.132', '0.312', '0.331']);
    expect(results.compendium.orphans).toEqual(['0.121', '0.123', '0.132', '0.312', '0.331']);
  });
});
