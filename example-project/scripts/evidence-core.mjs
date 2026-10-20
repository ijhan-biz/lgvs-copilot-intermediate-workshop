import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { readScopedFile, sha256 } from './scoped-files.mjs';

export const evidenceFiles = Object.freeze([
  'src/summarize-results.mjs', 'src/summary-core.mjs', 'src/validate-input.mjs', 'test/contract-suite.mjs',
  'test/v2.test.mjs', 'data/test-results.json', 'package.json',
  'scripts/evidence.mjs', 'scripts/evidence-core.mjs', 'scripts/scoped-files.mjs',
]);
const labels = { tests: 'tests', passed: 'pass', failed: 'fail', skipped: 'skipped', todo: 'todo', cancelled: 'cancelled' };

export function parseCounts(output) {
  return Object.fromEntries(Object.entries(labels).map(([field, label]) => {
    const matches = [...output.matchAll(new RegExp(`^# ${label} (\\d+)\\r?$`, 'gm'))];
    const value = matches.length === 1 ? Number(matches[0][1]) : null;
    return [field, Number.isSafeInteger(value) ? value : null];
  }));
}

export async function snapshotEvidence(root, executable = process.execPath) {
  const hashes = {};
  const issues = [];
  for (const file of [...evidenceFiles, 'node-runtime']) {
    try {
      hashes[file] = sha256(file === 'node-runtime'
        ? await readFile(executable) : await readScopedFile(root, file));
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'UNSAFE_PATH'].includes(error.code)) throw error;
      hashes[file] = null;
      issues.push({ file, code: error.code });
    }
  }
  return { hashes, issues };
}

export function assessRun(result, counts, before, after) {
  const reasons = [];
  const changed = Object.keys(before.hashes).filter((file) =>
    before.hashes[file] === null || after.hashes[file] === null ||
    before.hashes[file] !== after.hashes[file]);
  if (before.issues.length || after.issues.length || changed.length) reasons.push('state-changed');
  if (result.error) reasons.push(result.error.code === 'ETIMEDOUT' ? 'test-timeout' : 'test-launch-error');
  if (result.signal) reasons.push('test-signalled');
  if (result.status !== 0) reasons.push('test-exit-nonzero');
  const complete = Object.values(counts).every(Number.isSafeInteger);
  if (!complete) reasons.push('missing-or-invalid-counts');
  if (complete) {
    if (counts.tests !== 16 || counts.passed !== 16) reasons.push('expected-16-shared-passes');
    if (counts.failed > 0) reasons.push('failed-tests');
    for (const field of ['skipped', 'todo', 'cancelled']) {
      if (counts[field] !== 0) reasons.push(`${field}-tests`);
    }
    if (counts.tests !== counts.passed + counts.failed + counts.skipped + counts.todo + counts.cancelled) {
      reasons.push('inconsistent-counts');
    }
  }
  const status = reasons.includes('state-changed') ? 'state-changed'
    : result.error || result.signal || result.status !== 0 || counts.failed > 0 ? 'failed'
      : reasons.length ? 'incomplete' : 'passed';
  const collectorExitCode = Number.isInteger(result.status) && result.status !== 0
    ? result.status : status === 'passed' ? 0 : 1;
  return { status, reasons, changedFiles: changed, collectorExitCode };
}

export async function collectEvidence(root, { executable = process.execPath, timeout = 30_000 } = {}) {
  const startedAt = new Date().toISOString();
  const before = await snapshotEvidence(root, executable);
  const env = { ...process.env, NO_COLOR: '1' };
  // Inherited runner injection would make this a different command than the recorded one.
  for (const key of ['FORCE_COLOR', 'NODE_TEST_CONTEXT', 'NODE_OPTIONS']) delete env[key];
  const result = spawnSync(executable, ['--test', '--test-reporter=tap', 'test/v2.test.mjs'], {
    cwd: root, encoding: 'utf8', env, timeout, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024,
  });
  const after = await snapshotEvidence(root, executable);
  const counts = parseCounts(result.stdout ?? '');
  return {
    schemaVersion: 2,
    command: 'npm run test:v2',
    runner: 'node --test --test-reporter=tap test/v2.test.mjs',
    startedAt,
    finishedAt: new Date().toISOString(),
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    ...assessRun(result, counts, before, after),
    testExitCode: result.status,
    signal: result.signal,
    errorCode: result.error?.code ?? null,
    counts,
    snapshots: { before, after },
    sha256: after.hashes,
    countDomain: 'node:test assertions, not synthetic business status counts',
    scope: '로컬 v2 공통 계약만 실행. 합성 자료의 passed 건수와 다름. 학습자 추가 테스트/review/Copilot/사람 승인 검증 아님. 출시 승인·서명·위변조 방지 증명 아님.',
  };
}
