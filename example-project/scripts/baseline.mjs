import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baselineFiles, readScopedFile, sha256 } from './scoped-files.mjs';

export async function createBaseline(root) {
  const copies = await Promise.all(baselineFiles.map(async (file) => [file, await readScopedFile(root, file)]));
  const directory = resolve(root, '.baseline');
  await mkdir(directory);
  const hashes = {};
  for (const [file, bytes] of copies) {
    const destination = resolve(directory, file);
    if (file.includes('/')) await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: 'wx' });
    hashes[file] = sha256(bytes);
  }
  await writeFile(resolve(directory, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 1, createdAt: new Date().toISOString(), sha256: hashes,
  }, null, 2)}\n`, { flag: 'wx' });
  return hashes;
}

export async function compareBaseline(root) {
  const manifest = JSON.parse(await readScopedFile(root, '.baseline/manifest.json'));
  if (manifest.schemaVersion !== 1 || !manifest.sha256 ||
      Object.keys(manifest.sha256).length !== baselineFiles.length ||
      !baselineFiles.every((file) => /^[a-f0-9]{64}$/.test(manifest.sha256[file]))) {
    throw Object.assign(new Error('Invalid manifest'), { code: 'INVALID_MANIFEST' });
  }
  const results = [];
  for (const file of baselineFiles) {
    const baseline = sha256(await readScopedFile(root, `.baseline/${file}`));
    if (baseline !== manifest.sha256[file]) {
      throw Object.assign(new Error('Baseline copy changed'), { code: 'BASELINE_CHANGED' });
    }
    const current = sha256(await readScopedFile(root, file));
    results.push({ file, baseline, current, changed: baseline !== current });
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    if (process.argv[2] === '--compare') {
      for (const item of await compareBaseline(root)) {
        console.log(`${item.changed ? 'CHANGED' : 'UNCHANGED'} ${item.file}\n  baseline SHA-256 ${item.baseline}\n  current  SHA-256 ${item.current}`);
      }
      console.log('해시 요약은 행 diff가 아닙니다. 변경 행은 VS Code에서 수동 비교하세요.');
      console.log('탐색기 .baseline/<경로> 실제 사본 우클릭 Select for Compare → 현재 <경로> 우클릭 Compare with Selected.');
    } else {
      await createBaseline(root);
      console.log(`.baseline: 허용 파일 ${baselineFiles.length}개와 SHA-256 manifest 저장. 문제와 성공 기준 첫 파일 편집 전 기준선입니다.`);
    }
  } catch (error) {
    console.error(`기준선 작업 실패 (${error.code ?? 'BASELINE_ERROR'}). 기존 작업 보존: 덮어쓰기/삭제/초기화하지 않습니다.`);
    process.exitCode = 1;
  }
}
