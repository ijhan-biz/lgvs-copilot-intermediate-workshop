import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { baselineFiles, readScopedFile, sha256 } from './scoped-files.mjs';
import { parseCounts } from './evidence-core.mjs';
import { validateInput } from '../src/validate-input.mjs';
import { fail, readOutput, safeRoot, writeOutput, withLock } from './harness-paths.mjs';

export const requiredSteps = Object.freeze(['inspect-input', 'test:v2']);
export const fingerprintFiles = Object.freeze([...new Set([
  ...baselineFiles, 'harness/workflow.json', 'harness/run.mjs', 'harness/instructions.txt',
  'data/test-results.json', 'package.json', 'test/v2.test.mjs', 'test/contract-suite.mjs',
  'scripts/scoped-files.mjs', 'scripts/evidence-core.mjs',
  'scripts/harness.mjs', 'scripts/harness-core.mjs', 'scripts/harness-paths.mjs', 'scripts/harness-task.mjs',
])]);
const hashPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[a-f0-9-]{36}$/;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const digest = value => sha256(JSON.stringify(value));

function keys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !equal(Object.keys(value).sort(), [...expected].sort())) fail(code);
}

export function validateWorkflow(config) {
  keys(config, ['schemaVersion', 'purpose', 'input', 'context', 'allowedTools', 'steps', 'output', 'timeoutMs', 'retryLimit'], 'INVALID_CONFIG');
  if (config.schemaVersion !== 1 || typeof config.purpose !== 'string' ||
      config.purpose.trim().length < 12 || config.purpose.length > 2000 || /TODO/i.test(config.purpose) ||
      config.input !== 'data/test-results.json' || !equal(config.context, ['harness/instructions.txt']) ||
      !equal(config.allowedTools, requiredSteps) || !equal(config.steps, requiredSteps) ||
      config.output !== '.harness' || !Number.isInteger(config.timeoutMs) ||
      config.timeoutMs < 50 || config.timeoutMs > 10000 ||
      !Number.isInteger(config.retryLimit) || config.retryLimit < 0 || config.retryLimit > 2) fail('INVALID_CONFIG');
  return config;
}

export async function inspectProject(root) {
  await safeRoot(root);
  const hashes = {};
  for (const file of fingerprintFiles) hashes[file] = sha256(await readScopedFile(root, file));
  const config = validateWorkflow(JSON.parse(await readScopedFile(root, 'harness/workflow.json')));
  const instructions = (await readScopedFile(root, 'harness/instructions.txt')).toString('utf8');
  if (instructions.trim().length < 40 || /TODO/i.test(instructions)) fail('INCOMPLETE_INSTRUCTIONS');
  const input = JSON.parse(await readScopedFile(root, config.input));
  if (!Array.isArray(input) || !input.length) fail('INVALID_INPUT');
  try {
    validateInput(input, { buildId: input[0]?.buildId });
  } catch (error) {
    if (error instanceof TypeError) fail('INVALID_INPUT', error.message);
    throw error;
  }
  // Bind the exact executable too, rather than just its version string.
  hashes['node-runtime'] = sha256(await readFile(process.execPath));
  return { config, hashes, fingerprint: digest(hashes) };
}

async function loadOrchestration(root, fingerprint) {
  const module = await import(`${pathToFileURL(join(root, 'harness/run.mjs')).href}?fingerprint=${fingerprint}`);
  if (typeof module.default !== 'function') fail('INVALID_ORCHESTRATION');
  return module.default;
}

export async function checkHarness(root) {
  const snapshot = await inspectProject(root);
  await loadOrchestration(root, snapshot.fingerprint);
  return { status: 'ready', fingerprint: snapshot.fingerprint, steps: snapshot.config.steps,
    scope: '설정/함수 형식 검사만. 실제 실행 완료 증거가 아닙니다.' };
}

export async function approveHarness(root, reason) {
  if (typeof reason !== 'string' || reason.trim().length < 8 || reason.length > 1000 || /TODO/i.test(reason)) fail('REVIEW_REASON_REQUIRED');
  const snapshot = await inspectProject(root);
  await loadOrchestration(root, snapshot.fingerprint);
  return withLock(root, async () => {
    if ((await inspectProject(root)).fingerprint !== snapshot.fingerprint) fail('STATE_CHANGED');
    await writeOutput(root, '.harness/approval.json', {
      schemaVersion: 1, fingerprint: snapshot.fingerprint, reason: reason.trim(),
      reviewedAt: new Date().toISOString(), declaration: 'local-human-review-not-authenticated',
    });
    return { status: 'approved', fingerprint: snapshot.fingerprint, declaration: 'local-human-review-not-authenticated' };
  });
}

async function verifyApproval(root, fingerprint) {
  const approval = await readOutput(root, '.harness/approval.json');
  keys(approval, ['schemaVersion', 'fingerprint', 'reason', 'reviewedAt', 'declaration'], 'INVALID_APPROVAL');
  if (approval.schemaVersion !== 1 || approval.fingerprint !== fingerprint ||
      typeof approval.reason !== 'string' || approval.reason.trim().length < 8 || approval.reason.length > 1000 ||
      /TODO/i.test(approval.reason) || typeof approval.reviewedAt !== 'string' ||
      !Number.isFinite(Date.parse(approval.reviewedAt)) ||
      approval.declaration !== 'local-human-review-not-authenticated') fail('APPROVAL_REQUIRED');
}

function validateState(state, config) {
  keys(state, ['schemaVersion', 'runId', 'fingerprint', 'status', 'mode', 'intent', 'steps', 'completed', 'attempts', 'events', 'failure'], 'INVALID_CHECKPOINT');
  if (state.schemaVersion !== 1 || !idPattern.test(state.runId) || !hashPattern.test(state.fingerprint) ||
      !['running', 'failed', 'passed'].includes(state.status) || !['run', 'timeout', 'forbidden'].includes(state.mode) ||
      !['normal-execution', 'intentional-timeout', 'intentional-forbidden'].includes(state.intent) ||
      !equal(state.steps, requiredSteps) || !Array.isArray(state.completed) ||
      !equal(state.completed, requiredSteps.slice(0, state.completed.length)) ||
      state.completed.length > requiredSteps.length || !Array.isArray(state.events) ||
      state.events.length > 10 || !(state.failure === null || typeof state.failure === 'string')) fail('INVALID_CHECKPOINT');
  keys(state.attempts, requiredSteps, 'INVALID_CHECKPOINT');
  const successes = [];
  const attempts = Object.fromEntries(requiredSteps.map(step => [step, 0]));
  for (const event of state.events) {
    keys(event, ['tool', 'status', 'attempt', 'childStarted', 'exitCode', 'signal', 'errorCode', 'timeoutMs', 'stdout', 'stderr', 'counts'], 'INVALID_CHECKPOINT');
    if (event.tool === 'forbidden-tool') {
      if (event.childStarted !== false || event.status !== 'failed' || event.errorCode !== 'FORBIDDEN_TOOL') fail('INVALID_CHECKPOINT');
      continue;
    }
    const interrupted = event.childStarted === null && event.status === 'failed' &&
      event.errorCode === 'INTERRUPTED_OR_NOT_STARTED';
    if (!requiredSteps.includes(event.tool) || event.tool !== requiredSteps[successes.length] ||
        !['passed', 'failed'].includes(event.status) || (event.childStarted !== true && !interrupted) ||
        event.attempt !== ++attempts[event.tool] || attempts[event.tool] > config.retryLimit + 1 ||
        !Number.isInteger(event.timeoutMs) || event.timeoutMs < 1 || event.timeoutMs > 10000 ||
        typeof event.stdout !== 'string' || typeof event.stderr !== 'string' ||
        (event.status === 'passed' && (event.exitCode !== 0 || event.signal !== null || event.errorCode !== null))) fail('INVALID_CHECKPOINT');
    if (event.status === 'passed') {
      if (event.tool === 'test:v2' && !validCounts(event.counts)) fail('INVALID_CHECKPOINT');
      successes.push(event.tool);
    }
  }
  if (!equal(attempts, state.attempts) || !equal(successes, state.completed) ||
      (state.status === 'passed' && (state.completed.length !== requiredSteps.length || state.failure !== null))) fail('INVALID_CHECKPOINT');
  return state;
}

async function latestState(root, config) {
  const latest = await readOutput(root, '.harness/latest.json');
  keys(latest, ['runId'], 'INVALID_CHECKPOINT');
  if (!idPattern.test(latest.runId)) fail('INVALID_CHECKPOINT');
  const envelope = await readOutput(root, `.harness/runs/${latest.runId}/checkpoint.json`);
  keys(envelope, ['state', 'checksum'], 'INVALID_CHECKPOINT');
  if (envelope.checksum !== digest(envelope.state) || envelope.state.runId !== latest.runId) fail('INVALID_CHECKPOINT');
  return validateState(envelope.state, config);
}

export async function harnessStatus(root) {
  const snapshot = await inspectProject(root);
  let state;
  try { state = await latestState(root, snapshot.config); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // Missing only the pointer is 'none'; an incomplete pointed-to run is corruption.
    try { await readOutput(root, '.harness/latest.json'); } catch (pointerError) {
      if (pointerError.code === 'ENOENT') return { status: 'none', actualStatus: 'none', fingerprint: snapshot.fingerprint };
      throw pointerError;
    }
    fail('INVALID_CHECKPOINT');
  }
  return {
    status: state.fingerprint === snapshot.fingerprint ? state.status : 'stale',
    actualStatus: state.status, fingerprint: snapshot.fingerprint, evidenceFingerprint: state.fingerprint,
    runId: state.runId, intent: state.intent, completed: state.completed, attempts: state.attempts, failure: state.failure,
  };
}

function validCounts(counts) {
  return counts && equal(counts, { tests: 16, passed: 16, failed: 0, skipped: 0, todo: 0, cancelled: 0 });
}

function runChild(root, tool, config, mode, attempt) {
  const timeout = mode === 'timeout' ? Math.min(config.timeoutMs, 100) : config.timeoutMs;
  const args = mode === 'timeout' ? ['scripts/harness-task.mjs', 'timeout']
    : tool === 'inspect-input' ? ['scripts/harness-task.mjs', 'inspect-input']
      // Standalone node:test runs in this owned process. --test would add a
      // worker; its no-isolation flag is unavailable on early Node 22 releases.
      : ['--test-reporter=tap', 'test/v2.test.mjs'];
  const env = { ...process.env, NO_COLOR: '1' };
  for (const key of ['NODE_OPTIONS', 'NODE_TEST_CONTEXT', 'FORCE_COLOR']) delete env[key];
  const result = spawnSync(process.execPath, args, {
    cwd: root, env, encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024,
  });
  const counts = tool === 'test:v2' ? Object.freeze(parseCounts(result.stdout ?? '')) : null;
  const passed = result.status === 0 && !result.signal && !result.error && (tool !== 'test:v2' || validCounts(counts));
  return Object.freeze({
    tool, status: passed ? 'passed' : 'failed', attempt, childStarted: true,
    exitCode: result.status, signal: result.signal, errorCode: result.error?.code ?? null, timeoutMs: timeout,
    stdout: result.stdout ?? '', stderr: result.stderr ?? '', counts,
  });
}

export async function executeHarness(root, { resume = false, drill = null } = {}) {
  if (drill !== null && !['timeout', 'forbidden'].includes(drill)) fail('INVALID_DRILL');
  const initial = await inspectProject(root);
  // No learner execution or run output until a current local declaration exists.
  await verifyApproval(root, initial.fingerprint);
  return withLock(root, async () => {
    if ((await inspectProject(root)).fingerprint !== initial.fingerprint) fail('STATE_CHANGED');
    const state = resume ? await latestState(root, initial.config) : {
      schemaVersion: 1, runId: randomUUID(), fingerprint: initial.fingerprint, status: 'running',
      mode: drill ?? 'run', intent: drill ? `intentional-${drill}` : 'normal-execution',
      steps: [...requiredSteps], completed: [], attempts: { 'inspect-input': 0, 'test:v2': 0 }, events: [], failure: null,
    };
    if (state.fingerprint !== initial.fingerprint) fail('STALE_EVIDENCE', 'Changed fingerprint: review and start a new run');
    if (resume && state.status === 'passed') return { status: 'passed', runId: state.runId, idempotent: true, completed: state.completed };
    let saves = Promise.resolve();
    const save = () => {
      // Snapshot at enqueue time; atomic renames must land in transition order.
      const snapshot = structuredClone(state);
      saves = saves.catch(() => {}).then(() => writeOutput(
        root, `.harness/runs/${state.runId}/checkpoint.json`, { state: snapshot, checksum: digest(snapshot) },
      ));
      return saves;
    };
    state.status = 'running';
    if (resume) state.mode = 'run';
    state.failure = null;
    await save();
    await writeOutput(root, '.harness/latest.json', { runId: state.runId });
    let phase = 'new';
    let pending = null;
    let terminal = false;
    let aborted = false;
    let closed = false;
    const operations = [];
    const receipts = new WeakSet();
    const assertCurrent = async () => {
      if (closed || aborted) fail('CLOSED_SESSION');
      if ((await inspectProject(root)).fingerprint !== initial.fingerprint) fail('STATE_CHANGED');
      await verifyApproval(root, initial.fingerprint);
      if (closed || aborted) fail('CLOSED_SESSION');
    };
    const api = Object.freeze({
      steps: requiredSteps,
      async validate() {
        if (phase !== 'new') fail('INVALID_SEQUENCE');
        await assertCurrent();
        phase = 'validated';
      },
      async verifyApproval() {
        if (phase !== 'validated') fail('INVALID_SEQUENCE');
        await assertCurrent();
        phase = 'approved';
      },
      isComplete(step) {
        if (closed || phase !== 'approved' || !requiredSteps.includes(step)) fail('INVALID_SEQUENCE');
        return state.completed.includes(step);
      },
      async runStep(step) {
        if (!requiredSteps.includes(step)) fail('FORBIDDEN_TOOL');
        if (closed || phase !== 'approved' || terminal || aborted || pending || step !== requiredSteps[state.completed.length]) {
          aborted = true;
          fail('INVALID_SEQUENCE');
        }
        // Reserve before awaiting: concurrent calls cannot spawn unrecorded children.
        pending = { step };
        await assertCurrent();
        if (aborted) fail('INVALID_SEQUENCE');
        if (state.attempts[step] >= initial.config.retryLimit + 1) fail('RETRY_LIMIT');
        // The forbidden drill exercises the same allowlist gate before invoking the child.
        if (!resume && drill === 'forbidden') {
          if (!requiredSteps.includes('forbidden-tool')) {
            const result = Object.freeze({
              tool: 'forbidden-tool', status: 'failed', attempt: 0, childStarted: false,
              exitCode: null, signal: null, errorCode: 'FORBIDDEN_TOOL', timeoutMs: 0, stdout: '', stderr: '', counts: null,
            });
            pending = result;
            receipts.add(result);
            return result;
          }
        }
        const attempt = ++state.attempts[step];
        const reservation = {
          tool: step, status: 'failed', attempt, childStarted: null, exitCode: null, signal: null,
          errorCode: 'INTERRUPTED_OR_NOT_STARTED', timeoutMs: initial.config.timeoutMs,
          stdout: '', stderr: '', counts: null,
        };
        state.events.push(reservation);
        // Consume the bounded attempt before launching. A killed parent cannot reset retries.
        await save();
        if (closed || aborted) fail('CLOSED_SESSION');
        const result = runChild(root, step, initial.config, resume ? 'run' : drill, attempt);
        pending = result;
        receipts.add(result);
        return result;
      },
      async recordResult(step, result) {
        if (closed || phase !== 'approved' || step !== requiredSteps[state.completed.length] ||
            !requiredSteps.includes(step) || pending !== result || !receipts.has(result) ||
            (result.tool !== step && result.tool !== 'forbidden-tool')) fail('INVALID_RECEIPT');
        receipts.delete(result);
        phase = 'recording';
        if (result.childStarted) state.events[state.events.length - 1] = result;
        else state.events.push(result);
        if (result.childStarted) state.attempts[step] = result.attempt;
        if (result.status === 'passed') state.completed.push(step);
        await save();
        await assertCurrent();
        pending = null;
        phase = result.status === 'passed' ? 'approved' : 'must-stop';
      },
      async stop(result) {
        if (closed || phase !== 'must-stop' || result !== state.events.at(-1)) fail('INVALID_SEQUENCE');
        state.status = 'failed';
        state.failure = result.errorCode ?? 'STEP_FAILED';
        terminal = true;
        await save();
      },
      async finish() {
        if (closed || phase !== 'approved' || terminal || aborted || pending || !equal(state.completed, requiredSteps)) fail('INCOMPLETE_REQUIRED_STEPS');
        await assertCurrent();
        state.status = 'passed';
        state.failure = null;
        terminal = true;
        await save();
      },
    });
    const trackedApi = Object.freeze(Object.fromEntries(Object.entries(api).map(([key, value]) => [
      key, typeof value !== 'function' || key === 'isComplete' ? value : (...args) => {
        const operation = { settled: false, error: null };
        operation.promise = phase === 'recording'
          ? Promise.reject(Object.assign(new Error('Await recordResult before the next transition'), { code: 'UNAWAITED_OPERATION' }))
          : value(...args);
        operations.push(operation);
        // Observe unawaited rejections too; the session still fails, never silently succeeds.
        operation.promise.then(() => { operation.settled = true; }, error => {
          operation.settled = true;
          operation.error = error;
        });
        return operation.promise;
      },
    ])));
    let failure = null;
    try {
      const orchestrate = await loadOrchestration(root, initial.fingerprint);
      await assertCurrent();
      await orchestrate(trackedApi);
      if (operations.some(operation => !operation.settled)) fail('UNAWAITED_OPERATION');
      if (!terminal || aborted || pending) fail('FAILED_ORCHESTRATION', 'No protected finish/stop receipt; returned values are not evidence');
      await assertCurrent();
    } catch (error) {
      failure = error;
      aborted = true;
    } finally {
      closed = true;
      // No pending filesystem/child work may outlive the exclusive session lock.
      await Promise.allSettled(operations.map(operation => operation.promise));
    }
    failure ??= operations.find(operation => operation.error)?.error ?? null;
    if (failure) {
      state.status = 'failed';
      state.failure = failure.code ?? 'FAILED_ORCHESTRATION';
      await save();
    }
    return { status: state.status, actualStatus: state.status, runId: state.runId, intent: state.intent,
      completed: state.completed, attempts: state.attempts, failure: state.failure };
  });
}
