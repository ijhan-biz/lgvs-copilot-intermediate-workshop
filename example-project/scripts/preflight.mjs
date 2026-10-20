console.log(`Node 버전: ${process.version}`);
if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('실행 불가: Node.js 22 이상이 필요합니다.');
  process.exitCode = 1;
} else {
  console.log('런타임 확인: Node.js >=22 충족');
}
console.log('범위: 가상의 검사 결과 요약 함수 한 개, 합성 데이터 8행 (요청 빌드 7행/고유 검사 6개)');
console.log('로컬 실행: 외부 패키지/설치/네트워크/원격 Git 불필요');
console.log('수동 확인 (이 스크립트는 Copilot 로그인·권한·연결을 확인하지 않음):');
console.log('  1. VS Code에서 example-project 폴더만 열었는가? instructor는 작업 영역에서 제외했는가?');
console.log('  2. GitHub Copilot 확장과 사용할 계정/이용 권한/조직 정책을 직접 확인했는가?');
console.log('  3. Copilot을 사용할 경우 모델/네트워크 사용 정책과 전달할 문맥을 확인했는가?');
console.log('  4. 터미널 명령은 사람이 읽고 승인하는가? 실제/기밀 데이터는 제외했는가?');
console.log('  5. AI 연결이 없어도 계약 읽기 → 테스트 실행 → 개인 재검증으로 진행 가능한가?');
console.log('교육 전 수동 확인: readiness/task.txt를 별도 압축 해제 연습 사본에서 수행했는가? 새 수업 ZIP/첫 편집 전 문제와 성공 기준 기준선은 그대로 두는가?');
console.log('readiness는 편집·저장·실행 관찰이며 JS 숙련/Copilot 정책 준수 증명이 아니다. 이 preflight는 파일을 수정하지 않는다.');
console.log('다음: npm test (초기 v1), npm run demo');
console.log('변경 후 최종 인수: npm run test:v2 (승인 후 후보 failed/timed_out/not_run, 처음에는 failed만)');
console.log('node:test 통과 수와 합성 자료의 passed 건수는 다르며, 출시 승인·실제 검사 실행 증명이 아닙니다.');
console.log('결함 실습: npm run prepare:review → npm run test:review (처음 실패가 정상)');
