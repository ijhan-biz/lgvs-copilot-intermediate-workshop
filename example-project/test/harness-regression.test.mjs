import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fsPromises from 'node:fs/promises';
import { cp, lstat, mkdir, readFile, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  approveHarness, checkHarness, executeHarness, fingerprintFiles,
  harnessStatus, inspectProject, validateWorkflow,
} from '../scripts/harness-core.mjs';
import { readOutput, safeOutput, safeRoot, withLock, writeOutput } from '../scripts/harness-paths.mjs';
import { sha256 } from '../scripts/scoped-files.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const instructor = fileURLToPath(new URL('../../instructor/', import.meta.url));
const reason = 'Synthetic local regression review only';
const instructions = 'Use synthetic local inputs only. Stop on any validation or tool failure; never treat missing evidence as success.';
const noop = 'export default async function run() {}\n';
const config = () => ({
  schemaVersion: 1,
  purpose: 'Exercise local harness rejection boundaries with synthetic data.',
  input: 'data/test-results.json',
  context: ['harness/instructions.txt'],
  allowedTools: ['inspect-input', 'test:v2'],
  steps: ['inspect-input', 'test:v2'],
  output: '.harness',
  timeoutMs: 2000,
  retryLimit: 1,
});
const code = expected => error => {
  assert.equal(error.code, expected, error.stack);
  return true;
};
const put = (root, path, value) => writeFile(join(root, path),
  typeof value === 'string' ? value : `${JSON.stringify(value)}\n`);

async function fixture(t, { source = noop, workflow = config(), privateSuccess = false } = {}) {
  let reference;
  if (privateSuccess) {
    try {
      reference = await Promise.all([
        readFile(join(instructor, 'harness-reference/workflow.json')),
        readFile(join(instructor, 'harness-reference/instructions.txt')),
        readFile(join(instructor, 'harness-reference/run.mjs')),
        readFile(join(instructor, 'reference-v2.mjs'), 'utf8'),
      ]);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      t.skip('Private instructor reference unavailable; positive operational coverage requires instructor checkout.');
      return null;
    }
  }
  const workspace = join(project, `.harness-tests-${randomUUID()}`);
  await mkdir(workspace);
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const root = join(workspace, 'example-project');
  await mkdir(root);
  // Copy only kernel fingerprint inputs, never another test/rehearsal workspace.
  for (const path of fingerprintFiles) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await cp(join(project, path), join(root, path), { errorOnExist: true, force: false });
  }
  await put(root, 'harness/workflow.json', workflow);
  await put(root, 'harness/instructions.txt', instructions);
  await put(root, 'harness/run.mjs', source);
  if (reference) {
    for (const [index, name] of ['workflow.json', 'instructions.txt', 'run.mjs'].entries()) {
      await writeFile(join(root, 'harness', name), reference[index]);
    }
    // Relocate private imports, without embedding a completed answer here.
    await put(root, 'src/summarize-results.mjs',
      reference[3].replaceAll('../example-project/src/', './'));
  }
  return { root, workspace };
}

async function snapshot(root) {
  const result = {};
  async function walk(path, prefix = '') {
    for (const name of (await readdir(path)).sort()) {
      const absolute = join(path, name);
      const key = `${prefix}${name}`;
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) result[key] = { link: await readlink(absolute) };
      else if (stat.isDirectory()) {
        result[`${key}/`] = 'directory';
        await walk(absolute, `${key}/`);
      } else result[key] = sha256(await readFile(absolute));
    }
  }
  await walk(root);
  return result;
}

async function unchanged(root, action) {
  const before = await snapshot(root);
  await action();
  assert.deepEqual(await snapshot(root), before, 'Rejected/read-only operation modified files');
}

async function checkpoint(root) {
  const { runId } = await readOutput(root, '.harness/latest.json');
  assert.match(runId, /^[a-f0-9-]{36}$/);
  const path = `.harness/runs/${runId}/checkpoint.json`;
  return { path, envelope: await readOutput(root, path), bytes: await readFile(join(root, path), 'utf8') };
}

async function assertFailed(root, expected, options) {
  const result = await executeHarness(root, options);
  assert.equal(result.status, 'failed');
  assert.equal(result.actualStatus, 'failed');
  assert.equal(result.failure, expected);
  const { envelope } = await checkpoint(root);
  assert.equal(envelope.state.status, 'failed');
  assert.equal(envelope.state.failure, expected);
  assert.equal((await harnessStatus(root)).status, 'failed');
  return result;
}

test('strict workflow accepts only the bounded schema, never executable commands or alternate paths', async t => {
  const valid = config();
  assert.equal(validateWorkflow(valid), valid);
  for (const boundary of [
    { timeoutMs: 50, retryLimit: 0 }, { timeoutMs: 10000, retryLimit: 2 },
  ]) assert.doesNotThrow(() => validateWorkflow({ ...config(), ...boundary }));
  const invalid = [
    ['null', null], ['array', []], ['starter', { schemaVersion: 1, purpose: 'TODO' }],
    ...Object.keys(valid).map(key => {
      const value = config();
      delete value[key];
      return [`missing ${key}`, value];
    }),
    ...[
      { command: 'node -e "process.exit(0)"' }, { shell: true }, { env: {} },
      { schemaVersion: 2 }, { purpose: 'short' }, { purpose: 'TODO fill this purpose' },
      { purpose: 'x'.repeat(2001) }, { purpose: null },
      { timeoutMs: 49 }, { timeoutMs: 10001 }, { timeoutMs: 1.5 }, { timeoutMs: '2000' },
      { retryLimit: -1 }, { retryLimit: 3 }, { retryLimit: 0.5 }, { retryLimit: '1' },
      { steps: ['test:v2', 'inspect-input'] }, { steps: ['inspect-input'] },
      { steps: ['inspect-input', 'test:v2', 'test:v2'] },
      { allowedTools: ['inspect-input', 'test:v2', 'sh'] },
      ...['test:v2; touch injected', '$(touch injected)', 'node -e "process.exit(0)"', '../scripts/harness-task.mjs']
        .flatMap(command => [{ steps: ['inspect-input', command] }, { allowedTools: [command] }]),
      ...['../data/test-results.json', '/data/test-results.json', 'data/../data/test-results.json', 'data\\test-results.json']
        .map(input => ({ input })),
      ...[[], ['../instructions.txt'], ['harness/instructions.txt', 'README.txt'], 'harness/instructions.txt']
        .map(context => ({ context })),
      ...['../.harness', '/.harness', '.harness/runs', '.harness;touch injected', '.harness/']
        .map(output => ({ output })),
    ].map((patch, index) => [`invalid variant ${index}: ${JSON.stringify(patch)}`, { ...config(), ...patch }]),
  ];
  for (const [name, value] of invalid) {
    await t.test(name, () => assert.throws(() => validateWorkflow(value), code('INVALID_CONFIG')));
  }
});

test('check/status are read-only and readiness is not execution evidence', async t => {
  const { root } = await fixture(t);
  await unchanged(root, async () => {
    const ready = await checkHarness(root);
    assert.equal(ready.status, 'ready');
    assert.match(ready.fingerprint, /^[a-f0-9]{64}$/);
    assert.deepEqual(ready.steps, ['inspect-input', 'test:v2']);
    assert.equal((await harnessStatus(root)).status, 'none');
  });
  await assert.rejects(lstat(join(root, '.harness')), code('ENOENT'));
});

test('missing/invalid inputs and instructions fail closed without creating output', async t => {
  for (const [name, path, value, expected] of [
    ['missing input', 'data/test-results.json', null, 'ENOENT'],
    ['missing instructions', 'harness/instructions.txt', null, 'ENOENT'],
    ['missing workflow', 'harness/workflow.json', null, 'ENOENT'],
    ['missing run', 'harness/run.mjs', null, 'ENOENT'],
    ['empty input', 'data/test-results.json', [], 'INVALID_INPUT'],
    ['object input', 'data/test-results.json', {}, 'INVALID_INPUT'],
    ['invalid input row', 'data/test-results.json', [{ buildId: 'SYNTHETIC', status: 'invalid' }], 'INVALID_INPUT'],
    ['blank instructions', 'harness/instructions.txt', ' '.repeat(80), 'INCOMPLETE_INSTRUCTIONS'],
    ['placeholder instructions', 'harness/instructions.txt', `${instructions} TODO`, 'INCOMPLETE_INSTRUCTIONS'],
    ['short instructions', 'harness/instructions.txt', 'Stop.', 'INCOMPLETE_INSTRUCTIONS'],
  ]) {
    await t.test(name, async t => {
      const { root } = await fixture(t);
      if (value === null) await rm(join(root, path));
      else await put(root, path, value);
      await unchanged(root, async () => {
        for (const operation of [checkHarness, executeHarness, harnessStatus]) {
          await assert.rejects(operation(root), code(expected));
        }
        await assert.rejects(approveHarness(root, reason), code(expected));
      });
    });
  }
});

test('approval is mandatory, bounded, fingerprint-bound, and not authenticated approval', async t => {
  const { root } = await fixture(t);
  for (const value of [undefined, '', 'TODO reason', 'short', 'x'.repeat(1001)]) {
    await unchanged(root, () => assert.rejects(approveHarness(root, value), code('REVIEW_REASON_REQUIRED')));
  }
  await unchanged(root, () => assert.rejects(executeHarness(root), code('ENOENT')));
  const approved = await approveHarness(root, reason);
  assert.equal(approved.status, 'approved');
  assert.equal(approved.declaration, 'local-human-review-not-authenticated');
  const approval = await readOutput(root, '.harness/approval.json');
  assert.equal(approval.fingerprint, (await inspectProject(root)).fingerprint);
  for (const [patch, expected] of [
    [{ fingerprint: '0'.repeat(64) }, 'APPROVAL_REQUIRED'],
    [{ schemaVersion: 2 }, 'APPROVAL_REQUIRED'],
    [{ reason: 'short' }, 'APPROVAL_REQUIRED'],
    [{ reviewedAt: 'not-a-date' }, 'APPROVAL_REQUIRED'],
    [{ declaration: 'authenticated' }, 'APPROVAL_REQUIRED'],
    [{ extra: true }, 'INVALID_APPROVAL'],
  ]) {
    await put(root, '.harness/approval.json', { ...approval, ...patch });
    await unchanged(root, () => assert.rejects(executeHarness(root), code(expected)));
  }
  await put(root, '.harness/approval.json', approval);
  await put(root, 'harness/instructions.txt', `${instructions}\nChanged review context.`);
  await unchanged(root, () => assert.rejects(executeHarness(root), code('APPROVAL_REQUIRED')));
});

test('malformed JSON and non-function orchestration fail closed without execution evidence', async t => {
  for (const path of ['harness/workflow.json', 'data/test-results.json']) {
    await t.test(path, async t => {
      const { root } = await fixture(t);
      await put(root, path, '{invalid-json');
      await unchanged(root, async () => {
        await assert.rejects(checkHarness(root), SyntaxError);
        await assert.rejects(approveHarness(root, reason), SyntaxError);
        await assert.rejects(executeHarness(root), SyntaxError);
      });
    });
  }
  for (const source of ['export const run = () => {};', 'export default {status:"passed"};']) {
    await t.test(source, async t => {
      const { root } = await fixture(t, { source });
      await unchanged(root, async () => {
        await assert.rejects(checkHarness(root), code('INVALID_ORCHESTRATION'));
        await assert.rejects(approveHarness(root, reason), code('INVALID_ORCHESTRATION'));
      });
    });
  }
  const { root } = await fixture(t);
  await approveHarness(root, reason);
  await put(root, '.harness/approval.json', '{invalid-json');
  await unchanged(root, () => assert.rejects(executeHarness(root), SyntaxError));
});

test('output path grammar rejects traversal, absolute paths and non-directory parents', async t => {
  const { root } = await fixture(t);
  for (const path of [
    '', 'approval.json', '../.harness/a', '/.harness/a', '.harness/../a', '.harness/./a',
    '.harness//a', '.harness/a/', '.harness\\a', '.harness/a b', '.harness/a;touch injected',
  ]) {
    await unchanged(root, () => assert.rejects(safeOutput(root, path), code('INVALID_OUTPUT')));
  }
  await mkdir(join(root, '.harness'));
  await put(root, '.harness/not-directory', 'sentinel');
  await unchanged(root, () => assert.rejects(
    writeOutput(root, '.harness/not-directory/a.json', {}), code('UNSAFE_PATH')));
  await mkdir(join(root, '.harness/is-directory'));
  await unchanged(root, () => assert.rejects(
    writeOutput(root, '.harness/is-directory', {}), code('UNSAFE_PATH')));
});

test('atomic outputs round-trip and locks exclude reentry and release after failure', async t => {
  const { root } = await fixture(t);
  await writeOutput(root, '.harness/nested/state.json', { value: 1 });
  assert.deepEqual(await readOutput(root, '.harness/nested/state.json'), { value: 1 });
  await writeOutput(root, '.harness/nested/state.json', { value: 2 });
  assert.deepEqual(await readdir(join(root, '.harness/nested')), ['state.json']);
  await withLock(root, async () => {
    await assert.rejects(withLock(root, () => assert.fail('Nested lock entered')), code('EEXIST'));
  });
  await assert.rejects(withLock(root, async () => { throw new Error('controlled failure'); }), /controlled failure/);
  await withLock(root, async () => {});
  await assert.rejects(lstat(join(root, '.harness/lock')), code('ENOENT'));
});

test('root aliases and symlinked ancestors are rejected before reads or writes', async t => {
  const { root, workspace } = await fixture(t);
  const alias = join(workspace, 'alias');
  await symlink(root, alias, 'dir');
  const parentAlias = join(workspace, 'parent-alias');
  await symlink(workspace, parentAlias, 'dir');
  for (const path of [alias, join(parentAlias, 'example-project')]) {
    await unchanged(workspace, async () => {
      for (const operation of [safeRoot, inspectProject, checkHarness, executeHarness, harnessStatus]) {
        await assert.rejects(operation(path), code('UNSAFE_PATH'));
      }
      await assert.rejects(writeOutput(path, '.harness/probe.json', {}), code('UNSAFE_PATH'));
    });
  }
});

test('input, instruction, source and parent symlinks never enter the fingerprint', async t => {
  for (const path of ['data/test-results.json', 'harness/instructions.txt', 'harness/run.mjs', 'harness/workflow.json', 'src/summary-core.mjs', 'data', 'harness', 'src']) {
    await t.test(path, async t => {
      const { root, workspace } = await fixture(t);
      const target = join(workspace, 'target');
      await cp(join(root, path), target, { recursive: true });
      await rm(join(root, path), { recursive: true });
      await symlink(target, join(root, path));
      await unchanged(workspace, async () => {
        await assert.rejects(inspectProject(root), code('UNSAFE_PATH'));
        await assert.rejects(approveHarness(root, reason), code('UNSAFE_PATH'));
        await assert.rejects(executeHarness(root), code('UNSAFE_PATH'));
      });
    });
  }
});

test('output, approval, run and checkpoint symlinks cannot read or overwrite their target', async t => {
  for (const path of [
    '.harness', '.harness/runs', '.harness/runs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '.harness/approval.json', '.harness/latest.json',
    '.harness/runs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/checkpoint.json',
  ]) {
    await t.test(path, async t => {
      const { root, workspace } = await fixture(t);
      const directory = ['.harness', '.harness/runs'].includes(path) || path.endsWith('aaaaaaaaaaaa');
      const target = join(workspace, 'target');
      if (directory) {
        await mkdir(target);
        await writeFile(join(target, 'sentinel'), 'must remain untouched');
      } else await writeFile(target, '{"sentinel":"must remain untouched"}\n');
      await mkdir(dirname(join(root, path)), { recursive: true });
      await symlink(target, join(root, path));
      const probe = directory ? `${path}/probe.json` : path;
      await unchanged(workspace, async () => {
        await assert.rejects(writeOutput(root, probe, {}), code('UNSAFE_PATH'));
        await assert.rejects(readOutput(root, probe), code('UNSAFE_PATH'));
        if (path === '.harness' || path === '.harness/approval.json') {
          await assert.rejects(approveHarness(root, reason), code('UNSAFE_PATH'));
          await assert.rejects(executeHarness(root), code('UNSAFE_PATH'));
        }
      });
    });
  }
});

test('no-op, fabricated results, forged receipts and invalid order cannot pass', async t => {
  // These intentionally incomplete/hostile fragments are not a reference orchestration.
  const variants = [
    ['no-op', noop, 'FAILED_ORCHESTRATION'],
    ['fabricated return', 'export default async () => ({status:"passed", completed:["inspect-input","test:v2"]});', 'FAILED_ORCHESTRATION'],
    ['finish immediately', 'export default async api => { await api.finish(); };', 'INCOMPLETE_REQUIRED_STEPS'],
    ['approval before validation', 'export default async api => { await api.verifyApproval(); };', 'INVALID_SEQUENCE'],
    ['run before approval', 'export default async api => { await api.runStep("inspect-input"); };', 'INVALID_SEQUENCE'],
    ['wrong tool order', 'export default async api => { await api.validate(); await api.verifyApproval(); await api.runStep("test:v2"); };', 'INVALID_SEQUENCE'],
    ['forbidden command', 'export default async api => { await api.validate(); await api.verifyApproval(); await api.runStep("sh -c echo fabricated"); };', 'FORBIDDEN_TOOL'],
    ['forged receipt', 'export default async api => { await api.validate(); await api.verifyApproval(); await api.recordResult("inspect-input", {tool:"inspect-input",status:"passed",childStarted:true,exitCode:0}); };', 'INVALID_RECEIPT'],
    ['copied real receipt', 'export default async api => { await api.validate(); await api.verifyApproval(); const r = await api.runStep("inspect-input"); await api.recordResult("inspect-input", {...r}); };', 'INVALID_RECEIPT'],
    ['pending receipt ignored', 'export default async api => { await api.validate(); await api.verifyApproval(); await api.runStep("inspect-input"); };', 'FAILED_ORCHESTRATION'],
    ['missing failure branch', 'export default async api => { await api.validate(); await api.verifyApproval(); const r = await api.runStep("inspect-input"); await api.recordResult("inspect-input", r); await api.finish(); };', 'INCOMPLETE_REQUIRED_STEPS'],
  ];
  for (const [name, source, expected] of variants) {
    await t.test(name, async t => {
      const { root } = await fixture(t, { source });
      await approveHarness(root, reason);
      const result = await assertFailed(root, expected, name === 'missing failure branch' ? { drill: 'timeout' } : undefined);
      assert.deepEqual(result.completed, []);
      if (name === 'missing failure branch') {
        const event = (await checkpoint(root)).envelope.state.events[0];
        assert.equal(event.childStarted, true);
        assert.equal(event.errorCode, 'ETIMEDOUT');
        assert.equal(event.signal, 'SIGKILL');
      }
    });
  }
});

test('retry cap persists across resumes and exhaustion never starts another child', async t => {
  // Only a single-step failure handler: this can never finish the required workflow.
  const source = `export default async api => {
    await api.validate(); await api.verifyApproval();
    const result = await api.runStep('inspect-input');
    await api.recordResult('inspect-input', result);
    await api.stop(result);
  };`;
  for (const retryLimit of [0, 1, 2]) {
    await t.test(`retryLimit=${retryLimit}`, async t => {
      const { root } = await fixture(t, { source, workflow: { ...config(), retryLimit } });
      // Controlled protected-task failure only in this exclusive test fixture.
      await put(root, 'scripts/harness-task.mjs', "throw new Error('Synthetic regression task failure');\n");
      await approveHarness(root, reason);
      for (let attempt = 1; attempt <= retryLimit + 1; attempt++) {
        const result = await assertFailed(root, 'STEP_FAILED', { resume: attempt > 1 });
        assert.equal(result.attempts['inspect-input'], attempt);
        const events = (await checkpoint(root)).envelope.state.events;
        assert.equal(events.length, attempt);
        assert.ok(events.every(event => event.childStarted && event.status === 'failed' && event.exitCode !== 0));
      }
      const before = (await checkpoint(root)).envelope.state.events;
      const exhausted = await assertFailed(root, 'RETRY_LIMIT', { resume: true });
      assert.equal(exhausted.attempts['inspect-input'], retryLimit + 1);
      assert.deepEqual((await checkpoint(root)).envelope.state.events, before);
    });
  }
});

test('a genuine receipt cannot be relabelled as a different step', async t => {
  const { root } = await fixture(t, {
    source: `export default async api => {
      await api.validate(); await api.verifyApproval();
      const result = await api.runStep('inspect-input');
      await api.recordResult('test:v2', result);
    };`,
  });
  await approveHarness(root, reason);
  await assertFailed(root, 'INVALID_RECEIPT');
});

test('overlapping step requests abort before launching or consuming an attempt', async t => {
  const { root } = await fixture(t, {
    source: `export default async api => {
      await api.validate(); await api.verifyApproval();
      await Promise.allSettled([api.runStep('inspect-input'), api.runStep('inspect-input')]);
      return { status: 'passed' };
    };`,
  });
  await approveHarness(root, reason);
  await assertFailed(root, 'FAILED_ORCHESTRATION');
  const { envelope } = await checkpoint(root);
  assert.deepEqual(envelope.state.events, []);
  assert.deepEqual(envelope.state.attempts, { 'inspect-input': 0, 'test:v2': 0 });
});

test('unawaited primitive work is cancelled and drained before returning or releasing the lock', async t => {
  for (const tail of [
    "void api.runStep('inspect-input');",
    "void api.runStep('inspect-input'); throw new Error('Learner stopped early');",
  ]) {
    await t.test(tail, async t => {
      const { root } = await fixture(t, {
        source: `export default async api => { await api.validate(); await api.verifyApproval(); ${tail} };`,
      });
      await approveHarness(root, reason);
      const result = await executeHarness(root);
      assert.equal(result.status, 'failed');
      assert.ok(['UNAWAITED_OPERATION', 'FAILED_ORCHESTRATION'].includes(result.failure));
      const state = (await checkpoint(root)).envelope.state;
      assert.deepEqual(state.completed, []);
      assert.deepEqual(state.events, []);
      assert.equal(state.attempts['inspect-input'], 0);
      await unchanged(root, () => new Promise(resolveWait => setTimeout(resolveWait, 100)));
      await assert.rejects(lstat(join(root, '.harness/lock')), code('ENOENT'));
    });
  }
});

test('unrecorded child receipts consume an uncertain attempt rather than reset retry accounting', async t => {
  const { root } = await fixture(t, {
    source: `export default async api => {
      await api.validate(); await api.verifyApproval();
      await api.runStep('inspect-input');
      throw new Error('Interrupted before recording the receipt');
    };`,
  });
  await approveHarness(root, reason);
  await assertFailed(root, 'FAILED_ORCHESTRATION');
  const first = (await checkpoint(root)).envelope.state;
  assert.equal(first.attempts['inspect-input'], 1);
  assert.equal(first.events[0].childStarted, null);
  assert.equal(first.events[0].errorCode, 'INTERRUPTED_OR_NOT_STARTED');
  await assertFailed(root, 'FAILED_ORCHESTRATION', { resume: true });
  const second = (await checkpoint(root)).envelope.state;
  assert.equal(second.attempts['inspect-input'], 2);
  await assertFailed(root, 'RETRY_LIMIT', { resume: true });
  assert.equal((await checkpoint(root)).envelope.state.attempts['inspect-input'], 2);
});

test('delayed receipt rename cannot be overtaken even when all API promises are awaited before return', async t => {
  for (const delayedStep of ['inspect-input', 'test:v2']) {
    await t.test(delayedStep, async t => {
      const fixtureResult = await fixture(t, { privateSuccess: true });
      if (!fixtureResult) return;
      const { root } = fixtureResult;
      const key = `harness-rename-${randomUUID()}`;
      const { promise: attempted, resolve: signalAttempted } = Promise.withResolvers();
      const { promise: entered, resolve: signalEntered } = Promise.withResolvers();
      const { promise: released, resolve: release } = Promise.withResolvers();
      globalThis[key] = signalAttempted;
      await put(root, 'harness/workflow.json', { ...config(), retryLimit: 0 });
      await put(root, 'harness/run.mjs', `export default async api => {
        await api.validate(); await api.verifyApproval();
        const remaining = api.steps.filter(step => !api.isComplete(step));
        let recording;
        try {
          for (const step of remaining) {
            const result = await api.runStep(step);
            if (step === ${JSON.stringify(delayedStep)}) recording = api.recordResult(step, result);
            else await api.recordResult(step, result);
          }
          await api.finish();
        } finally {
          globalThis[${JSON.stringify(key)}]();
          await recording;
        }
      };`);
      await approveHarness(root, reason);
      const rename = fsPromises.rename;
      let delayed = false;
      const landed = [];
      t.mock.method(fsPromises, 'rename', async (from, to) => {
        let state;
        if (to.startsWith(root) && basename(to) === 'checkpoint.json') {
          state = JSON.parse(await readFile(from, 'utf8')).state;
          if (!delayed && state.status === 'running' && state.events.at(-1)?.tool === delayedStep &&
              state.events.at(-1)?.status === 'passed') {
            delayed = true;
            signalEntered();
            await released;
          }
        }
        await rename(from, to);
        if (state) landed.push(state);
      });
      syncBuiltinESMExports();
      let execution;
      try {
        execution = executeHarness(root);
        await Promise.race([
          entered,
          execution.then(() => assert.fail('Receipt rename was never delayed')),
        ]);
        await Promise.race([
          attempted,
          new Promise((_, reject) => {
            const timer = setTimeout(() => reject(new Error('Transition did not settle')), 5000);
            timer.unref();
          }),
        ]);
        await assert.rejects(withLock(root, () => assert.fail('Lock released during receipt save')), code('EEXIST'));
        release();
        const result = await execution;
        const saved = await checkpoint(root);
        assert.equal(saved.envelope.checksum, sha256(JSON.stringify(saved.envelope.state)));
        assert.equal(saved.envelope.state.status, result.status, 'Late rename rolled back the terminal checkpoint');
        assert.equal(result.status, 'failed', 'Missing await must fail even when the promise is awaited later');
        assert.equal(result.failure, 'UNAWAITED_OPERATION');
        assert.equal(landed.at(-1).status, 'failed');
        assert.ok(landed.every((state, index) => index === 0 ||
          (state.attempts['test:v2'] >= landed[index - 1].attempts['test:v2'] &&
           state.completed.length >= landed[index - 1].completed.length)));
        const resumed = await executeHarness(root, { resume: true });
        assert.equal(resumed.status, 'passed');
        assert.deepEqual(resumed.attempts, { 'inspect-input': 1, 'test:v2': 1 });
        const final = await checkpoint(root);
        assert.equal(final.envelope.state.status, 'passed');
        assert.equal(final.envelope.checksum, sha256(JSON.stringify(final.envelope.state)));
        await unchanged(root, async () => {
          assert.equal((await executeHarness(root, { resume: true })).idempotent, true);
        });
        t.diagnostic(JSON.stringify({ delayedStep, failure: result.failure,
          renameStatuses: landed.map(state => state.status), finalStatus: final.envelope.state.status,
          attempts: resumed.attempts, checksumValid: true, idempotentResume: true }));
      } finally {
        release();
        if (execution) await execution.catch(() => {});
        t.mock.restoreAll();
        syncBuiltinESMExports();
        delete globalThis[key];
      }
    });
  }
});

test('real timed-out v2 implementation is reaped before lock release and cannot overlap resume or write later', async t => {
  const fixtureResult = await fixture(t, { privateSuccess: true });
  if (!fixtureResult) return;
  const { root } = fixtureResult;
  const original = await readFile(join(root, 'src/summarize-results.mjs'), 'utf8');
  // Delay the user implementation inside the actual v2 test, not a mocked spawn.
  await put(root, 'src/summarize-results.mjs', `
    import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
    const pids = new URL('../owned-test-pids.txt', import.meta.url);
    const active = new URL('../owned-test-active.txt', import.meta.url);
    if (existsSync(active)) writeFileSync(new URL('../overlapping-resume.txt', import.meta.url), 'overlap');
    writeFileSync(active, String(process.pid));
    appendFileSync(pids, JSON.stringify({ pid: process.pid, ppid: process.ppid }) + '\\n');
    setTimeout(() => writeFileSync(new URL('../late-protected-side-effect.txt', import.meta.url), 'late'), 2200);
    await new Promise(resolve => setTimeout(resolve, 30000));
    ${original}
  `);
  const workflow = JSON.parse(await readFile(join(root, 'harness/workflow.json'), 'utf8'));
  await put(root, 'harness/workflow.json', { ...workflow, timeoutMs: 1200, retryLimit: 1 });
  const owned = async () => {
    try {
      return (await readFile(join(root, 'owned-test-pids.txt'), 'utf8')).trim().split('\n').map(JSON.parse);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  };
  const gone = pid => {
    assert.throws(() => process.kill(pid, 0), code('ESRCH'), `Owned test PID ${pid} survived timeout`);
  };
  try {
    await approveHarness(root, reason);
    for (const resume of [false, true]) {
      const result = await assertFailed(root, 'ETIMEDOUT', { resume });
      const processes = await owned();
      assert.equal(processes.length, resume ? 2 : 1, 'Actual user implementation must start each attempt');
      for (const { pid, ppid } of processes) {
        gone(pid);
        assert.equal(ppid, process.pid, 'v2 ran in an extra test-worker process');
      }
      const event = (await checkpoint(root)).envelope.state.events.at(-1);
      assert.equal(event.tool, 'test:v2');
      assert.equal(event.signal, 'SIGKILL');
      assert.equal(result.attempts['test:v2'], resume ? 2 : 1);
      await assert.rejects(lstat(join(root, '.harness/lock')), code('ENOENT'));
      // A dead attempt must not retain an active marker when the next attempt starts.
      await rm(join(root, 'owned-test-active.txt'));
    }
    await assertFailed(root, 'RETRY_LIMIT', { resume: true });
    assert.equal((await owned()).length, 2, 'Exhausted resume started another process');
    await new Promise(resolve => setTimeout(resolve, 2400));
    for (const file of ['late-protected-side-effect.txt', 'overlapping-resume.txt']) {
      await assert.rejects(lstat(join(root, file)), code('ENOENT'));
    }
    for (const { pid } of await owned()) gone(pid);
    t.diagnostic(JSON.stringify({ ownedProcesses: await owned(), parentPid: process.pid,
      timeoutAttempts: 2, allReaped: true, lateSideEffect: false, overlappingResume: false,
      exhaustedResumeStartsChild: false }));
  } finally {
    // Also clean up the real orphan on an unfixed runtime / failed assertion.
    for (const { pid } of await owned()) {
      try { process.kill(pid, 'SIGKILL'); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  }
});

test('dead lock ownership is recoverable but active, malformed and linked owners are never removed', async t => {
  const { root, workspace } = await fixture(t);
  await safeOutput(root, '.harness/lock', { directories: true });
  await writeOutput(root, '.harness/lock/owner.json', { pid: process.pid, nonce: 'active-test' });
  await unchanged(root, async () => {
    await assert.rejects(withLock(root, () => assert.fail('Active owner entered')), code('EEXIST'));
  });
  await put(root, '.harness/lock/owner.json', { pid: 0, nonce: 'malformed' });
  await unchanged(root, async () => {
    await assert.rejects(withLock(root, () => assert.fail('Invalid owner entered')), code('INVALID_LOCK'));
  });
  // A completed local child supplies a real PID known to have exited.
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
  await new Promise((resolveExit, rejectExit) => {
    child.once('exit', resolveExit);
    child.once('error', rejectExit);
  });
  await put(root, '.harness/lock/owner.json', { pid: child.pid, nonce: 'dead-test' });
  let entered = false;
  await withLock(root, async () => { entered = true; });
  assert.equal(entered, true);
  await assert.rejects(lstat(join(root, '.harness/lock')), code('ENOENT'));
  await safeOutput(root, '.harness/lock', { directories: true });
  const target = join(workspace, 'owner-target.json');
  await writeFile(target, JSON.stringify({ pid: child.pid, nonce: 'linked-test' }));
  await symlink(target, join(root, '.harness/lock/owner.json'));
  await unchanged(workspace, async () => {
    await assert.rejects(withLock(root, () => assert.fail('Linked owner entered')), code('UNSAFE_PATH'));
  });
});

test('concurrent dead-owner recovery never overlaps exclusive operations', async t => {
  const { root } = await fixture(t);
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
  await new Promise((resolveExit, rejectExit) => {
    child.once('exit', resolveExit);
    child.once('error', rejectExit);
  });
  await writeOutput(root, '.harness/lock/owner.json', { pid: child.pid, nonce: 'dead-owner' });
  let active = 0;
  let entered = 0;
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => withLock(root, async () => {
    active++;
    entered++;
    assert.equal(active, 1, 'Recovered active lock was removed by another contender');
    await new Promise(resolveWait => setTimeout(resolveWait, 50));
    active--;
  })));
  assert.ok(entered >= 1);
  assert.equal(active, 0);
  for (const result of results.filter(result => result.status === 'rejected')) {
    assert.ok(['EEXIST', 'ENOENT'].includes(result.reason.code), result.reason.stack);
  }
  await withLock(root, async () => {});
  await assert.rejects(lstat(join(root, '.harness/lock-recovery')), code('ENOENT'));
});

test('checkpoint pointers and envelopes fail closed on corruption, including rechecksummed invalid state', async t => {
  const { root } = await fixture(t);
  await approveHarness(root, reason);
  await assertFailed(root, 'FAILED_ORCHESTRATION');
  const original = await checkpoint(root);
  const pointer = await readOutput(root, '.harness/latest.json');
  for (const value of [
    { runId: '../escape' }, { runId: '/absolute' }, { runId: pointer.runId, extra: true }, {},
  ]) {
    await put(root, '.harness/latest.json', value);
    await unchanged(root, async () => {
      await assert.rejects(harnessStatus(root), code('INVALID_CHECKPOINT'));
      await assert.rejects(executeHarness(root, { resume: true }), code('INVALID_CHECKPOINT'));
    });
  }
  await put(root, '.harness/latest.json', pointer);
  await put(root, original.path, '{invalid-json');
  await unchanged(root, async () => {
    await assert.rejects(harnessStatus(root), SyntaxError);
    await assert.rejects(executeHarness(root, { resume: true }), SyntaxError);
  });
  const originalState = original.envelope.state;
  for (const [name, mutate] of [
    ['checksum mismatch', envelope => { envelope.state.failure = 'tampered'; }],
    ['extra envelope key', envelope => { envelope.extra = true; }],
    ['unknown state key', envelope => { envelope.state.extra = true; }],
    ['wrong run id', envelope => { envelope.state.runId = randomUUID(); }],
    ['invalid status', envelope => { envelope.state.status = 'approved'; }],
    ['wrong step order', envelope => { envelope.state.steps.reverse(); }],
    ['skipped first completion', envelope => { envelope.state.completed = ['test:v2']; }],
    ['attempt without event', envelope => { envelope.state.attempts['inspect-input'] = 1; }],
    ['false passed status', envelope => { envelope.state.status = 'passed'; envelope.state.failure = null; }],
    ['unknown event', envelope => { envelope.state.events = [{ tool: 'forged' }]; }],
    ['too many events', envelope => { envelope.state.events = Array(11).fill({}); }],
  ]) {
    await t.test(name, async () => {
      const envelope = { state: structuredClone(originalState), checksum: original.envelope.checksum };
      mutate(envelope);
      if (name !== 'checksum mismatch') envelope.checksum = sha256(JSON.stringify(envelope.state));
      await put(root, original.path, envelope);
      await unchanged(root, async () => {
        await assert.rejects(harnessStatus(root), code('INVALID_CHECKPOINT'));
        await assert.rejects(executeHarness(root, { resume: true }), code('INVALID_CHECKPOINT'));
      });
    });
  }
  await rm(join(root, original.path));
  await unchanged(root, async () => {
    await assert.rejects(harnessStatus(root), code('INVALID_CHECKPOINT'));
    await assert.rejects(executeHarness(root, { resume: true }), code('ENOENT'));
  });
});

test('private reference: real timeout resumes the same fingerprint and completed resume is idempotent', async t => {
  const fixtureResult = await fixture(t, { privateSuccess: true });
  if (!fixtureResult) return;
  const { root } = fixtureResult;
  const approved = await approveHarness(root, reason);
  const timedOut = await assertFailed(root, 'ETIMEDOUT', { drill: 'timeout' });
  assert.equal(timedOut.intent, 'intentional-timeout');
  assert.equal(timedOut.attempts['inspect-input'], 1);
  const first = await checkpoint(root);
  assert.equal(first.envelope.state.fingerprint, approved.fingerprint);
  const event = first.envelope.state.events[0];
  assert.equal(event.childStarted, true);
  assert.equal(event.signal, 'SIGKILL');
  assert.equal(event.exitCode, null);
  assert.equal(event.timeoutMs, 100);
  const resumed = await executeHarness(root, { resume: true });
  assert.equal(resumed.status, 'passed');
  assert.equal(resumed.runId, timedOut.runId);
  assert.deepEqual(resumed.completed, ['inspect-input', 'test:v2']);
  assert.deepEqual(resumed.attempts, { 'inspect-input': 2, 'test:v2': 1 });
  const final = (await checkpoint(root)).envelope.state;
  assert.equal(final.fingerprint, approved.fingerprint);
  assert.deepEqual(final.events.map(value => [value.tool, value.status]), [
    ['inspect-input', 'failed'], ['inspect-input', 'passed'], ['test:v2', 'passed'],
  ]);
  assert.ok(final.events.every(value => value.childStarted === true));
  assert.deepEqual(final.events.at(-1).counts,
    { tests: 16, passed: 16, failed: 0, skipped: 0, todo: 0, cancelled: 0 });
  assert.equal((await harnessStatus(root)).status, 'passed');
  await unchanged(root, async () => {
    const again = await executeHarness(root, { resume: true });
    assert.equal(again.idempotent, true);
    assert.equal(again.runId, timedOut.runId);
    assert.equal(again.status, 'passed');
  });
});

test('private reference: forbidden drill records no child and cannot pass', async t => {
  const fixtureResult = await fixture(t, { privateSuccess: true });
  if (!fixtureResult) return;
  const { root } = fixtureResult;
  await approveHarness(root, reason);
  const result = await assertFailed(root, 'FORBIDDEN_TOOL', { drill: 'forbidden' });
  assert.deepEqual(result.completed, []);
  assert.deepEqual(result.attempts, { 'inspect-input': 0, 'test:v2': 0 });
  const events = (await checkpoint(root)).envelope.state.events;
  assert.equal(events.length, 1);
  assert.equal(events[0].childStarted, false);
  assert.equal(events[0].tool, 'forbidden-tool');
});

test('private reference: instruction/input/source changes require new approval AND a new run', async t => {
  for (const path of ['harness/instructions.txt', 'data/test-results.json', 'src/summarize-results.mjs']) {
    await t.test(path, async t => {
      const fixtureResult = await fixture(t, { privateSuccess: true });
      if (!fixtureResult) return;
      const { root } = fixtureResult;
      await approveHarness(root, reason);
      const previous = await executeHarness(root);
      assert.equal(previous.status, 'passed');
      const old = await checkpoint(root);
      await writeFile(join(root, path), `${await readFile(join(root, path), 'utf8')}\n`);
      await unchanged(root, async () => {
        const status = await harnessStatus(root);
        assert.equal(status.status, 'stale');
        assert.equal(status.actualStatus, 'passed');
        assert.equal(status.evidenceFingerprint, old.envelope.state.fingerprint);
        assert.notEqual(status.fingerprint, status.evidenceFingerprint);
        await assert.rejects(executeHarness(root, { resume: true }), code('APPROVAL_REQUIRED'));
        await assert.rejects(executeHarness(root), code('APPROVAL_REQUIRED'));
      });
      const approval = await approveHarness(root, reason);
      assert.notEqual(approval.fingerprint, old.envelope.state.fingerprint);
      await unchanged(root, () => assert.rejects(
        executeHarness(root, { resume: true }), code('STALE_EVIDENCE')));
      const fresh = await executeHarness(root);
      assert.equal(fresh.status, 'passed');
      assert.notEqual(fresh.runId, previous.runId);
      assert.equal((await checkpoint(root)).envelope.state.fingerprint, approval.fingerprint);
      assert.equal(await readFile(join(root, old.path), 'utf8'), old.bytes);
    });
  }
});
