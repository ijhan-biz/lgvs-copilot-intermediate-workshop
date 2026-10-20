import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeTestResults } from '../src/summarize-results.mjs';

test('학습자 예제 | 단일 실패 검사 요약 (직접 추가한 테스트로 세지 않음)', () => {
  const result = {
    buildId: 'MY-BUILD', module: 'media', caseId: 'MY-CASE', name: '합성 예제', status: 'failed',
  };
  const summary = summarizeTestResults([result], { buildId: 'MY-BUILD' });
  assert.equal(summary.sourceRowCount, 1);
  assert.equal(summary.uniqueCaseCount, 1);
  assert.equal(summary.duplicateRowCount, 0);
  assert.deepEqual(summary.counts, { passed: 0, failed: 1, timed_out: 0, not_run: 0 });
  assert.deepEqual(summary.rerunCandidates, [result]);
});
