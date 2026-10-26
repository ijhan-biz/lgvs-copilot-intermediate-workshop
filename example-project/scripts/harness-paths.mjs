import { lstat, mkdir, open, realpath, rename, rmdir, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readScopedFile } from './scoped-files.mjs';

export function fail(code, message = code) {
  throw Object.assign(new Error(message), { code });
}

export async function safeRoot(root) {
  root = resolve(root);
  if (await realpath(root) !== root) fail('UNSAFE_PATH', 'Canonical project root required');
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('UNSAFE_PATH');
  return root;
}

async function inspect(path) {
  try { return await lstat(path); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function safeOutput(root, file, { directories = false } = {}) {
  await safeRoot(root);
  const parts = file.split('/');
  if (parts[0] !== '.harness' || parts.some(part => !/^[A-Za-z0-9_.-]+$/.test(part) || part === '.' || part === '..')) {
    fail('INVALID_OUTPUT');
  }
  let path = root;
  for (let index = 0; index < parts.length; index++) {
    path = join(path, parts[index]);
    const directory = index < parts.length - 1 || directories;
    let stat = await inspect(path);
    if (!stat && directory) {
      await mkdir(path);
      stat = await lstat(path);
    }
    if (stat && (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()))) fail('UNSAFE_PATH');
  }
  return path;
}

export async function writeOutput(root, file, value) {
  const destination = await safeOutput(root, file);
  const staging = `${file}.${randomUUID()}.pending`;
  const path = await safeOutput(root, staging);
  const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
  } finally {
    await handle.close();
  }
  try {
    await safeOutput(root, file);
    await rename(path, destination);
  } catch (error) {
    await unlink(path);
    throw error;
  }
}

export async function readOutput(root, file) {
  // Do not create directories during reads, including status and refused resume.
  await safeRoot(root);
  return JSON.parse(await readScopedFile(root, file));
}

export async function withLock(root, operation) {
  await safeOutput(root, '.harness', { directories: true });
  const path = join(root, '.harness/lock');
  try {
    await mkdir(path);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const recovery = join(root, '.harness/lock-recovery');
    // Only one process may inspect and replace a dead lock at a time.
    await mkdir(recovery);
    try {
      const owner = await readOutput(root, '.harness/lock/owner.json');
      if (!Number.isSafeInteger(owner.pid) || owner.pid < 1 || typeof owner.nonce !== 'string') fail('INVALID_LOCK');
      try {
        process.kill(owner.pid, 0);
        fail('EEXIST', 'Harness operation already running');
      } catch (probe) {
        if (probe.code !== 'ESRCH') throw probe;
      }
      const current = await readOutput(root, '.harness/lock/owner.json');
      if (JSON.stringify(current) !== JSON.stringify(owner)) fail('EEXIST');
      await unlink(join(path, 'owner.json'));
      await rmdir(path);
      await mkdir(path);
    } finally {
      await rmdir(recovery);
    }
  }
  const owner = { pid: process.pid, nonce: randomUUID() };
  await writeOutput(root, '.harness/lock/owner.json', owner);
  try { return await operation(); } finally {
    const current = await readOutput(root, '.harness/lock/owner.json');
    if (JSON.stringify(current) !== JSON.stringify(owner)) fail('INVALID_LOCK');
    await unlink(join(path, 'owner.json'));
    await rmdir(path);
  }
}
