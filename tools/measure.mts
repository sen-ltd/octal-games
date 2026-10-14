// Compute G(0..n-1) for one octal game, try to prove its period, print one JSON line.
// Usage: node tools/measure.mts <code> <n>
import { parseOctal, grundy, provePeriod, summarize, digitsString } from '../src/octal.ts';

const [code, nArg] = process.argv.slice(2);
const game = parseOctal(code);
const n = Number(nArg);
const t0 = performance.now();
const g = grundy(game, n);
const per = provePeriod(g, game.t);
const seconds = +((performance.now() - t0) / 1000).toFixed(2);
let max = 0;
for (const x of g) if (x > max) max = x;
console.log(
  JSON.stringify({
    code: game.code,
    n,
    period: per?.period ?? null,
    preperiod: per?.preperiod ?? null,
    needed: per?.needed ?? null,
    ...(per ? summarize(g, per) : { max, lost: null }),
    first40: digitsString(g, 40),
    seconds,
  }),
);
