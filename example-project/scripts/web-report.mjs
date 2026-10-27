import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarizeTestResults } from '../src/summarize-results.mjs';
import { validateInput } from '../src/validate-input.mjs';
import { readScopedFile } from './scoped-files.mjs';
import { runCases } from './usage-probe.mjs';

// The viewer server runs this file in a new process for every refresh,
// so edits under src/ show up without restarting the server.
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceFile = 'data/test-results.json';
const casesFile = 'operations/usage-cases.json';
const policies = Object.freeze({
  'failed-only': ['failed'],
  'approved-v2': ['failed', 'timed_out', 'not_run'],
});
const caseKey = row => JSON.stringify([row.buildId, row.module, row.caseId]);
const ids = rows => rows.map(row => `${row.module}/${row.caseId}`).join(',');

// Which approved policy the current code's candidates match, judged from the rows themselves.
export function observePolicy(results, summary) {
  const unique = new Map();
  for (const row of results) if (row.buildId === summary.buildId && !unique.has(caseKey(row))) unique.set(caseKey(row), row);
  const actual = ids(summary.rerunCandidates);
  const matches = Object.entries(policies)
    .filter(([, statuses]) => ids([...unique.values()].filter(row => statuses.includes(row.status))) === actual)
    .map(([name]) => name);
  if (matches.length === 1) return matches[0];
  return matches.length ? 'undecidable' : 'other';
}

export async function createDashboardReport(root = projectRoot) {
  const results = JSON.parse(await readScopedFile(root, sourceFile));
  validateInput(results, { buildId: 'WEB-PREVIEW' });
  const buildIds = [...new Set(results.map(result => result.buildId))];
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceFile,
    inputRowCount: results.length,
    builds: buildIds.map(buildId => {
      const summary = summarizeTestResults(results, { buildId });
      const sourceIndexes = results.flatMap((row, index) => row.buildId === buildId ? [index] : []);
      const candidateIndexes = summary.rerunCandidates.map(row => results.indexOf(row));
      return {
        summary,
        sourceRows: sourceIndexes.map(index => results[index]),
        sourceIndexes,
        candidateIndexes,
        candidatesReferenceSource: candidateIndexes.every(index => index >= 0),
        policy: observePolicy(results, summary),
      };
    }),
  };
}

// Same edge cases as `npm run demo`, reduced to what the screen shows.
export async function createCaseReport(root = projectRoot) {
  let fixture;
  try {
    fixture = JSON.parse(await readScopedFile(root, casesFile));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const results = JSON.parse(await readScopedFile(root, fixture.resultsFile));
  return runCases(results, fixture.cases).map(row => ({
    id: row.id, title: row.title, status: row.status, inputSource: row.inputSource, inputCount: row.inputCount,
    candidates: row.actualIds, names: row.actualNames, error: row.error, nextQuestion: row.nextQuestion,
  }));
}

async function readText(root, file) {
  try {
    return (await readScopedFile(root, file)).toString('utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function harness(root, command) {
  const script = resolve(root, 'scripts/harness.mjs');
  const child = spawnSync(process.execPath, [script, command], { cwd: root, encoding: 'utf8', timeout: 10000 });
  const last = (child.stdout || '').trim().split('\n').at(-1);
  try {
    return JSON.parse(last);
  } catch {
    return { status: 'unavailable', errorCode: child.error?.code ?? null };
  }
}

async function latestEvidence(root) {
  let names;
  try {
    names = (await readdir(resolve(root, 'evidence'))).filter(name => /^v2-.*\.json$/.test(name)).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!names.length) return null;
  const record = JSON.parse(await readFile(resolve(root, 'evidence', names.at(-1)), 'utf8'));
  return { file: `evidence/${names.at(-1)}`, status: record.status, tests: record.counts?.tests ?? null, testExitCode: record.testExitCode ?? null };
}

// Read-only look at the learner's own files. It never runs steps, approves, or writes.
export async function createProgressReport(root = projectRoot) {
  const harnessFiles = {};
  for (const file of ['harness/instructions.txt', 'harness/workflow.json', 'harness/run.mjs']) {
    const text = await readText(root, file);
    harnessFiles[file] = text === null ? 'missing' : /TODO/.test(text) ? 'todo' : 'written';
  }
  const learner = await readText(root, 'test/learner.test.mjs');
  const transfer = await readText(root, 'test/transfer.test.mjs');
  const hasScripts = (await readText(root, 'scripts/harness.mjs')) !== null;
  return {
    baseline: (await readText(root, '.baseline/manifest.json')) !== null,
    learnerTests: learner === null ? null : (learner.match(/^\s*test\(/gm) || []).length,
    harnessFiles,
    harnessCheck: hasScripts ? harness(root, 'check') : { status: 'unavailable' },
    harnessStatus: hasScripts ? harness(root, 'status') : { status: 'unavailable' },
    review: (await readText(root, 'review/summarize-results.mjs')) !== null,
    transferPrediction: transfer === null ? null : /const expectedIds = null;/.test(transfer) ? 'not-written' : 'written',
    evidence: await latestEvidence(root),
    workRecord: (await readText(root, 'work-record.json')) !== null,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const root = args[0] === '--root' && args[1] ? resolve(args[1]) : projectRoot;
  const report = await createDashboardReport(root);
  report.cases = await createCaseReport(root);
  report.progress = await createProgressReport(root);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
