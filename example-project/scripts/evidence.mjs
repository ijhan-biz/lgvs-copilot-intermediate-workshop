import { randomUUID } from 'node:crypto';
import { lstat, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { collectEvidence } from './evidence-core.mjs';

const root = new URL('../', import.meta.url);
try {
  const report = await collectEvidence(fileURLToPath(root));
  // Legacy exitCode describes the collector; testExitCode always preserves the actual run.
  report.exitCode = report.collectorExitCode;
  const directory = new URL('evidence/', root);
  await mkdir(directory, { recursive: true });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Object.assign(new Error(), { code: 'UNSAFE_PATH' });
  const name = `v2-${report.startedAt.replaceAll(':', '-')}-${randomUUID()}.json`;
  // No raw stdout, assertion text, environment, account or absolute paths are persisted.
  await writeFile(new URL(`evidence/${name}`, root), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  if (report.status === 'passed') {
    console.log(`v2 통과: 16 tests. 실행 기록 evidence/${name}`);
  } else {
    console.error(`v2 ${report.status}: test exit=${report.testExitCode}, collector exit=${report.collectorExitCode}.`);
    console.error(`이유: ${report.reasons.join(', ')}. 기록 evidence/${name}`);
    console.error('상세 재현: npm run test:v2. 인수 완료로 표시하지 마세요.');
  }
  process.exitCode = report.collectorExitCode;
} catch (error) {
  console.error(`증거 수집 실패 (${error.code ?? 'COLLECTION_ERROR'}). 성공 기록이 아닙니다.`);
  process.exitCode = 1;
}
