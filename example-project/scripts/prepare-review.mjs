import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readScopedFile } from './scoped-files.mjs';

export async function prepareReview(projectRoot) {
  const template = await readScopedFile(projectRoot, 'templates/review-summarizer.mjs');
  const directory = resolve(projectRoot, 'review');
  // mkdir is exclusive: an existing directory, file or symlink is never reset.
  await mkdir(directory);
  await writeFile(resolve(directory, 'summarize-results.mjs'), template, { flag: 'wx' });
  return directory;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await prepareReview(fileURLToPath(new URL('../', import.meta.url)));
    console.log('review/summarize-results.mjs 생성. 다음: npm run test:review (초기 실패를 관찰하세요).');
  } catch (error) {
    console.error(`준비 실패 (${error.code ?? 'ERROR'}): 기존 review는 덮어쓰거나 삭제하지 않습니다.`);
    console.error('review/summarize-results.mjs가 있으면 그대로 npm run test:review를 실행하세요.');
    console.error('부분 생성/다른 파일이 있으면 작업을 보존하고 강사에게 경로 확인을 요청하세요.');
    process.exitCode = 1;
  }
}
