// 저장소 맨 위 폴더에서 npm run을 쳤을 때만 실행된다. 실습 명령은 example-project 안에서만 돈다.
// 여기서 대신 실행하지 않는 이유: 이후 단계의 상대 경로(../, test/, harness/)가 example-project 기준이다.
const name = process.env.npm_lifecycle_event || 'preflight';
const extra = process.argv.slice(2).map(arg => (/\s/.test(arg) ? JSON.stringify(arg) : arg)).join(' ');
const command = `npm run ${name}${extra ? ` -- ${extra}` : ''}`;

console.error([
  '',
  '여기는 저장소 맨 위 폴더입니다. 실습 명령은 example-project 폴더 안에서 실행합니다.',
  '',
  '  cd example-project',
  `  ${command}`,
  '',
  'VS Code에서 example-project 폴더만 열면 터미널이 처음부터 그 안에서 시작합니다.',
  '',
].join('\n'));
process.exitCode = 1;
