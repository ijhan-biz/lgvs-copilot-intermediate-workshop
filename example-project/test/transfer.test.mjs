import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { summarizeTestResults } from '../src/summarize-results.mjs';

const results = JSON.parse(readFileSync(new URL('../data/transfer-results.json', import.meta.url), 'utf8'));
const options = { buildId: 'BUILD-TRANSFER-1' };

// 실행 전에 coreRecord.expected와 본인이 작성한 테스트를 저장하고 고정한다.
const expectedIds = null;

test('독립 판단 과제 | 학습자가 작성한 후보 예측', () => {
  assert.ok(Array.isArray(expectedIds), 'not-authored: 요약 실행 전에 후보 ID 배열을 직접 작성·저장하세요. 제품 결함이 아닙니다.');
  assert.ok(expectedIds.every((id) => typeof id === 'string'), 'module/caseId 문자열 배열을 작성하세요.');
  const actualIds = summarizeTestResults(results, options).rerunCandidates
    .map((result) => `${result.module}/${result.caseId}`);
  assert.deepEqual(actualIds, expectedIds);
});
