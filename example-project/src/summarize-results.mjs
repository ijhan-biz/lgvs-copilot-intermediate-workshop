import { validateInput } from './validate-input.mjs';
import { summarizeValidatedResults } from './summary-core.mjs';

export function summarizeTestResults(results, options) {
  validateInput(results, options);
  return summarizeValidatedResults(results, options.buildId, ['failed']);
}
