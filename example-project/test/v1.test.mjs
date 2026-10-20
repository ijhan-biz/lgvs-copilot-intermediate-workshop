import { summarizeTestResults } from '../src/summarize-results.mjs';
import { registerContractTests } from './contract-suite.mjs';

registerContractTests('초기 합의 C2-v1 / 공통 C1~C6', summarizeTestResults, 'v1');
