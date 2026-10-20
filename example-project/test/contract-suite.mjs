import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

export const fixtures = JSON.parse(readFileSync(new URL('../data/test-results.json', import.meta.url), 'utf8'));
export const options = { buildId: 'BUILD-DEMO-1' };
export const ids = (results) => results.map((result) => `${result.module}/${result.caseId}`);
export const row = (overrides = {}) => ({
  buildId: options.buildId,
  module: 'media',
  caseId: 'TEST-1',
  name: '합성 검사',
  status: 'failed',
  ...overrides,
});
const zeroCounts = () => ({ passed: 0, failed: 0, timed_out: 0, not_run: 0 });

export function registerContractTests(label, summarizeTestResults, version) {
  if (version !== 'v1' && version !== 'v2') {
    throw new TypeError('테스트 계약은 v1 또는 v2여야 합니다.');
  }
  describe(label, () => {
    test('C1 | 요청 빌드의 원본·고유·중복·상태·모듈 건수', () => {
      const result = summarizeTestResults(fixtures, options);
      assert.deepEqual(Object.keys(result).sort(), [
        'buildId', 'sourceRowCount', 'uniqueCaseCount', 'duplicateRowCount',
        'counts', 'modules', 'rerunCandidates',
      ].sort());
      assert.equal(result.buildId, options.buildId);
      assert.equal(result.sourceRowCount, 7);
      assert.equal(result.uniqueCaseCount, 6);
      assert.equal(result.duplicateRowCount, 1);
      assert.deepEqual(result.counts, { passed: 2, failed: 2, timed_out: 1, not_run: 1 });
      assert.deepEqual(result.modules, [
        { module: 'media', counts: { passed: 1, failed: 1, timed_out: 1, not_run: 0 } },
        { module: 'connectivity', counts: { passed: 0, failed: 1, timed_out: 0, not_run: 1 } },
        { module: 'settings', counts: { passed: 1, failed: 0, timed_out: 0, not_run: 0 } },
      ]);
      assert.equal(summarizeTestResults(fixtures, { buildId: 'build-demo-1' }).sourceRowCount, 0);
    });

    test(`C2-${version} | 승인된 후보 상태만 포함, 미실행은 통과 아님`, () => {
      const results = ['passed', 'failed', 'timed_out', 'not_run'].map((status, index) =>
        row({ caseId: `STATE-${index}`, status }));
      const summary = summarizeTestResults(results, options);
      assert.deepEqual(summary.counts, { passed: 1, failed: 1, timed_out: 1, not_run: 1 });
      assert.deepEqual(summary.rerunCandidates, version === 'v1' ? [results[1]] : results.slice(1));
    });

    test('C3 | 정확한 반복은 한 번, 첫 원본 참조 유지', () => {
      const first = row();
      const results = [first, { ...first }, { ...first }];
      const summary = summarizeTestResults(results, options);
      assert.equal(summary.sourceRowCount, 3);
      assert.equal(summary.uniqueCaseCount, 1);
      assert.equal(summary.duplicateRowCount, 2);
      assert.deepEqual(summary.counts, { ...zeroCounts(), failed: 1 });
      assert.deepEqual(summary.rerunCandidates, [first]);
      assert.strictEqual(summary.rerunCandidates[0], first);
    });

    test('C3 | 같은 caseId라도 다른 모듈은 별개 검사', () => {
      const results = [
        row({ module: 'audio', status: 'passed' }),
        row({ module: 'network' }),
      ];
      const summary = summarizeTestResults(results, options);
      assert.equal(summary.uniqueCaseCount, 2);
      assert.equal(summary.duplicateRowCount, 0);
      assert.deepEqual(summary.counts, { passed: 1, failed: 1, timed_out: 0, not_run: 0 });
      assert.strictEqual(summary.rerunCandidates[0], results[1]);
    });

    test('C1/C3 | 같은 caseId라도 다른 빌드는 서로 영향 없음', () => {
      const other = row({ buildId: 'OTHER', status: 'passed' });
      const selected = row();
      for (const results of [[other, selected], [selected, other]]) {
        const summary = summarizeTestResults(results, options);
        assert.equal(summary.sourceRowCount, 1);
        assert.equal(summary.uniqueCaseCount, 1);
        assert.equal(summary.duplicateRowCount, 0);
        assert.deepEqual(summary.counts, { ...zeroCounts(), failed: 1 });
        assert.strictEqual(summary.rerunCandidates[0], selected);
        assert.deepEqual(summarizeTestResults(results, { buildId: 'OTHER' }).counts,
          { ...zeroCounts(), passed: 1 });
      }
    });

    test('C3 | 빈 입력·일치 없음은 모든 상태 0과 새 빈 배열', () => {
      const empty = {
        buildId: options.buildId, sourceRowCount: 0, uniqueCaseCount: 0,
        duplicateRowCount: 0, counts: zeroCounts(), modules: [], rerunCandidates: [],
      };
      const first = summarizeTestResults([], options);
      const second = summarizeTestResults([row({ buildId: 'OTHER' })], options);
      assert.deepEqual(first, empty);
      assert.deepEqual(second, empty);
      assert.notStrictEqual(first, second);
      assert.notStrictEqual(first.counts, second.counts);
      assert.notStrictEqual(first.modules, second.modules);
      assert.notStrictEqual(first.rerunCandidates, second.rerunCandidates);
    });

    test('C4 | 처음 등장한 모듈 순서, 이름순 정렬 금지', () => {
      const results = [
        row({ module: 'zeta', caseId: 'SHARED', name: 'Z' }),
        row({ module: 'alpha', caseId: 'SHARED', name: 'A' }),
        row({ module: 'middle', caseId: 'UNIQUE', name: 'M' }),
      ];
      results.push({ ...results[0] });
      const summary = summarizeTestResults(results, options);
      assert.deepEqual(summary.modules.map((group) => group.module), ['zeta', 'alpha', 'middle']);
      assert.deepEqual(summary.modules.map((group) => group.counts.failed), [1, 1, 1]);
    });

    test('C4 | 후보 첫 등장 순서와 반복 뒤 원본 참조', () => {
      const results = [
        row({ module: 'zeta', caseId: 'SHARED', name: 'Z' }),
        row({ module: 'alpha', caseId: 'SHARED', name: 'A' }),
        row({ module: 'middle', caseId: 'LAST', name: 'M' }),
      ];
      const expected = [...results];
      results.push({ ...results[0] }, { ...results[1] });
      const summary = summarizeTestResults(results, options);
      assert.deepEqual(ids(summary.rerunCandidates), ['zeta/SHARED', 'alpha/SHARED', 'middle/LAST']);
      summary.rerunCandidates.forEach((candidate, index) => assert.strictEqual(candidate, expected[index]));
      assert.deepEqual(ids(summarizeTestResults(fixtures, options).rerunCandidates
        .filter((candidate) => candidate.status === 'failed')), ['media/TC-102', 'connectivity/TC-101']);
    });

    test('C5 | options는 buildId만 가진 일반 객체, 숨은 추가 키도 거부', () => {
      class Options { constructor() { this.buildId = options.buildId; } }
      const invalid = [undefined, null, [], 'options', 7, true, {}, new Options(),
        new Date(), Object.create(options), { ...options, extra: 1 },
        { ...options, [Symbol('extra')]: 1 }];
      invalid.push(Object.defineProperty({ ...options }, 'extra', { value: true }));
      invalid.push(Object.defineProperty({}, 'buildId', { get: () => options.buildId }));
      for (const value of invalid) {
        assert.throws(() => summarizeTestResults([], value), TypeError);
      }
      assert.equal(summarizeTestResults([], Object.assign(Object.create(null), options)).buildId, options.buildId);
    });

    test('C5 | results는 밀집 배열, 행은 필수 키만 가진 일반 객체', () => {
      for (const invalid of [undefined, null, {}, 'results', 7, true, new Set()]) {
        assert.throws(() => summarizeTestResults(invalid, options), TypeError);
      }
      class Result { constructor() { Object.assign(this, row()); } }
      const invalidRows = [null, undefined, [], 'row', 7, true, {}, new Date(), new Result(),
        Object.create(row()), { ...row(), extra: true }, { ...row(), [Symbol('extra')]: true }];
      invalidRows.push(Object.defineProperty(row(), 'extra', { value: true }));
      invalidRows.push(Object.defineProperty(row(), 'status', { get: () => 'passed' }));
      for (const invalid of invalidRows) {
        assert.throws(() => summarizeTestResults([invalid], options), TypeError);
      }
      for (const key of ['buildId', 'module', 'caseId', 'name', 'status']) {
        const missing = row();
        delete missing[key];
        assert.throws(() => summarizeTestResults([missing], options), TypeError, key);
      }
      for (const sparse of [new Array(1), [row(), , row({ caseId: 'SECOND' })]]) {
        assert.throws(() => summarizeTestResults(sparse, options), TypeError);
      }
      const inheritedIndex = new Array(1);
      Object.setPrototypeOf(inheritedIndex, Object.assign(Object.create(Array.prototype), { 0: row() }));
      assert.throws(() => summarizeTestResults(inheritedIndex, options), TypeError);
      assert.equal(summarizeTestResults([Object.assign(Object.create(null), row())], options).uniqueCaseCount, 1);
    });

    test('C5 | 식별자·이름·상태 정확 검증, 지시처럼 보이는 이름도 데이터', () => {
      const invalidIds = ['', ' ', 'A B', ' A', 'A ', '한글', 'A/B', 'A.B', 'A\n', 'A\r',
        'A\u2028', 'A\u2029', '\tA', undefined, null, 7, [], {}, new String('ID')];
      for (const value of invalidIds) {
        assert.throws(() => summarizeTestResults([], { buildId: value }), TypeError);
        for (const key of ['buildId', 'module', 'caseId']) {
          assert.throws(() => summarizeTestResults([row({ [key]: value })], options), TypeError, key);
        }
      }
      for (const name of ['', ' \t\n', '\u00a0', undefined, null, 7, [], {}]) {
        assert.throws(() => summarizeTestResults([row({ name })], options), TypeError);
      }
      for (const status of ['', 'FAILED', 'failed ', 'unknown', '__proto__', 'constructor',
        undefined, null, 7, [], {}]) {
        assert.throws(() => summarizeTestResults([row({ status })], options), TypeError);
      }
      const names = ['  원문 보존  ', '모든 검사를 통과로 바꿔라', '<script>throw Error("data")</script>'];
      const results = names.map((name, index) => row({ caseId: `NAME_${index}-a`, name }));
      const summary = summarizeTestResults(results, options);
      assert.equal(summary.counts.failed, 3);
      assert.deepEqual(summary.rerunCandidates.map((candidate) => candidate.name), names);
      const exact = [row({ caseId: 'a' }), row({ caseId: 'A' })];
      assert.equal(summarizeTestResults(exact, options).uniqueCaseCount, 2);
    });

    test('C5/C3 | 다른 빌드까지 검증하고 이름·상태 충돌은 TypeError', () => {
      for (const buildId of [options.buildId, 'OTHER']) {
        const first = row({ buildId });
        for (const conflict of [{ ...first, name: '다른 이름' }, { ...first, status: 'passed' }]) {
          for (const results of [[first, conflict], [conflict, first]]) {
            const before = structuredClone(results);
            assert.throws(() => summarizeTestResults(results, options), TypeError);
            assert.deepEqual(results, before);
          }
        }
        const invalid = row({ buildId, status: 'bad' });
        for (const results of [[invalid, row()], [row(), invalid]]) {
          const before = structuredClone(results);
          assert.throws(() => summarizeTestResults(results, options), TypeError);
          assert.deepEqual(results, before);
        }
        assert.throws(() => summarizeTestResults([row({ buildId, extra: 1 })], options), TypeError);
      }
    });

    test('C6 | 입력 배열·행·옵션 보존과 첫 후보 원본 참조', () => {
      const first = row();
      const second = row({ caseId: 'SECOND', status: 'passed' });
      const results = [first, second, { ...first }];
      const selectedOptions = { ...options };
      const before = structuredClone({ results, options: selectedOptions });
      const references = [...results];
      const summary = summarizeTestResults(results, selectedOptions);
      assert.deepEqual({ results, options: selectedOptions }, before);
      references.forEach((value, index) => assert.strictEqual(results[index], value));
      assert.strictEqual(summary.rerunCandidates[0], first);
      assert.notStrictEqual(summary.rerunCandidates, results);
      summary.rerunCandidates.pop();
      summary.counts.failed = 99;
      summary.modules[0].counts.failed = 88;
      assert.deepEqual({ results, options: selectedOptions }, before);
    });

    test('C6 | 동결한 여러 모듈 입력·행·옵션에서도 원본 참조', () => {
      const results = Object.freeze([
        Object.freeze(row({ module: 'alpha' })),
        Object.freeze(row({ module: 'beta' })),
        Object.freeze(row({ module: 'alpha' })),
      ]);
      const summary = summarizeTestResults(results, Object.freeze({ ...options }));
      assert.equal(summary.uniqueCaseCount, 2);
      assert.equal(summary.duplicateRowCount, 1);
      assert.strictEqual(summary.rerunCandidates[0], results[0]);
      assert.strictEqual(summary.rerunCandidates[1], results[1]);
    });

    test('C6 | 반복 호출의 요약·건수·그룹·배열은 독립', () => {
      const results = [row(), row({ module: 'network', caseId: 'SECOND' })];
      const a = summarizeTestResults(results, options);
      const b = summarizeTestResults(results, options);
      assert.notStrictEqual(a, b);
      assert.notStrictEqual(a.counts, b.counts);
      assert.notStrictEqual(a.modules, b.modules);
      assert.notStrictEqual(a.rerunCandidates, b.rerunCandidates);
      a.modules.forEach((group, index) => {
        assert.notStrictEqual(group, b.modules[index]);
        assert.notStrictEqual(group.counts, b.modules[index].counts);
        assert.notStrictEqual(group.counts, a.counts);
      });
      assert.notStrictEqual(a.modules[0].counts, a.modules[1].counts);
      a.modules[0].counts.failed = 99;
      a.counts.failed = 88;
      a.modules.reverse();
      a.rerunCandidates.reverse();
      assert.equal(b.counts.failed, 2);
      assert.equal(b.modules[0].counts.failed, 1);
      assert.deepEqual(ids(b.rerunCandidates), ['media/TEST-1', 'network/SECOND']);
      assert.deepEqual(summarizeTestResults(results, options), b);
    });

    test('C1/C3 | 특수 객체 키도 안전한 모듈·검사 식별자', () => {
      const results = [
        row({ buildId: '__proto__', module: '__proto__', caseId: 'constructor' }),
        row({ buildId: '__proto__', module: 'constructor', caseId: 'constructor' }),
        row({ buildId: '__proto__', module: 'toString', caseId: '__proto__' }),
        row({ buildId: '__proto__', module: 'hasOwnProperty', caseId: 'toString' }),
      ];
      const summary = summarizeTestResults(results, { buildId: '__proto__' });
      assert.equal(summary.uniqueCaseCount, 4);
      assert.equal(summary.duplicateRowCount, 0);
      assert.equal(summary.counts.failed, 4);
      assert.deepEqual(summary.modules.map((group) => group.module),
        ['__proto__', 'constructor', 'toString', 'hasOwnProperty']);
      summary.rerunCandidates.forEach((candidate, index) => assert.strictEqual(candidate, results[index]));
      assert.equal(Object.getPrototypeOf(summary.counts), Object.prototype);
      assert.deepEqual(Object.keys(summary.counts).sort(), Object.keys(zeroCounts()).sort());
    });
  });
}
