// Compare the measured runs with Flammenkamp's tables and write src/results.json.
//   runs/standard.jsonl — the 167 standard forms, 32,768 values each
//   runs/solved.jsonl   — the "known structure" games, as many values as Guy–Smith needs
// It also recomputes all 1,024 codes with at most three digits (2,048 values each)
// and checks that each one equals, up to a shift of the index, the standard form
// the compendium maps it to.
// Usage: node tools/build-table.mts
import { readFileSync, writeFileSync } from 'node:fs';
import { parseOctal, grundy } from '../src/octal.ts';

const lit = JSON.parse(readFileSync('src/literature.json', 'utf8'));
const readJsonl = (f: string) =>
  readFileSync(f, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

const ours = new Map(readJsonl('runs/standard.jsonl').map((r) => [r.code, r]));
const standard = lit.standard.map((s: any) => {
  const r = ours.get(s.code);
  if (!r) throw new Error(`missing run for ${s.code}`);
  const solvedHere = r.period !== null;
  const known = s.period !== null;
  let agree: boolean;
  if (known && solvedHere)
    agree =
      r.period === s.period &&
      r.preperiod === s.preperiod &&
      r.max === s.max &&
      r.lost.count === s.lost &&
      r.lost.perPeriod === s.lostPerPeriod &&
      r.first40 === s.first40;
  else agree = r.first40 === s.first40 && !(known && !solvedHere);
  return {
    code: s.code,
    period: r.period,
    preperiod: r.preperiod,
    max: r.max,
    lost: r.lost,
    literature: { period: s.period, preperiod: s.preperiod, max: s.max, lost: s.lost, lostPerPeriod: s.lostPerPeriod },
    first40: r.first40,
    agree,
  };
});

const solvedRuns = new Map(readJsonl('runs/solved.jsonl').map((r) => [r.code, r]));
const solved = lit.solved.map((s: any) => {
  const r = solvedRuns.get(s.code);
  return {
    code: s.code,
    year: s.year,
    literature: { period: s.period, preperiod: s.preperiod },
    n: r?.n ?? null,
    period: r?.period ?? null,
    preperiod: r?.preperiod ?? null,
    max: r?.max ?? null,
    seconds: r?.seconds ?? null,
    agree: r ? r.period === s.period && r.preperiod === s.preperiod : null,
  };
});

// compendium: every code vs its standard form. "exact" = equal up to an index
// shift of at most 4; otherwise look for a standard form whose values agree after
// the first few (the tails are the same game, the starts are not).
const LEN = 2048;
const cache = new Map<string, Uint16Array>();
const seq = (code: string) => {
  let g = cache.get(code);
  if (!g) cache.set(code, (g = grundy(parseOctal(code), LEN)));
  return g;
};
/**
 * Smallest m such that a[n] = b[n+s] for all n >= m, over shifts |s| <= 4 (m <= 8).
 * A shifted sequence is padded with zeros in front (G(0) = 0 for every game).
 */
function relation(a: Uint16Array, b: Uint16Array): { shift: number; prefix: number } | null {
  let best: { shift: number; prefix: number } | null = null;
  for (const s of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
    let last = -1;
    for (let n = 0; n < LEN && n + s < LEN; n++) if (a[n] !== (n + s >= 0 ? b[n + s] : 0)) last = n;
    const prefix = last + 1;
    if (prefix <= 8 && (!best || prefix < best.prefix)) best = { shift: s, prefix };
  }
  return best;
}
const stdCodes: string[] = lit.standard.map((s: any) => s.code);
const stdSet = new Set(stdCodes);
const shifts: Record<string, number> = {};
const near: { code: string; compendium: string; form: string; shift: number; prefix: number }[] = [];
for (const [code, target] of Object.entries(lit.compendium as Record<string, string>)) {
  const r = stdSet.has(target) ? relation(seq(code), seq(target)) : null;
  if (r && r.prefix === 0) {
    shifts[r.shift] = (shifts[r.shift] ?? 0) + 1;
    continue;
  }
  let best: { form: string; shift: number; prefix: number } | null = null;
  for (const f of stdCodes) {
    const q = relation(seq(code), seq(f));
    if (q && (!best || q.prefix < best.prefix)) best = { form: f, ...q };
  }
  if (!best) throw new Error(`${code}: no standard form shares its tail`);
  near.push({ code, compendium: target, ...best });
}
const orphans = [...new Set(Object.values(lit.compendium as Record<string, string>))].filter((t) => !stdSet.has(t));

const out = {
  source: lit.source,
  standard,
  solved,
  compendium: { codes: Object.keys(lit.compendium).length, length: LEN, exact: Object.values(shifts).reduce((a, b) => a + b, 0), shifts, near, orphans },
};
writeFileSync('src/results.json', JSON.stringify(out) + '\n');

const tally = (xs: any[], f: (x: any) => boolean) => xs.filter(f).length;
console.log(`standard forms: ${standard.length}`);
console.log(`  literature periodic: ${tally(lit.standard, (s: any) => s.period !== null)}, proven here: ${tally(standard, (s: any) => s.period !== null)}`);
console.log(`  agree: ${tally(standard, (s: any) => s.agree)}`);
for (const s of standard.filter((x: any) => !x.agree)) console.log('  DIFF', JSON.stringify(s));
for (const s of standard.filter((x: any) => x.period !== null && x.literature.period === null))
  console.log(`  proven here, open in easy_octal: ${s.code} p=${s.period} v=${s.preperiod}`);
console.log(`solved: ${tally(solved, (s: any) => s.agree)} / ${tally(solved, (s: any) => s.n !== null)} run`);
for (const s of solved) console.log(`  ${s.code} ${JSON.stringify(s)}`);
console.log(`compendium: ${out.compendium.codes} codes, ${out.compendium.exact} equal to their entry up to a shift ${JSON.stringify(shifts)}`);
console.log(`  entries that are not among the ${stdCodes.length} standard forms: ${orphans.join(' ')}`);
for (const m of near) console.log(`  NEAR ${m.code} (compendium ${m.compendium}) = ${m.form} shifted ${m.shift} after its first ${m.prefix} values`);
