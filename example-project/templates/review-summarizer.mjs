import { validateInput } from '../src/validate-input.mjs';
import { summarizeValidatedResults } from '../src/summary-core.mjs';

export function summarizeTestResults(results, options) {
  validateInput(results, options);
  return summarizeValidatedResults(
    results,
    options.buildId,
    ['failed', 'timed_out', 'not_run'],
    (result) => result.caseId,
  );
}
