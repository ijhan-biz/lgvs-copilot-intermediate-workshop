GitHub Copilot 중급과정
Agentic SDLC with Github Copilot.
2026-10-28 · 1인 1프로젝트
============================================================
단계별 명령과 순서는 상위 폴더의 따라하기.html(Windows 명령 프롬프트는 따라하기-윈도우.html)을 따른다.
이 파일은 범위·규칙·기대값을 한곳에 모은 실행 안내다. 각 절의 장 번호는 따라하기의 장과 같다.

현재 필수 범위 — 하네스 직접 구축과 운영
---------------------------------------
업무 함수의 후보 정책 변경과 별도로, 하네스 세 파일을 직접 쓴다.
  harness/instructions.txt: 맥락 출처·허용/금지 작업·멈추고 사람에게 돌려줄 조건
  harness/workflow.json: 목적·입력/맥락·허용 도구·출력·timeout·재시도 상한
  harness/run.mjs: 제공 부품으로 검증→승인 확인→순서 실행→기록→실패 중단/마무리 (약 10–25줄)
시작본에서 npm test 16개 통과와 TODO 하네스의 harness:check 실패는 함께 예상된 상태다.
완료 파일이나 강사 실행기를 복사하지 않는다. 보호 런타임·공통 검사·데이터·package.json은 고치지 않는다.
임의 셸·네트워크·설치는 없다. 허용 목록은 완전한 샌드박스가 아니며 학습자 코드는 로컬 사용자 권한으로 돈다.
업무 함수는 후보만 만들고, 하네스는 교육 도구의 허용 검사를 실제로 돌린다. 제품 재실행·출시 승인이 아니다.

하네스 명령:
  npm run harness:check
  npm run harness:approve -- --reason "직접 검토한 범위와 이유"
  npm run harness:run
  npm run harness:drill -- timeout
  npm run harness:drill -- forbidden
  npm run harness:status
  npm run harness:resume -- --latest
승인 이유는 현재 파일을 직접 읽고 자기 말로 쓴다. 로컬 승인은 신원 인증·회사 승인이 아니다.
Copilot은 수동으로 쓰며 모델 API를 자동 호출하지 않는다.

꼭 확인할 운영:
  timeout: 실제 자식 프로세스의 시간 초과가 실패·중단 기록으로 남는다.
  forbidden: 금지 도구는 프로세스 실행·보호 쓰기 전에 거절된다.
  stale: 성공 뒤 instructions를 고치면 stale이 되고 옛 승인으로는 이어 하기가 거절된다. 다시 읽고 새 승인·새 실행을 남긴다.
  resume: 같은 fingerprint의 중단 작업은 checkpoint에서 이어 하고, 재시도 상한과 성공 단계 중복 방지를 확인한다.
훈련과 stale의 실패 종료(1)는 예상 상태다. 성공처럼 꾸미거나 실패 기록을 지우지 않는다.
명령·exit·fingerprint·checkpoint·경로는 .harness에 남고, 8장에서 handoff.txt [하네스 근거]로 한 번에 옮긴다.
v2 16개·learner 4개·review 16개·혼자 풀기 1개와 하네스 결과는 서로 합산하지 않는다.
하네스 구축·운영 근거가 없으면 업무 검사가 통과해도 완료는 HOLD다.

목표와 완성
-----------
문제 → 맥락 → 계획 → 작은 변경 → 독립 검증 → 결함 복구·중단 → 내 기록으로 재검증. 작성량이나 속도로 평가하지 않는다.
시작본은 failed만 후보로 삼는 동작하는 v1이다. 빈 프로젝트나 새 함수 작성이 아니다.
완성 = 승인된 후보 범위 변경 + review 복구 + 내 테스트·README + 하네스 세 파일 + 운영 근거.
기대값은 구현을 복사하지 않고 계약·입력에서 직접 만든다. AI의 답과 통과 메시지는 근거가 아니다. 최종 승인자는 나다.
흐름: 결과 읽기 → 전체 검증 → 빌드 선택·중복 정리 → 상태·모듈별 요약 → 후보 보고.
demo는 operations/usage-cases.json 7건도 현재 소스로 보여 준다(operations/README.txt). 후보는 권고일 뿐 재실행·출시 승인이 아니다.
GREEN은 필요조건이지 운영 충분조건이 아니다. 실제 UI·사용자 피드백·운영은 검증하지 않았다.

요구·계획의 토대 — DDD와 BDD
---------------------------
domain-behavior.txt를 contract.txt·공개 입력과 함께 읽는다.
DDD로 업무 용어·전체 키·불변 조건·요약과 실제 재실행의 경계를 정하고,
BDD로 질문 → Given/When/Then 예시 → 독립 단언 → 승인된 최소 변경 → node:test 실행 → 증거를 잇는다.
개인 실습의 관점 질문이지 회의록이 아니다. Cucumber나 새 서비스는 없고, 새 양식이나 검사 수를 더하지 않는다.

기록 — 프로젝트 파일에만 남긴다
-------------------------------
따로 적는 기록장이나 JSON 양식은 없다.
  기대값: 실행 전에 test/learner.test.mjs, test/transfer.test.mjs에 먼저 쓴다.
  하네스 승인: harness:approve의 --reason이 이유·시각·fingerprint와 함께 .harness에 남는다.
  실행 결과: 명령 출력, evidence/v2-*.json, harness:status.
  목적·변경 이유·실제 결과·제한: 이 파일 맨 끝 [학습자 완성란].
  계획·하네스 근거·원인 가설·받은 도움·미확인·다음 행동: handoff.txt.
사람 승인·독립 기대값·RED/GREEN·첫 편집 전 기준선·덮어쓰기 금지·내 테스트·review·evidence 확인·본인 6명령 재현은 모두 필수다.
빈칸은 미실행·미확인이다. 근거 없이 채우지 않고 trace·원시 로그를 올리지 않는다.
README·handoff는 하네스 fingerprint 대상이다. 6장 2번 도장부터 7장 이어 하기 확인까지는 열어 보기만 하고,
8장 마지막 하네스 실행 뒤에는 고치지 않는다. 그동안 원인 가설은 review/summarize-results.mjs 맨 위 주석에 둔다.
혼자 풀기의 도움 상태(not-attempted / attempted-unassisted / hint-assisted / answer-assisted / incomplete)와
실제 결과(pass / fail / unknown)는 handoff.txt [받은 도움]에 따로 적는다. 통과만으로 독립 숙달을 확정하지 않는다.

0–1장. 실행 환경과 시작
----------------------
VS Code에서 example-project/만 열고 터미널도 이 폴더에서 친다.
Node.js 22 이상과 npm만 필요하다. npm install·서버·네트워크는 없다. Windows/macOS/Linux에서 npm 명령은 같다.
브라우저 UI 개발·DB·실제 고객 자료·자격 증명·배포·자동 업로드는 범위 밖이다. Copilot CLI·MCP·관리자 권한은 필요 없다.
Copilot 사용 가능 여부는 직접 확인한다. preflight는 로그인 검사가 아니다.
AI 상태: used / unavailable-policy(N/A) / unavailable-outage, 확인하지 못하면 not-recorded. N/A는 AI 역량 완료가 아니다.
AI가 없어도 같은 계약·수동 검토·실행 증거로 진행한다. 정책을 우회하지 않는다.
instructor/는 학습자 작업 영역·AI 문맥·공개 저장소에 없다. CR-01만 5장에서 공개하고, 답안은 본인 재현 뒤에 강사가 공개한다.

수업 전(선택): 별도 연습 사본에서 npm run preflight → readiness/task.txt대로 readiness:check의 첫 실패 → 한 상수 고치기 → 저장 → 재실행.
수업 날은 새 clone 또는 새 GitHub 소스 ZIP을 새 폴더에 푼다. 연습 결과·기준선·개인 기록은 옮기지 않는다.
지원 요청에는 합성 예제·명령/exit·최소한으로 가린 출력만 쓴다. 회사 프롬프트·대화 전문·디버그 로그·계정 화면은 내지 않는다.

수업 시작 확인:
  npm test
  npm run test:v1
  npm run demo
기대: v1 각각 16/16 통과. preflight 0은 환경 확인일 뿐이다.
공개 입력 8행 중 BUILD-DEMO-1은 원본 7 · 고유 6 · 중복 1, passed 2 · failed 2 · timed_out 1 · not_run 1이다.
다른 빌드 1행은 세지 않는다. v1 후보는 failed 2개다. 입력 상태 건수와 node:test 통과 수는 다른 값이다.
실패하면 새 기능을 만들지 말고 위치·Node 버전·오류를 적고 지원을 요청한다.

결과 화면(선택·읽기 전용): npm run web 을 치고 브라우저로 http://127.0.0.1:4173 을 연다.
입력→후보 흐름, 지금 코드의 후보 정책, 내 진행 상태를 보여 준다. src를 고친 뒤 ↻ 결과 새로고침을 누른다. 종료는 Ctrl+C.
파일을 고치거나 검사·하네스를 돌리지 않으며 새 입력 과제의 결과는 보여 주지 않는다.
포트가 쓰이면 macOS·Linux는 PORT=4174 npm run web, Windows 명령 프롬프트는 set PORT=4174 를 친 뒤 npm run web.

2장. 문제와 성공 기준
--------------------
문제: 선택 빌드의 검사 결과를 중복 없이 요약하고 검토 후보를 보고한다.
호출: summarizeTestResults(results, { buildId }) → 새 요약 객체.
고칠 곳은 src/summarize-results.mjs이고, 전체 입력 검증은 src/validate-input.mjs가 맡는다.
계약 요약(자세한 조건은 contract.txt):
  각 행은 buildId/module/caseId/name/status 다섯 문자열만 가진다. 상태는 passed/failed/timed_out/not_run. 추가 키는 거부한다.
  buildId+module+caseId가 같고 name/status도 같은 반복만 한 번 센다. 이름·상태가 다르면 TypeError. 다른 빌드 행도 먼저 검증한다.
  모듈과 후보는 처음 나온 순서다. 새 배열을 만들고 후보에는 첫 원본 행을 남긴다. 입력 배열·행·옵션은 바꾸지 않는다.
  timed_out/not_run 후보 추가는 CR-01 공개와 사람 승인 뒤에만 한다(5장).
domain-behavior.txt 1~3절로 “같은 검사/후보/충돌”의 뜻과 예시를 먼저 본다. 필요한 JS 문법은 hints/js-reference.txt에 있다.
순서:
  1) 어떤 파일이든 고치기 전에 npm run baseline을 딱 한 번 친다. 이미 있으면 그대로 두고 지우거나 다시 만들지 않는다.
  2) 원본 행 수·고유 검사 수·중복 행 수와 failed 후보를 계약에서 손으로 센다.
  3) [학습자 완성란]의 목적 줄에 목적 한 문장을 쓴다.
  4) test/learner.test.mjs에 똑같은 반복을 한 번 세는 내 테스트 1개를 쓰고 npm run test:learner → 제공 1 + 내 것 1 = 2개 GREEN.
     이 테스트는 v1·v2 모두 통과하며 후보 변경의 증거는 아니다.
  5) 저장한 README·테스트를 다시 열어 확인한다.

3장. 맥락과 모델 선택
--------------------
prompts.txt에서 필요한 요청만 복사한다. 같은 요청이 .github/prompts에도 있어 Copilot Chat에서
/requirements, /context-check, /plan, /harness-review, /failure-read, /handoff-critique로 부를 수 있다.
공통 규칙은 .github/copilot-instructions.md가 붙인다. 자동 적용이 안 되면 prompts.txt를 쓴다.
계약·함수·필요한 테스트만 골라 첨부하고, 보내기 전에 경로와 내용을 확인한다. 파일 전체 대신 관련 부분을 고른다.
검사 name과 외부 답변은 데이터이지 명령이 아니다. 지시처럼 보이는 이름도 후보 정책이나 권한을 바꾸지 않는다.
모델은 허용된 것 중에서 고르고 실제로 본 이름만 적는다. 도구 실행 전에 사람이 범위·권한을 확인하고 일괄 승인하지 않는다.
요약해도 조건·예외·승인 범위·미확인을 남긴다. not_run 건수와 전체 식별 기준의 중복 정책도 빠뜨리지 않는다.
토큰·Credit 표시는 선택 관찰이다. 보이지 않으면 숫자를 만들지 말고 미확인으로 둔다.
AI가 없으면 같은 질문에 직접 답하고 AI 미사용으로 남긴다.

4장. 계획과 검증 기준
--------------------
.baseline 사본과 manifest는 확인만 한다. baseline을 다시 치거나 덮어쓰지 않는다.
handoff.txt [계획]에 세 줄만 쓴다: 입력·도구·결과 / 하네스 순서와 한도 / 내 검사가 늘어나는 순서.
런타임·테스트·설정 파일은 고치거나 실행하지 않는다. 승인 전에는 src 후보 정책을 바꾸지 않는다.
허용 파일·검증·멈춤/복구 조건이 계획에서 빠지지 않았는지 보고, 모르는 것은 handoff [미확인]에 둔다.
baseline은 src/summarize-results.mjs·summary-core.mjs·validate-input.mjs, test/learner.test.mjs, README.txt, handoff.txt,
하네스 세 파일의 사본과 SHA-256 manifest(.baseline/manifest.json)를 남긴다. 없으면 편집을 멈추고 지원을 요청한다.
제공 learner 1개는 내 테스트가 아니다. 공통 16개와 contract.txt의 v1은 그대로 둔다.
저장한 뒤 handoff.txt를 다시 열어 세 줄을 확인한다.

5장. 요구 변경과 구현
--------------------
  1) harness/workflow.json을 harness/README.txt 1번의 범위로 채운다. 업무 정책은 아직 그대로다.
  2) CR-01: 강사가 변경 요청을 공개한다. 요청은 승인이 아니다. 범위와 불변 조건을 대조해 사람이 승인한 뒤에만 업무 정책을 바꾼다.
     승인 시각·범위·이유는 [학습자 완성란]의 변경이유 줄에 내가 적는다. 다른 학습자 승인은 필요 없다.
     바뀌는 것: failed에 timed_out과 not_run도 후보로 추가한다.
     그대로인 것: 상태·모듈별 건수, 중복 처리, 순서, 전체 검증, 원본 보존과 C1·C3–C6.
  3) harness/run.mjs를 제공 부품으로 잇는다.
  4) 후보 확장 테스트를 test/learner.test.mjs에 먼저 넣고 npm run test:learner로 RED를 본다(제공 1 + 중복 1 + 확장 1 = 3).
     npm run test:v2도 변경 전에는 새 후보 요구에서 실패한다. 실제 수·exit·실패 단언을 읽는다.
  5) src/summarize-results.mjs의 후보 조건만 바꾼다. 건수·중복·검증·순서·원본 참조는 그대로 둔다.
     npm run test:v2 → 16/16, npm run test:learner → 3개 GREEN, npm run demo → 후보 v1 2개 → v2 4개, 요약 건수는 그대로.
  6) 바뀐 파일을 직접 읽고 도장 → 실행 → 상태. 이 로컬 하네스 승인은 CR-01 업무 승인과 별개이며 실행보다 먼저 남긴다.
이후 npm test와 test:v1의 실패(옛 C2-v1 기대)는 정상이다. 최종 명령은 npm run test:v2다. 공유 회귀를 지우거나 v1으로 되돌리지 않는다.
의도된 RED는 승인 요구의 기대·실제와 실패 단언이 맞아야 한다. 문법·import·ReferenceError는 실행 오류다.
추가 변경이 필요하면 CR-02로 따로 승인받는다. 승인 없는 확장은 하지 않는다.

6장. 결과와 기준 검증
--------------------
  1) C6 검사를 test/learner.test.mjs에 넣는다: 새 요약·건수 객체와 배열, 새 후보 배열(notStrictEqual),
     첫 원본 행 참조(strictEqual), 입력 배열·행·옵션 불변(deepEqual). npm run test:learner → 4개(제공 1 + 중복 1 + 확장 1 + C6 1).
     이 검사로 확인하지 못한 범위는 handoff.txt [미확인]에 적는다.
  2) 파일이 바뀌어 옛 승인은 APPROVAL_REQUIRED로 거절된다. 다시 읽고 도장 → 실행 → 상태.
       npm run harness:approve -- --reason "직접 검토한 현재 파일의 범위와 이유"
       npm run harness:run
       npm run harness:status
  3) npm run harness:drill -- timeout, npm run harness:drill -- forbidden. 둘 다 실패(1)가 정답이다.
  4) 검토 사본은 딱 한 번 만든다: npm run prepare:review → npm run test:review.
     설계상 16개 중 9 통과·7 실패다. 실제 수·exit·실패 단언은 내 실행에서 읽는다. 여러 실패가 여러 원인이라는 뜻은 아니다.
     첫 출력과 내 최소 반례를 review/summarize-results.mjs 맨 위 주석에 남긴다(review는 fingerprint 밖이다).
     review가 이미 있으면 그대로 쓰고 다시 만들지 않는다. 지우거나 초기화하지 않고, prepare:review로 보호 기능을 시험하지 않는다.
     review에도 공통 16개를 그대로 적용한다. 검사를 줄여 통과시키지 않는다.
막히면 시도·예측·오류를 남기고 과정 지원을 요청한다.

7장. 수정과 재검증
-----------------
review 복구 — 고칠 곳은 review/summarize-results.mjs 하나다. 테스트·template·src와 혼동하지 않는다.
  고치기 전에 맨 위 주석에 원인 가설과, 기각한 대안이 현재 요구를 어기는 이유·다시 볼 조건을 쓴다(8장에 handoff [원인 가설]로 옮긴다).
  예: not_run을 passed로 세는 대안은 현재 C2에 어긋난다. 상태 의미 변경이 승인되면 다시 본다.
  가설을 바꿀 새 증거(다른 최소 입력의 관찰, 실패 단언·계약 대조)를 확인한다. 강한 표현이나 새 채팅은 새 증거가 아니다.
  같은 실패가 두 번이거나 새 증거가 없으면 재생성을 멈추고 시도·도움·다음 확인을 주석에 적는다.
  AI가 검증 삭제·기대값 약화·네트워크 실행을 권하면 멈춘다. 승인된 원인 범위만 고치고 npm run test:review 16개를 다시 돌린다.
  되돌리기는 변경 전 코드와 비교해 승인 변경만 손으로 취소한다. 삭제·전체 초기화는 하지 않는다.
stale과 이어 하기:
  harness/instructions.txt에 허용된 한 문장을 더하면 harness:status는 stale, harness:resume -- --latest는 거절된다.
  다시 읽고 새 승인·새 실행을 남긴다. 바뀐 fingerprint는 강제로 이어 하지 않는다.
  같은 fingerprint에서 harness:drill -- timeout으로 멈춘 뒤, 파일을 바꾸지 않고 harness:status → harness:resume -- --latest.
  한 번 더 resume해 성공 단계가 중복되지 않는지 본다. 원래 timeout 기록은 지우지 않는다.
  이어 하기 확인이 끝날 때까지 README·handoff는 고치지 않는다.
혼자 풀기:
  independent-task.txt와 data/transfer-results.json을 읽고 승인된 v2 계약을 새 입력에 적용한다.
  실행 전에 test/transfer.test.mjs의 expectedIds 바로 위 주석에 예측과 이유를 쓰고, expectedIds = null을 내 예측으로 바꿔 저장한다.
  테스트 파일 사본을 example-project 바로 위 폴더의 전이-실행전-테스트.mjs로 둔 뒤 npm run test:transfer를 한 번 실행한다.
  그동안 AI·힌트·강사 내용 도움·답안·고급 모델은 닫는다. 내 src와 계약은 읽어도 된다.
  내용 도움은 첫 예측·이유·expectedIds와 첫 실제 결과(pass/fail·exit·출력)를 모두 고정한 뒤에만 연다.
  실행하지 못했으면 outcome unknown·exit null·incomplete/HOLD로 남기고, 그때는 환경·절차 지원만 받는다.
  확인한 fail은 그대로 둔다. 도움 뒤 통과는 혼자 통과가 아니다.
  transfer 1개는 learner 4개·공통 16개에 합치지 않는다. 결과와 도움 상태는 끝난 뒤 handoff.txt [받은 도움]에 적는다.
회귀: npm run test:v2(16개), npm run test:learner(4개). review·혼자 풀기 결과와 섞지 않는다.
구체적 강사 정답은 본인 6명령 재현 뒤에만 연다.

8장. 자가 검증과 결과 정리
-------------------------
  1) README [학습자 완성란]과 handoff.txt를 지금까지 실제로 본 결과로 채우고 저장한다.
     첫 예측/첫 결과와 전이 테스트 사본은 덮어쓰지 않는다.
  2) 새 채팅(없으면 손)으로 비판받는다. 첨부는 내 README·handoff·승인된 계약·합성 자료·필요한 변경 기록만.
     이전 대화와 강사 답안은 넣지 않는다. 비판을 채택/기각하고 이유·다시 볼 조건을 handoff.txt [받은 도움]에 적는다.
     AI를 못 쓰면 같은 질문으로 수동 비판하고 unavailable-policy 또는 unavailable-outage와 근거를 남긴다. 새 채팅을 한 척하지 않는다.
  3) README·handoff도 fingerprint 대상이므로 현재 파일을 다시 읽고 도장 → 실행 → 상태.
       npm run harness:approve -- --reason "직접 검토한 현재 파일의 범위와 이유"
       npm run harness:run
       npm run harness:status
     비판 저장이나 시간 절약은 자동 승인이 아니다. 이 갱신이 없거나 실행 뒤 파일을 바꾸면 새 검토·승인·실행 전까지 HOLD다.
  4) 새 터미널에서 내 문서만 보고 본인 6명령을 다시 친다.
       npm run preflight
       npm run test:v2
       npm run test:learner
       npm run test:review
       npm run demo
       npm run evidence
     이 뒤로 README·handoff는 고치지 않는다. 결과가 적어 둔 내용과 다르면 강사에게 알리고, 고쳐 적었다면 3)부터 다시 한다.
  5) 혼자 풀기와 6명령을 마친 사람만 강사가 공개한 참고답안과 비교한다. 코드 모양이 아니라 C1~C6·변경 범위·근거·남은 위험을 본다.
     비교 메모는 README·handoff 밖에 쓴다. 답안을 본 뒤 이어 갔다면 answer-assisted로 강사에게 알린다.
evidence/v2-*.json — evidence는 v2 테스트를 실제로 다시 돌려 기록한다. 파일을 열어 확인한다.
  passed는 testExitCode 0, tests = passed = 16, failed·skipped·todo·cancelled 0, 실행 전후 허용 파일·도구 SHA-256이 같을 때만이다.
  failed/incomplete/state-changed면 collectorExitCode가 0이 아니다. 실행 중에는 편집하지 않는다.
  서명된 증명이 아니며 learner·review·사람 승인·Copilot 사용까지 증명하지 않는다.
  환경변수·계정·절대 경로·원시 로그·프롬프트·비밀은 넣거나 올리지 않는다.

기준선 차이 확인
---------------
  npm run compare:baseline
허용 파일의 SHA-256 동일/변경 요약만 보여 준다. 줄 단위 비교나 자동 복구가 아니다.
줄 단위로 보려면 VS Code 탐색기에서 .baseline/의 사본(예: .baseline/src/summarize-results.mjs)을 우클릭 → Select for Compare →
현재 파일 우클릭 → Compare with Selected. README는 고정 안내와 맨 끝 완성란을 나눠 본다.
승인 범위 밖 차이는 적어 두고 사람 판단으로만 되돌린다. 삭제·초기화는 하지 않는다.

막힐 때
-------
JS/Node가 막히면 폴더 → preflight → 함수 입력/출력 → 테스트 한 개 → hints 순서로 본다. 혼자 풀기의 내용 도움에는 쓰지 않는다.
빨리 끝냈으면 속도를 내기보다 승인 전 자율 수정이 없었는지 점검하고, 구현을 읽기 전에 반례·기대값을 더 만들어 본다.
공통 인수 기준은 어느 경우에도 생략하지 않는다. 추가 UI·서비스·자동화는 하지 않는다.
후속선택연습(모델 비교 등)은 수업 뒤 선택이며 필수·가점이 아니다.

완료 체크
---------
[ ] 내가 추가한 테스트와 문서가 있다. 기대값은 계약·입력에서 직접 만들었다.
[ ] CR-01 승인과 작은 변경의 이유가 있다. 공통 회귀 16개가 남아 있다.
[ ] v2와 review를 실제로 다시 돌렸다. 실패·중단·미확인은 사실대로 적었다.
[ ] 본인 6명령 재현 + 새 채팅 비판(불가하면 명시) + 참고답안 비교 여부를 각각 적었다.
[ ] name은 데이터로 다뤘고 기밀·외부 실행·업로드가 없으며 최종 승인은 사람이 했다.

평가
----
자가 채점은 없다. 강사가 테스트·승인 기록·evidence·README·handoff를 직접 보고 다섯 가지를 각각 0~2점으로 본다:
purposeAcceptance 목적·성공 기준 / contextModelTokens 맥락·모델·토큰 /
coreProcess 핵심 작업 과정 / verificationCauseRepair 검증·원인 수정 / selfReplayHandoff 본인 재현·인수인계.
0=실제 수행을 확인했으나 기준 미달, 1=부분 근거·설명 보완 필요, 2=근거 연결과 본인 설명·재현 확인.
합계 8/10 이상이고 핵심 작업 과정·검증·원인 수정·본인 재현·인수인계가 각각 1점 이상이어야 완료다.
미실행·미확인·근거 미열람은 0으로 짐작하지 않고 판정을 보류한다. 안전한 중단만으로 자동 완료하지 않는다.
AI를 못 쓴 경우도 같은 결과·수동 검토로 평가한다. AI 역량은 미관찰로 따로 남기며 N/A로 완료 처리하지 않는다.

[학습자 완성란]
목적: (누구의 어떤 판단을 돕는지 한 문장. 하지 않는 것도 적는다)
실행명령: (다시 확인할 명령. 마지막 여섯 명령은 handoff.txt에 있다)
실제결과: (실제로 본 수·exit와 .harness 경로. 여섯 명령 결과는 아직 없으니 "evidence/v2-*.json과 출력에 남는다"고만. 안 한 것은 "미실행")
변경이유: (CR-01을 언제·어떤 범위로 승인했고 왜인지, review를 왜 그렇게 고쳤는지)
제한: (확인하지 못한 것과 받은 도움. 없으면 "없음")
