// Run measure.mts over a job list in parallel and append each JSON line to the
// output file as soon as it finishes (a killed run keeps what it has).
// Usage: node tools/run-jobs.mts <jobs.txt> <out.jsonl> <parallel>
// Each job line: "<code> <n>". Jobs already in the output file are skipped.
import { spawn } from 'node:child_process';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';

const [jobsFile, outFile, par] = process.argv.slice(2);
const parallel = Number(par ?? 4);
const done = new Set<string>();
if (existsSync(outFile))
  for (const line of readFileSync(outFile, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    done.add(`${r.code} ${r.n}`);
  }
const jobs = readFileSync(jobsFile, 'utf8')
  .split('\n')
  .map((l) => l.trim().split(/\s+/))
  .filter((j) => j.length === 2 && !done.has(j.join(' ')));

let next = 0;
function launch(): Promise<void> {
  if (next >= jobs.length) return Promise.resolve();
  const job = jobs[next++];
  return new Promise<void>((resolve) => {
    const child = spawn(process.execPath, [new URL('./measure.mts', import.meta.url).pathname, ...job], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('close', () => {
      if (out.trim()) appendFileSync(outFile, out.trim() + '\n');
      process.stderr.write(`${job.join(' ')} -> ${out.trim()}\n`);
      resolve();
    });
  }).then(launch);
}
await Promise.all(Array.from({ length: parallel }, launch));
