// Octal games: take-and-break games on heaps, coded as d0.d1d2d3...
// Digit d_k says what may be left after removing k tokens from one heap:
//   bit 1 — nothing (the heap had exactly k tokens)
//   bit 2 — one non-empty heap
//   bit 4 — two non-empty heaps
// d0 may only be 0 or 4 (4 = split a heap in two without removing anything).
// Normal play: the player who cannot move loses.

export interface Octal {
  code: string;
  digits: number[]; // digits[k] for k = 0..t, digits[t] != 0
  t: number; // largest number of tokens a move can remove
}

export function parseOctal(input: string): Octal {
  const s = input.trim();
  const m = /^([04]?)\.([0-7]+)$/.exec(s);
  if (!m) throw new Error(`not an octal code: "${input}"`);
  const digits = [Number(m[1] || '0'), ...m[2].split('').map(Number)];
  while (digits.length > 1 && digits[digits.length - 1] === 0) digits.pop();
  const t = digits.length - 1;
  const frac = digits.slice(1).join('');
  return { code: `${digits[0]}.${frac || '0'}`, digits, t };
}

/** Grundy values G(0..n-1). Plain mex over every option, O(n^2) for split digits. */
export function grundy(game: Octal, n: number): Uint16Array {
  const g = new Uint16Array(n);
  let seen = new Int32Array(1024).fill(-1);
  const { digits, t } = game;
  for (let h = 0; h < n; h++) {
    for (let k = 0; k <= t && k <= h; k++) {
      const d = digits[k];
      if (d === 0) continue;
      const r = h - k;
      if (d & 1 && r === 0) seen[0] = h;
      if (d & 2 && r >= 1) seen[g[r]] = h;
      if (d & 4 && r >= 2) {
        for (let a = 1, b = r - 1; a <= b; a++, b--) seen[g[a] ^ g[b]] = h;
      }
    }
    let v = 0;
    while (seen[v] === h) v++;
    g[h] = v;
    if (2 * v >= seen.length) {
      const bigger = new Int32Array(seen.length * 2).fill(-1);
      bigger.set(seen);
      seen = bigger;
    }
  }
  return g;
}

export interface Periodicity {
  period: number;
  preperiod: number;
  /** values that must be checked for the Guy–Smith argument: 2·max(v,1) + 2p + t */
  needed: number;
}

/**
 * Smallest period p (and its smallest preperiod v) that the octal periodicity
 * theorem proves from g alone: if G(n+p) = G(n) for max(v,1) <= n < 2max(v,1)+p+t,
 * it holds for every n >= v. Returns null when no period is provable from these values.
 */
export function provePeriod(g: Uint16Array, t: number, maxPeriod = g.length >> 1): Periodicity | null {
  const n = g.length;
  for (let p = 1; p <= maxPeriod && 2 + 2 * p + t <= n; p++) {
    let last = -1;
    for (let i = n - 1 - p; i >= 0; i--) {
      if (g[i + p] !== g[i]) {
        last = i;
        break;
      }
    }
    const v = last + 1;
    const needed = 2 * Math.max(v, 1) + 2 * p + t;
    if (needed <= n) return { period: p, preperiod: v, needed };
  }
  return null;
}

export interface Summary {
  max: number;
  /** zeros per period (infinitely many P-positions) or, if the period has none, the finite count */
  lost: { perPeriod: boolean; count: number };
}

/** Max Grundy value and P-position count of a game whose period has been proven. */
export function summarize(g: Uint16Array, per: Periodicity): Summary {
  const end = per.preperiod + per.period;
  let max = 0;
  for (let i = 0; i < end; i++) if (g[i] > max) max = g[i];
  let inPeriod = 0;
  for (let i = per.preperiod; i < end; i++) if (g[i] === 0) inPeriod++;
  if (inPeriod > 0) return { max, lost: { perPeriod: true, count: inPeriod } };
  let finite = 0;
  for (let i = 0; i < per.preperiod; i++) if (g[i] === 0) finite++;
  return { max, lost: { perPeriod: false, count: finite } };
}

/** Grundy values written as one character each, 0-9 then a-z (Flammenkamp's format). */
export function digitsString(g: ArrayLike<number>, count: number): string {
  let s = '';
  for (let i = 0; i < count && i < g.length; i++) s += g[i].toString(36);
  return s;
}

// ---- positions: a row of heaps, played as rows of pins ----------------------

export interface Move {
  heap: number; // index into the heaps array
  take: number; // tokens removed (0 only for d0 = 4)
  left: number; // heap left of the removed block
  right: number; // heap right of the removed block
}

/** Every legal move, with the removed block placed at offset `left` inside the heap. */
export function legalMoves(game: Octal, heaps: number[]): Move[] {
  const out: Move[] = [];
  heaps.forEach((h, heap) => {
    for (let k = 0; k <= game.t && k <= h; k++) {
      const d = game.digits[k];
      if (d === 0) continue;
      const r = h - k;
      for (let left = 0; left <= r; left++) {
        const right = r - left;
        const parts = (left > 0 ? 1 : 0) + (right > 0 ? 1 : 0);
        if (parts === 0 && !(d & 1)) continue;
        if (parts === 1 && !(d & 2)) continue;
        if (parts === 2 && !(d & 4)) continue;
        out.push({ heap, take: k, left, right });
      }
    }
  });
  return out;
}

export function applyMove(heaps: number[], m: Move): number[] {
  const parts = [m.left, m.right].filter((x) => x > 0);
  return [...heaps.slice(0, m.heap), ...parts, ...heaps.slice(m.heap + 1)];
}

export function nimSum(g: ArrayLike<number>, heaps: number[]): number {
  let x = 0;
  for (const h of heaps) x ^= g[h];
  return x;
}

/** Moves to a position of nim-sum 0 (the winning moves), given enough Grundy values. */
export function winningMoves(game: Octal, g: ArrayLike<number>, heaps: number[]): Move[] {
  return legalMoves(game, heaps).filter((m) => nimSum(g, applyMove(heaps, m)) === 0);
}
