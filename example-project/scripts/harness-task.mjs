import { readFile } from 'node:fs/promises';
import { validateInput } from '../src/validate-input.mjs';

if (process.argv[2] === 'timeout') {
  console.log('timeout drill: 실제 자식 프로세스 대기');
  setInterval(() => {}, 1000);
  // An orphaned drill child also terminates if its parent is killed.
  setTimeout(() => process.exit(124), 1000);
} else if (process.argv[2] === 'inspect-input') {
  const rows = JSON.parse(await readFile(new URL('../data/test-results.json', import.meta.url), 'utf8'));
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('합성 입력 배열이 필요합니다.');
  validateInput(rows, { buildId: rows[0].buildId });
  console.log(JSON.stringify({ status: 'passed', syntheticRows: rows.length }));
} else {
  throw new Error('Unknown protected task');
}
