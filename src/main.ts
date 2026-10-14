import './style.css';
import {
  parseOctal,
  grundy,
  provePeriod,
  legalMoves,
  applyMove,
  nimSum,
  winningMoves,
  type Octal,
  type Move,
} from './octal.ts';
import results from './results.json';

const PRESETS: [string, string][] = [
  ['0.77', 'Kayles (0.77)'],
  ['0.07', "Dawson's Kayles (0.07)"],
  ['0.137', "Dawson's chess (0.137)"],
  ['0.6', 'Officers (0.6)'],
  ['0.45', '0.45 — periodic after 498'],
  ['0.156', '0.156 — period 349'],
  ['4.344', '4.344 — splits allowed'],
];
const PLAY_N = 256; // Grundy values used for play (rows are far shorter)
const SEQ_N = 8192; // values computed in the browser for the sequence panel

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const gameSel = $<HTMLSelectElement>('gameSel');
const codeIn = $<HTMLInputElement>('codeIn');
const heapsIn = $<HTMLInputElement>('heapsIn');
const youSel = $<HTMLSelectElement>('youSel');
const hintsBox = $<HTMLInputElement>('hints');
const board = document.getElementById('board') as unknown as SVGSVGElement;
const statusEl = $('status');

let game: Octal = parseOctal('0.77');
let g = grundy(game, PLAY_N);
let heaps: number[] = [];
let history: number[][] = [];
let youToMove = true;
let selected: { heap: number; pin: number } | null = null;
let highlight: Move | null = null;
let thinking = 0;

for (const [code, label] of PRESETS) gameSel.add(new Option(label, code));
gameSel.add(new Option('custom code', ''));

const params = new URLSearchParams(location.search);
const startCode = params.get('game') ?? '0.77';
codeIn.value = startCode;
gameSel.value = PRESETS.some(([c]) => c === startCode) ? startCode : '';
heapsIn.value = params.get('heaps') ?? '12';
if (params.get('you') === '2') youSel.value = '2';
if (params.get('hints') === '0') hintsBox.checked = false;

function parseHeaps(): number[] {
  const hs = heapsIn.value
    .split(/[\s,+]+/)
    .map(Number)
    .filter((x) => Number.isInteger(x) && x > 0)
    .map((x) => Math.min(x, 40))
    .slice(0, 8);
  return hs.length ? hs : [12];
}

function setGame(code: string): boolean {
  try {
    game = parseOctal(code);
  } catch {
    statusEl.textContent = `"${code}" is not an octal code (try 0.77 or 4.344).`;
    statusEl.className = 'bad';
    return false;
  }
  codeIn.value = game.code;
  g = grundy(game, PLAY_N);
  renderSeq();
  renderForms();
  return true;
}

function newGame() {
  heaps = parseHeaps();
  history = [];
  selected = null;
  highlight = null;
  youToMove = youSel.value === '1';
  thinking++;
  render();
  if (!youToMove) cpuSoon();
}

function play(m: Move) {
  history.push(heaps);
  heaps = applyMove(heaps, m);
  selected = null;
  highlight = null;
  youToMove = !youToMove;
  render();
  if (!youToMove) cpuSoon();
}

function cpuSoon() {
  const token = ++thinking;
  setTimeout(() => {
    if (token !== thinking || youToMove) return;
    const moves = legalMoves(game, heaps);
    if (!moves.length) return render();
    const wins = winningMoves(game, g, heaps);
    const pool = wins.length ? wins : moves;
    play(pool[Math.floor(Math.random() * pool.length)]);
  }, 450);
}

const describe = (m: Move, n: number) => {
  const pins = m.take === 0 ? `split after pin ${m.left}` : m.take === 1 ? `pin ${m.left + 1}` : `pins ${m.left + 1}–${m.left + m.take}`;
  const rest = [m.left, m.right].filter((x) => x > 0);
  return `row ${m.heap + 1} (${n}): ${m.take === 0 ? pins : `take ${pins}`} → ${rest.length ? rest.join(' + ') : 'nothing'}`;
};

// ---- board -----------------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';
function el(tag: string, attrs: Record<string, string | number>, parent: Element) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.appendChild(e);
  return e;
}

function render() {
  const step = 26;
  const maxLen = Math.max(12, ...heaps);
  const W = 40 + maxLen * step + 70;
  const rowH = 40;
  const H = Math.max(1, heaps.length) * rowH + 12;
  board.setAttribute('viewBox', `0 0 ${W} ${H}`);
  board.replaceChildren();
  const showHints = hintsBox.checked && youToMove;
  const wins = winningMoves(game, g, heaps);
  const lit = new Set<string>();
  for (const m of highlight ? [highlight] : showHints ? wins : [])
    for (let i = m.left; i < m.left + m.take; i++) lit.add(`${m.heap}:${i}`);

  heaps.forEach((n, h) => {
    const y = 6 + h * rowH;
    el('rect', { class: 'row-bg', x: 8, y, width: 32 + n * step, height: rowH - 8, rx: 10 }, board);
    for (let i = 0; i < n; i++) {
      const cls = ['pin'];
      if (selected && selected.heap === h && selected.pin === i) cls.push('sel');
      else if (lit.has(`${h}:${i}`)) cls.push('hint');
      const c = el('circle', { class: cls.join(' '), cx: 24 + i * step + step / 2, cy: y + (rowH - 8) / 2, r: 9 }, board);
      c.addEventListener('click', () => clickPin(h, i));
    }
    if (game.digits[0] & 4)
      for (let i = 1; i < n; i++) {
        const r = el('rect', { class: 'gap', x: 24 + i * step - 4, y: y + 4, width: 8, height: rowH - 16, rx: 3 }, board);
        r.addEventListener('click', () => tryMove({ heap: h, take: 0, left: i, right: n - i }));
      }
    const t = el('text', { class: g[n] === 0 ? 'gval z' : 'gval', x: 44 + n * step, y: y + rowH / 2 + 1 }, board);
    t.textContent = `G=${g[n]}`;
  });

  const x = nimSum(g, heaps);
  const moves = legalMoves(game, heaps);
  if (!moves.length) {
    statusEl.textContent = youToMove ? 'No move left — you lose.' : 'No move left for the computer — you win!';
    statusEl.className = youToMove ? 'bad' : 'good';
  } else if (youToMove) {
    statusEl.textContent = `Your move. Nim-sum ${x}: ${x ? 'you can win from here.' : 'every move hands the computer a win.'}`;
    statusEl.className = '';
  } else {
    statusEl.textContent = `Computer is thinking… (nim-sum ${x})`;
    statusEl.className = '';
  }

  const box = $('moves');
  box.replaceChildren();
  if (!showHints) {
    box.innerHTML = `<p class="fine">${hintsBox.checked ? 'Shown on your turn.' : 'Hints are off.'}</p>`;
  } else if (!wins.length) {
    box.innerHTML = `<p class="fine">None — the nim-sum is 0, so whatever you do the computer can answer.</p>`;
  } else {
    for (const m of wins.slice(0, 8)) {
      const b = document.createElement('button');
      b.className = 'mv';
      b.textContent = describe(m, heaps[m.heap]);
      b.addEventListener('mouseenter', () => ((highlight = m), render()));
      b.addEventListener('mouseleave', () => ((highlight = null), render()));
      b.addEventListener('click', () => play(m));
      box.appendChild(b);
    }
    if (wins.length > 8) box.insertAdjacentHTML('beforeend', `<p class="fine">…and ${wins.length - 8} more.</p>`);
  }
}

function clickPin(heap: number, pin: number) {
  if (!youToMove || !legalMoves(game, heaps).length) return;
  if (!selected || selected.heap !== heap) {
    selected = { heap, pin };
    // a one-pin move needs no second click when it is the only size allowed
    if (!(game.digits.length > 2 || game.digits[0])) tryMove({ heap, take: 1, left: pin, right: heaps[heap] - pin - 1 });
    else render();
    return;
  }
  const a = Math.min(selected.pin, pin);
  const b = Math.max(selected.pin, pin);
  tryMove({ heap, take: b - a + 1, left: a, right: heaps[heap] - b - 1 });
}

function tryMove(m: Move) {
  if (!youToMove) return;
  const ok = legalMoves(game, heaps).some((x) => x.heap === m.heap && x.take === m.take && x.left === m.left);
  if (ok) return play(m);
  selected = null;
  render();
  statusEl.textContent = `Not allowed in ${game.code}: ${describe(m, heaps[m.heap])}. Click the first and last pin of a block.`;
  statusEl.className = 'bad';
}

// ---- sequence panel ----------------------------------------------------------

type Std = (typeof results.standard)[number];
type Solved = (typeof results.solved)[number];
const stdBy = new Map<string, Std>(results.standard.map((s) => [s.code, s]));
const solvedBy = new Map<string, Solved>(results.solved.map((s) => [s.code, s]));
const hue = (v: number) => `hsl(${(v * 47) % 360} 62% ${v === 0 ? 42 : 66}%)`;

function renderSeq() {
  const box = $('seq');
  const seq = grundy(game, SEQ_N);
  const local = provePeriod(seq, game.t);
  const sol = solvedBy.get(game.code);
  const std = stdBy.get(game.code);
  let per: { period: number; preperiod: number } | null = local;
  let how = '';
  if (local) how = `proved here from ${(2 * Math.max(local.preperiod, 1) + 2 * local.period + game.t).toLocaleString()} values, computed in your browser`;
  else if (sol?.period != null) {
    per = { period: sol.period, preperiod: sol.preperiod! };
    how = `proved from ${sol.n!.toLocaleString()} values computed offline (${sol.seconds} s); Flammenkamp: settled ${sol.year}`;
  }
  const head = per
    ? `<dl><dt>period</dt><dd>${per.period.toLocaleString()}</dd><dt>preperiod</dt><dd>${per.preperiod.toLocaleString()}</dd></dl><p class="fine">${how}.</p>`
    : `<p>No period proved from ${SEQ_N.toLocaleString()} values.${
        std && std.literature.period === null && !sol ? ' Flammenkamp lists this game as open.' : ''
      }${sol && sol.period === null ? ` Flammenkamp: period ${sol.literature.period.toLocaleString()}, preperiod ${sol.literature.preperiod.toLocaleString()} (too long to prove here).` : ''}</p>`;
  const cols = per && per.period <= 40 ? Math.max(per.period, 6) : 34;
  const count = Math.min(per ? per.preperiod + 3 * per.period : 340, 374, SEQ_N);
  const cells: string[] = [];
  for (let i = 0; i < count; i++)
    cells.push(
      `<span class="${per && i < per.preperiod ? 'pre' : ''}" style="background:${hue(seq[i])}" title="G(${i}) = ${seq[i]}">${seq[i].toString(36)}</span>`,
    );
  box.innerHTML = `${head}<div class="seqgrid" style="grid-template-columns:repeat(${cols},1fr)">${cells.join('')}</div>
    <p class="fine">G(0) … G(${count - 1}), ${cols} per line${per && per.period <= 40 ? ' (one period per line)' : ''}; outlined cells are the preperiod. Values above 9 are written a, b, c, …</p>`;
}

// ---- table of the 167 standard forms -----------------------------------------

function renderForms() {
  const box = $('forms');
  const proved = results.standard.filter((s) => s.period !== null);
  const agree = results.standard.filter((s) => s.agree).length;
  const solvedRun = results.solved.filter((s) => s.n !== null);
  const rows = results.standard
    .map((s) => {
      const sol = solvedBy.get(s.code);
      const p = s.period ?? sol?.period ?? null;
      const v = s.preperiod ?? sol?.preperiod ?? null;
      const ok = s.agree && (!sol || sol.agree !== false);
      return `<tr data-code="${s.code}" class="${s.code === game.code ? 'here' : ''}"><td>${s.code}</td><td>${p ?? '—'}</td><td>${v ?? '—'}</td><td class="${ok ? 'ok' : 'ng'}">${ok ? '✓' : '✗'}</td></tr>`;
    })
    .join('');
  box.innerHTML = `<p class="fine" style="margin-top:0">${results.compendium.codes.toLocaleString()} codes reduce to ${results.standard.length} distinct games.
    ${proved.length} periods proved from 32,768 values each; ${solvedRun.filter((s) => s.agree).length} of ${solvedRun.length} later-settled games reproduced from up to ${Math.max(...solvedRun.map((s) => s.n!)).toLocaleString()} values;
    ${agree} of ${results.standard.length} rows agree with Flammenkamp (period, preperiod, max, P-positions, first 40 values). Click a row to play it.</p>
    <div class="tablewrap"><table class="forms"><thead><tr><th>game</th><th>period</th><th>preperiod</th><th>lit.</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  box.querySelectorAll('tr[data-code]').forEach((tr) =>
    tr.addEventListener('click', () => {
      const code = (tr as HTMLElement).dataset.code!;
      gameSel.value = PRESETS.some(([c]) => c === code) ? code : '';
      if (setGame(code)) newGame();
    }),
  );
}

gameSel.addEventListener('change', () => {
  if (gameSel.value && setGame(gameSel.value)) newGame();
});
codeIn.addEventListener('change', () => {
  gameSel.value = '';
  if (setGame(codeIn.value)) newGame();
});
heapsIn.addEventListener('change', newGame);
youSel.addEventListener('change', newGame);
hintsBox.addEventListener('change', render);
$('newgame').addEventListener('click', newGame);
$('undo').addEventListener('click', () => {
  // undo back to the last position where it was your move
  thinking++;
  while (history.length) {
    heaps = history.pop()!;
    youToMove = !youToMove;
    if (youToMove) break;
  }
  selected = null;
  render();
  if (!youToMove) cpuSoon();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') ((selected = null), render());
});

if (!setGame(startCode)) setGame('0.77');
newGame();
