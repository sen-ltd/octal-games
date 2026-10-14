// Download Achim Flammenkamp's octal-game tables and keep the facts we check
// against in src/literature.json.
// Usage: node tools/literature.mts   (raw files are cached in data/, not committed)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseOctal } from '../src/octal.ts';

const BASE = 'http://wwwhomes.uni-bielefeld.de/achim/';
mkdirSync('data', { recursive: true });

async function fetchCached(name: string): Promise<string> {
  const path = `data/${name}`;
  if (!existsSync(path)) {
    const res = await fetch(BASE + name);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    writeFileSync(path, await res.text());
  }
  return readFileSync(path, 'utf8');
}

const norm = (code: string) => parseOctal(code.startsWith('.') ? '0' + code : code).code;

// easy_octal.txt: the 167 standard forms with at most 3 digits.
// "0.07   p=34 v= 53  max = 9   lost = *5  0011203110332240..." (solved), or
// "0.04               max >=33  lost >=28  0000111220331110..." (non-trivial).
const standard = (await fetchCached('easy_octal.txt'))
  .split('\n')
  .filter((l) => l.trim())
  .map((line) => {
    const code = norm(line.slice(0, 7).trim());
    const first40 = line.trim().split(/\s+/).pop()!;
    const p = /p=\s*(\d+)\s+v=\s*(\d+)/.exec(line);
    const max = /max\s*(>=|=)\s*(\d+)/.exec(line)!;
    const lost = /lost\s*(>=|=)\s*(\*?)(\d+)/.exec(line)!;
    return {
      code,
      period: p ? Number(p[1]) : null,
      preperiod: p ? Number(p[2]) : null,
      max: Number(max[2]),
      maxIsLowerBound: max[1] === '>=',
      lost: Number(lost[3]),
      lostPerPeriod: lost[2] === '*',
      lostIsLowerBound: lost[1] === '>=',
      first40,
    };
  });

// comp_octal.txt: every code 0.abc / 4.abc mapped to its standard form ("---" = itself).
const compendium: Record<string, string> = {};
for (const line of (await fetchCached('comp_octal.txt')).split('\n')) {
  const m = /^([04])\.([0-7])([0-7])d\s+(.*)$/.exec(line.trim());
  if (!m) continue;
  const cells = m[4].trim().split(/\s+/);
  if (cells.length !== 8) continue;
  cells.forEach((cell, d) => {
    const code = norm(`${m[1]}.${m[2]}${m[3]}${d}`);
    compendium[code] = cell === '---' ? code : norm(cell);
  });
}

// octal.html: non-trivial games whose period was later found ("known structure").
const html = await fetchCached('octal.html');
const section = html.slice(html.indexOf('Nontrivial Octal-Games with known Structur'));
const solved: { code: string; period: number; preperiod: number; year: string }[] = [];
for (const row of section.split('<tr>')) {
  const cells = row
    .split('<td')
    .slice(1)
    .map((c) => c.replace(/^[^>]*>/, '').replace(/<[^>]*>/g, '').trim());
  if (cells.length < 13) continue;
  if (!/^[04]?\.\d+$/.test(cells[0])) continue;
  solved.push({ code: norm(cells[0]), period: Number(cells[1]), preperiod: Number(cells[2]), year: cells[12] });
  if (cells[0] === '4.406') break;
}

writeFileSync(
  'src/literature.json',
  JSON.stringify({ source: BASE + 'octal.html', fetched: new Date().toISOString().slice(0, 10), standard, compendium, solved }, null, 1) + '\n',
);
console.error(`standard ${standard.length}, compendium ${Object.keys(compendium).length}, solved ${solved.length}`);
