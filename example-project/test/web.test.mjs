import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createDashboardServer } from '../scripts/web.mjs';
import { createCaseReport, createDashboardReport, createProgressReport, observePolicy } from '../scripts/web-report.mjs';
import { summarizeTestResults } from '../src/summarize-results.mjs';

const fixtures = JSON.parse(await readFile(new URL('../data/test-results.json', import.meta.url), 'utf8'));
const reportScript = fileURLToPath(new URL('../scripts/web-report.mjs', import.meta.url));

async function emptyRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'workshop-web-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function put(root, file, text) {
  await mkdir(join(root, file, '..'), { recursive: true });
  await writeFile(join(root, file), text);
}

async function fixtureRoot(t, rows = fixtures) {
  const root = await emptyRoot(t);
  await put(root, 'data/test-results.json', JSON.stringify(rows));
  await put(root, 'web/index.html', await readFile(new URL('../web/index.html', import.meta.url)));
  return root;
}

async function serve(t, root) {
  const server = createDashboardServer(root);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('web report uses the current business function and preserves build/row order', async t => {
  const root = await fixtureRoot(t);
  const report = await createDashboardReport(root);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.sourceFile, 'data/test-results.json');
  assert.equal(report.inputRowCount, 8);
  assert.ok(Number.isFinite(Date.parse(report.generatedAt)));
  assert.deepEqual(report.builds.map(build => build.summary.buildId), ['BUILD-DEMO-1', 'BUILD-DEMO-2']);
  const first = report.builds[0];
  assert.deepEqual(first.summary, summarizeTestResults(fixtures, { buildId: 'BUILD-DEMO-1' }));
  assert.equal(first.summary.sourceRowCount, 7);
  assert.equal(first.summary.uniqueCaseCount, 6);
  assert.equal(first.summary.duplicateRowCount, 1);
  assert.deepEqual(first.summary.counts, { passed: 2, failed: 2, timed_out: 1, not_run: 1 });
  assert.deepEqual(first.sourceRows, fixtures.filter(row => row.buildId === 'BUILD-DEMO-1'));
  assert.deepEqual(report.builds[1].summary, summarizeTestResults(fixtures, { buildId: 'BUILD-DEMO-2' }));
});

test('web report points candidates at their original input rows and names the current policy', async t => {
  const report = await createDashboardReport(await fixtureRoot(t));
  const [first, second] = report.builds;
  assert.deepEqual(first.sourceIndexes, [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(second.sourceIndexes, [7]);
  assert.deepEqual(first.candidateIndexes, first.summary.rerunCandidates.map(row => fixtures.findIndex(
    source => source.module === row.module && source.caseId === row.caseId)));
  assert.equal(first.candidatesReferenceSource, true);
  assert.equal(first.policy, 'failed-only');
  assert.equal(second.policy, 'undecidable');
});

test('policy observation separates the two approved policies from anything else', () => {
  const build = summary => observePolicy(fixtures, { buildId: 'BUILD-DEMO-1', ...summary });
  const unique = fixtures.slice(0, 6);
  assert.equal(build({ rerunCandidates: unique.filter(row => row.status === 'failed') }), 'failed-only');
  assert.equal(build({ rerunCandidates: unique.filter(row => row.status !== 'passed') }), 'approved-v2');
  assert.equal(build({ rerunCandidates: [] }), 'other');
  assert.equal(build({ rerunCandidates: [unique[1], unique[1]] }), 'other');
  assert.equal(observePolicy(fixtures, { buildId: 'BUILD-DEMO-2', rerunCandidates: [] }), 'undecidable');
});

test('web report treats an empty fixture as an empty report, not a fabricated build', async t => {
  const root = await fixtureRoot(t, []);
  const report = await createDashboardReport(root);
  assert.equal(report.inputRowCount, 0);
  assert.deepEqual(report.builds, []);
});

test('web report rejects malformed rows and conflicts, including outside the first build', async t => {
  const invalidCases = [
    { rows: {}, name: 'non-array' },
    { rows: [...fixtures, { ...fixtures[0], buildId: 'OTHER', status: 'unknown' }], name: 'invalid other build' },
    { rows: [...fixtures, { ...fixtures.at(-1), status: 'failed' }], name: 'conflicting other build' },
  ];
  for (const { rows, name } of invalidCases) {
    await t.test(name, async t => {
      const root = await fixtureRoot(t, rows);
      await assert.rejects(createDashboardReport(root), TypeError);
    });
  }
});

test('edge cases match the demo cases and keep names as plain text', async () => {
  const cases = await createCaseReport();
  const byId = Object.fromEntries(cases.map(entry => [entry.id, entry]));
  assert.deepEqual(byId['normal-build'].candidates, ['media/TC-102', 'connectivity/TC-101']);
  assert.equal(byId['no-match'].status, 'no-match');
  assert.equal(byId['conflicting-duplicate'].status, 'input-error');
  assert.equal(byId['conflicting-duplicate'].error.type, 'TypeError');
  assert.ok(byId['untrusted-name'].names[0].startsWith('외부데이터:'));
  for (const entry of cases) assert.equal(typeof entry.nextQuestion, 'string');
});

test('edge cases are absent rather than invented when the case file is missing', async t => {
  assert.deepEqual(await createCaseReport(await fixtureRoot(t)), []);
});

test('progress report reads a fresh project as not started without running anything', async t => {
  const progress = await createProgressReport(await emptyRoot(t));
  assert.deepEqual(progress, {
    baseline: false,
    learnerTests: null,
    harnessFiles: { 'harness/instructions.txt': 'missing', 'harness/workflow.json': 'missing', 'harness/run.mjs': 'missing' },
    harnessCheck: { status: 'unavailable' },
    harnessStatus: { status: 'unavailable' },
    review: false,
    transferPrediction: null,
    evidence: null,
    readmeCompletion: null,
  });
});

test('progress report shows written files, counts and the latest evidence but never prediction values', async t => {
  const root = await emptyRoot(t);
  await put(root, '.baseline/manifest.json', '{}');
  await put(root, 'test/learner.test.mjs', "test('one', () => {});\ntest('two', () => {});\n");
  await put(root, 'harness/instructions.txt', '직접 쓴 지시입니다.');
  await put(root, 'harness/workflow.json', '{"purpose":"TODO"}');
  await put(root, 'harness/run.mjs', 'export default async function run() {}');
  await put(root, 'review/summarize-results.mjs', 'export {};');
  await put(root, 'test/transfer.test.mjs', "const expectedIds = ['media/SECRET-ID'];");
  await put(root, 'evidence/v2-2026-01-01.json', '{"status":"failed","counts":{"tests":16},"testExitCode":1}');
  await put(root, 'evidence/v2-2026-01-02.json', '{"status":"passed","counts":{"tests":16},"testExitCode":0}');
  await put(root, 'README.txt', '지시\n[학습자 완성란]\n목적: 검토 담당자의 판단을 돕는다\n실행명령: (다시 확인할 명령)\n실제결과: v2 16 통과\n변경이유:\n제한: 없음\n');
  const progress = await createProgressReport(root);
  assert.equal(progress.baseline, true);
  assert.equal(progress.learnerTests, 2);
  assert.deepEqual(progress.harnessFiles, {
    'harness/instructions.txt': 'written', 'harness/workflow.json': 'todo', 'harness/run.mjs': 'written',
  });
  assert.equal(progress.review, true);
  assert.equal(progress.transferPrediction, 'written');
  assert.deepEqual(progress.evidence, { file: 'evidence/v2-2026-01-02.json', status: 'passed', tests: 16, testExitCode: 0 });
  assert.equal(progress.readmeCompletion, 3);
  assert.doesNotMatch(JSON.stringify(progress), /SECRET-ID/);
});

test('the full screen report never contains the independent transfer input', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [reportScript]);
  const transfer = JSON.parse(await readFile(new URL('../data/transfer-results.json', import.meta.url), 'utf8'));
  const known = new Set(fixtures.map(row => `${row.module}/${row.caseId}`));
  const transferOnly = transfer.map(row => `${row.module}/${row.caseId}`).filter(id => !known.has(id));
  assert.ok(transferOnly.length > 0);
  for (const id of transferOnly) assert.ok(!stdout.includes(id.split('/')[1]), id);
  assert.doesNotMatch(stdout, /transfer-results/);
});

test('web server serves the actual page and recomputes JSON on every request without writing data', async t => {
  const root = await fixtureRoot(t);
  const source = join(root, 'data/test-results.json');
  const before = await readFile(source);
  const url = await serve(t, root);
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html; charset=utf-8/);
  assert.match(page.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await page.text(), /테스트 결과, 한눈에/);
  const response = await fetch(`${url}/api/report`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  const first = await response.json();
  assert.deepEqual(first.builds[0].summary, summarizeTestResults(fixtures, { buildId: 'BUILD-DEMO-1' }));
  assert.ok(Array.isArray(first.cases));
  assert.equal(first.progress.harnessStatus.status, 'unavailable');
  await writeFile(source, '[]');
  const second = await (await fetch(`${url}/api/report`)).json();
  assert.deepEqual(second.builds, []);
  assert.notEqual(second.generatedAt, first.generatedAt);
  await writeFile(source, before);
  assert.deepEqual(await readFile(source), before);
});

test('web server supports HEAD and does not expose source files or accept writes', async t => {
  const root = await fixtureRoot(t);
  const url = await serve(t, root);
  const before = await readFile(join(root, 'data/test-results.json'));
  for (const path of ['/', '/api/report']) {
    const response = await fetch(`${url}${path}`, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
    assert.ok(Number(response.headers.get('content-length')) > 0);
  }
  for (const path of ['/data/test-results.json', '/src/summarize-results.mjs', '/package.json', '/missing']) {
    assert.equal((await fetch(`${url}${path}`)).status, 404);
  }
  const post = await fetch(`${url}/api/report`, { method: 'POST', body: '[]' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
  assert.deepEqual(await readFile(join(root, 'data/test-results.json')), before);
});

test('web server logs and surfaces broken input instead of returning a successful empty summary', async t => {
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args));
  const root = await fixtureRoot(t);
  await writeFile(join(root, 'data/test-results.json'), '{broken');
  const url = await serve(t, root);
  const response = await fetch(`${url}/api/report`);
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.match(body.error, /지금 코드로 결과를 계산하지 못했습니다/);
  assert.match(body.detail, /^SyntaxError/);
  assert.ok(!body.detail.includes(root), 'local root path is hidden');
  assert.equal(errors.length, 1);
  assert.equal(typeof errors[0][1], 'string');
});

test('web report keeps instruction-like names as plain data', async t => {
  const name = '<img src=x onerror="throw new Error()"> 이름은 실행 지시가 아님';
  const root = await fixtureRoot(t, [{ ...fixtures[1], name }]);
  const report = await createDashboardReport(root);
  assert.equal(report.builds[0].summary.rerunCandidates[0].name, name);
  assert.equal(report.builds[0].sourceRows[0].name, name);
});

test('the page writes report data only through textContent', async () => {
  const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});
