import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

export const baselineFiles = Object.freeze([
  'src/summarize-results.mjs', 'src/summary-core.mjs', 'src/validate-input.mjs', 'test/learner.test.mjs',
  'README.txt', 'handoff.txt',
]);

export async function readScopedFile(root, file) {
  const parts = file.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw Object.assign(new Error('Invalid scoped path'), { code: 'INVALID_SCOPE' });
  }
  let path = resolve(root);
  const rootStat = await lstat(path);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw Object.assign(new Error('Unsafe root'), { code: 'UNSAFE_PATH' });
  }
  for (const [index, part] of parts.entries()) {
    path += `${sep}${part}`;
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) {
      throw Object.assign(new Error('Not a regular scoped file'), { code: 'UNSAFE_PATH' });
    }
  }
  return readFile(path);
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
