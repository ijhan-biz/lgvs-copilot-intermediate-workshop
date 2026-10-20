import { summarizeTestResults } from '../src/summarize-results.mjs';
import { registerContractTests } from './contract-suite.mjs';

registerContractTests('CR-01 인수 C2-v2 / 공통 C1~C6', summarizeTestResults, 'v2');
