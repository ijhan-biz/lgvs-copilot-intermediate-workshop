import { fileURLToPath } from 'node:url';
import { approveHarness, checkHarness, executeHarness, harnessStatus } from './harness-core.mjs';
import { fail } from './harness-paths.mjs';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const [command, ...args] = process.argv.slice(2);
try {
  let result;
  if (command === 'check' && args.length === 0) result = await checkHarness(root);
  else if (command === 'approve' && args.length === 2 && args[0] === '--reason') result = await approveHarness(root, args[1]);
  else if (command === 'run' && args.length === 0) result = await executeHarness(root);
  else if (command === 'drill' && args.length === 1) result = await executeHarness(root, { drill: args[0] });
  else if (command === 'status' && args.length === 0) result = await harnessStatus(root);
  else if (command === 'resume' && args.length === 1 && args[0] === '--latest') result = await executeHarness(root, { resume: true });
  else fail('INVALID_ARGUMENTS');
  console.log(JSON.stringify(result));
  if (!['passed', 'ready', 'approved'].includes(result.status)) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ status: 'blocked', errorCode: error.code ?? 'HARNESS_ERROR', message: error.message }));
  process.exitCode = 1;
}
