import { access } from 'node:fs/promises';
import { registerContractTests } from './contract-suite.mjs';

const target = new URL('../review/summarize-results.mjs', import.meta.url);
try {
  await access(target);
} catch {
  throw new Error('review/summarize-results.mjs가 없습니다. 먼저 npm run prepare:review를 실행하세요.');
}
const { summarizeTestResults } = await import(target.href);
registerContractTests('독립 결함 실습 / 전체 v2 계약', summarizeTestResults, 'v2');
