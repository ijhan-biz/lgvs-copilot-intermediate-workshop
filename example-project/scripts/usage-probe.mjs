import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarizeTestResults } from '../src/summarize-results.mjs';
import { validateInput } from '../src/validate-input.mjs';
import { readScopedFile, sha256 } from './scoped-files.mjs';

const fixtureFiles = Object.freeze(['data/test-results.json', 'data/transfer-results.json']);
const ids = (rows) => rows.map((row) => `${row.module}/${row.caseId}`);
const allowedCaseKeys = ['id', 'title', 'applicability', 'inputPolicy', 'options', 'results', 'nextQuestion'];

export function runCases(results, cases, probeSummarize = summarizeTestResults) {
  if (!Array.isArray(cases)) throw new TypeError('cases는 배열이어야 합니다.');
  return cases.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        Reflect.ownKeys(entry).some((key) => !allowedCaseKeys.includes(key))) {
      throw new TypeError('사례는 허용된 필드만 가집니다. 자료의 파일 경로는 사용하지 않습니다.');
    }
    const inline = Object.hasOwn(entry, 'results');
    const inputResults = inline ? entry.results : results;
    if (!Array.isArray(inputResults) || (inline && inputResults.length > 8)) {
      throw new TypeError('사례 results는 최대 8행의 명시적 배열이어야 합니다.');
    }
    if (!['valid', 'invalid-input'].includes(entry.inputPolicy)) throw new TypeError('알 수 없는 입력 정책');
    const input = {
      inputCount: inputResults.length,
      inputSource: inline ? 'inline-synthetic' : 'shared-fixture',
    };
    let inputError;
    try {
      validateInput(inputResults, entry.options);
    } catch (error) {
      if (entry.inputPolicy !== 'invalid-input' || !(error instanceof TypeError)) throw error;
      inputError = error;
    }
    if (entry.inputPolicy === 'invalid-input' && !inputError) {
      throw new Error(`오류 사례가 유효한 입력으로 바뀌었습니다: ${entry.id}`);
    }
    let summary;
    try {
      summary = probeSummarize(inputResults, entry.options);
    } catch (error) {
      if (!inputError || error.constructor !== inputError.constructor ||
          error.message !== inputError.message) throw error;
      return {
        id: entry.id, title: entry.title, ...input, status: 'input-error',
        summary: null, actualIds: null, actualNames: null,
        nameHandling: 'plain-text-no-interpretation',
        error: { type: error.name, message: error.message }, nextQuestion: entry.nextQuestion,
      };
    }
    if (inputError) throw new Error(`요약기가 잘못된 입력을 거부하지 않았습니다: ${entry.id}`);
    if (!summary || !Array.isArray(summary.rerunCandidates) || !Array.isArray(summary.modules)) {
      throw new TypeError(`요약 객체가 필요합니다: ${entry.id}`);
    }
    return {
      id: entry.id, title: entry.title, ...input,
      status: summary.sourceRowCount === 0 ? 'no-match' : 'summary',
      summary, actualIds: ids(summary.rerunCandidates),
      actualNames: summary.rerunCandidates.map((row) => row.name),
      nameHandling: 'plain-text-no-interpretation', error: null, nextQuestion: entry.nextQuestion,
    };
  });
}

function observeSemantics(results, rows) {
  const row = rows.find((entry) => entry.id === 'normal-build');
  if (!row || row.status !== 'summary') return 'undetermined';
  const unique = [...new Map(results.map((result) =>
    [JSON.stringify([result.buildId, result.module, result.caseId]), result])).values()]
    .filter((result) => result.buildId === row.summary.buildId);
  const policies = {
    'failed-only-compatible': ['failed'],
    'approved-v2-compatible': ['failed', 'timed_out', 'not_run'],
  };
  const matches = Object.entries(policies).filter(([, statuses]) =>
    JSON.stringify(ids(unique.filter((result) => statuses.includes(result.status)))) === JSON.stringify(row.actualIds));
  return matches.length === 1 ? matches[0][0] : 'undetermined';
}

export async function captureUsage({ phase = 'not-recorded', probeSummarize = summarizeTestResults } = {}) {
  if (!['not-recorded', 'initial-v1', 'approved-v2'].includes(phase)) throw new TypeError('알 수 없는 phase');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const inputs = [
    'operations/usage-cases.json', ...fixtureFiles, 'contract.txt',
    'src/summarize-results.mjs', 'src/summary-core.mjs', 'src/validate-input.mjs',
    'scripts/usage-probe.mjs', 'scripts/scoped-files.mjs',
  ];
  const bytes = await Promise.all(inputs.map((file) => readScopedFile(root, file)));
  const fixture = JSON.parse(bytes[0]);
  if (fixture.schemaVersion !== 2 || !fixtureFiles.includes(fixture.resultsFile) ||
      Reflect.ownKeys(fixture).some((key) => !['schemaVersion', 'scope', 'resultsFile', 'cases'].includes(key))) {
    throw new TypeError('허용된 정적 합성 fixture만 사용합니다.');
  }
  // Data selects from already-read static fixtures; it never supplies a filesystem path.
  const results = JSON.parse(bytes[inputs.indexOf(fixture.resultsFile)]);
  const rows = runCases(results, fixture.cases, probeSummarize);
  return {
    schemaVersion: 2, scope: fixture.scope, phaseDeclaration: phase,
    phaseAuthority: '사람의 승인 기록은 별도 확인. 선언·관찰·해시는 승인 대행이 아니다.',
    contractFileLabel: bytes[inputs.indexOf('contract.txt')].toString('utf8').split(/\r?\n/)[0],
    observedSemantics: observeSemantics(results, rows),
    observationScope: '정상 빌드의 후보만 비교. 전체 계약 통과·실제 검사·출시 승인 증명 아님.',
    countDomain: 'summary.counts are synthetic business statuses, not node:test pass counts',
    sourceState: inputs.map((file, index) => ({ file, sha256: sha256(bytes[index]) })),
    implementation: probeSummarize === summarizeTestResults ? 'current-module' : 'injected-test-function',
    implementationHashScope: '디스크 파일 상태만 식별. 주입된 함수 코드·승인·위변조 방지 증명 아님.',
    rows,
    openOperationalQuestions: [
      '실제 사용자/UI의 빈 결과·오류 수정 안내 이해는 검증하지 않았다.',
      '권한·부하·네트워크·배포·관측·롤백은 검증하지 않았다.',
      '후보는 권고일 뿐 자동 재실행·이슈 생성·업로드·출시 승인하지 않는다.',
    ],
  };
}

export function renderUsage(report) {
  return [
    '로컬 합성 사용 흐름 관찰 · 읽기 전용 · 실제 UX/배포 검증 아님',
    `단계 선언: ${report.phaseDeclaration} · 후보 관찰: ${report.observedSemantics}`,
    ...report.rows.map((row) => [
      `${row.title}: ${row.status} · ${row.actualIds === null
        ? `${row.error.type}: ${row.error.message}` : row.actualIds.join(',') || '[]'}`,
      `  입력: ${row.inputSource} · ${row.inputCount}행 · 합성 상태 건수: ${JSON.stringify(row.summary?.counts ?? null)}`,
      `  이름은 실행/해석하지 않는 일반 텍스트: ${JSON.stringify(row.actualNames)}`,
      `  다음 질문: ${row.nextQuestion}`,
    ].join('\n')),
    JSON.stringify(report, null, 2),
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const jsonOnly = args[0] === '--json';
  if (jsonOnly) args.shift();
  if (args.length && (args.length !== 2 || args[0] !== '--phase')) {
    throw new TypeError('사용법: node scripts/usage-probe.mjs [--json] [--phase initial-v1|approved-v2|not-recorded]');
  }
  const report = await captureUsage({ phase: args[1] ?? 'not-recorded' });
  console.log(jsonOnly ? JSON.stringify(report, null, 2) : renderUsage(report));
}
