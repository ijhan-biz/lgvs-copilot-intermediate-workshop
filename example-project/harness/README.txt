필수 실습: 최소 하네스를 직접 만든다

초기 npm test는 v1 16개 통과, harness:check는 미완성 설정으로 종료 1이다.
이것은 완성 실행기를 호출하는 선택 과제가 아니다. 다음 세 파일은 학습자가 작성한다.
1. workflow.json: 목적, input="data/test-results.json", context=["harness/instructions.txt"],
   allowedTools와 steps는 ["inspect-input","test:v2"], output=".harness",
   schemaVersion=1, timeoutMs 정수 50~10000, retryLimit 정수 0~2를 갖는 정확한 객체.
   다른 키/경로/명령/shell은 거부한다. 실습 권장값 2000ms, 재시도 1회.
   수업에서는 retryLimit을 1 또는 2로 둔다. 0도 형식상 허용되지만 첫 실패 뒤 재개가
   RETRY_LIMIT로 막혀 아래 필수 운영 (1)·(4)의 같은 해시 재개를 관찰할 수 없다.
2. instructions.txt: 목적·계약·허용 변경·금지·중단·반환 근거를 구체적으로 작성한다.
   최소 40자, TODO는 제거한다. 해시에 실제 포함되며 Copilot/수동 작업용이다.
3. run.mjs: default async 함수에 전달되는 api를 10~25행 정도로 연결한다.
   단순 성공 반환으로 통과하지 못한다. 실패 분기를 반드시 직접 작성한다.
   실패 분기가 없어도 정상 run은 통과한다. timeout 훈련의 failure가
   MISSING_STOP_AFTER_FAILURE(stop 누락)나 MISSING_RETURN_AFTER_STOP(return 누락)이면 고친다.

작성·승인 경계
  계획·검증 단계은 오전 baseline 뒤 선택한 워크북 여섯 칸 또는 work-record.json.coreRecord
  한 곳의 계획 기록만 허용한다. 런타임·테스트·설정 편집/실행은 하지 않는다.
  13:25–13:40 workflow 구축은 이미 사람이 검토한 하네스 범위만 다룬다.
  업무 정책 변경은 13:45 요청 공개와 실제 사람 승인 둘 다 갖춘 뒤에만 한다.
  아래 로컬 하네스 검토 선언은 업무 승인과 별개이며 하네스 실행보다 먼저 남긴다.

primitive 계약 (보호 소스 scripts/harness*.mjs는 수정 대상이 아니다)
  await api.validate(): 현재 입력/설정/컨텍스트 검증. 최초 단계여야 한다.
  await api.verifyApproval(): 현재 fingerprint의 로컬 사람 검토 선언 확인.
  api.steps: 고정된 순서의 필수 도구 목록.
  api.isComplete(step): 이미 성공한 작업인지 확인. 재개 때 성공 작업은 건너뛴다.
  await api.runStep(step): 다음 허용 작업 한 개만 실제 Node 자식으로 실행한다.
    결과는 status='passed' 또는 'failed'인 보호 receipt다. 변조/복제 금지.
  await api.recordResult(step, result): 그 receipt를 기록한다. 생략/가짜 결과 금지.
  await api.stop(result): 방금 기록한 실패로 중단한다. 이후 실행/완료 금지.
  await api.finish(): 필수 작업이 모두 실제 성공한 경우에만 완료한다.
검증→승인→순서 순회(완료 작업 건너뜀)→실행→기록→실패 시 stop과 반환,
모든 필수 성공 후 finish가 되도록 직접 구현한다.
inspect-input은 합성 입력을 검사한다. test:v2는 기존 16개 계약을 실행한다.
개인 4개/review 16개/독립 1개/마지막 여섯 명령을 대신하지 않는다.

명령과 종료
  npm run harness:check
    0=설정/함수 형식 준비. 실행 완료 증명 아님. 미완성/오류=1.
  npm run harness:approve -- --reason "직접 읽은 범위와 허용 이유"
    0=현재 입력·설정·지시·소스·Node 실행 파일 해시에 검토 선언 저장.
    이유 최소 8자. 조직 인증/서명/실제 업무 승인 아님.
  npm run harness:run
    0=필수 실제 성공. 실패/금지/미승인/불완전=1.
  npm run harness:drill -- timeout
    실제 대기 자식을 최대 100ms 뒤 SIGKILL. 실제 실패로 종료 1이 예상값이다.
  npm run harness:drill -- forbidden
    registry 밖 도구 요청을 자식 실행 전에 거부. 실제 blocked 실패로 종료 1.
  npm run harness:status
    0=현재 fingerprint의 passed. failed/running/stale/none/invalid=1.
    actualStatus(저장된 실제 결과)와 intent(훈련 의도)는 다르다.
  npm run harness:resume -- --latest
    같은 해시에서 성공 작업은 재실행하지 않고 남은 작업만 재시도.
    완료 재개는 쓰기/작업 반복 없이 0. 실패/한도 초과/변경된 해시는 1.
모든 명령의 마지막 stdout 행은 JSON이다. 오류도 성공으로 숨기지 않는다.

마지막 JSON의 errorCode 또는 failure 읽기
  INVALID_CONFIG              workflow.json의 키·값이 위 1번 계약과 다르다.
  HARNESS_ERROR               그 밖의 오류. JSON 쉼표·따옴표 오류면 message에 줄·칸이 나온다.
  INCOMPLETE_INSTRUCTIONS     instructions.txt가 40자 미만이거나 TODO가 남았다.
  INVALID_ORCHESTRATION       run.mjs에 export default 함수가 없다.
  REVIEW_REASON_REQUIRED      approve 이유가 8자 미만이거나 TODO다.
  APPROVAL_REQUIRED           현재 fingerprint의 검토 선언이 없다. 파일을 바꾼 뒤의 옛 승인도 같다.
  STALE_EVIDENCE              새 승인 뒤 옛 fingerprint의 checkpoint를 resume했다. 새 run을 한다.
  ETIMEDOUT                   자식이 timeoutMs 안에 끝나지 않았다. timeout 훈련에서는 예상값이다.
  FORBIDDEN_TOOL              허용 목록 밖 도구다. forbidden 훈련에서는 예상값이다.
  MISSING_STOP_AFTER_FAILURE  실패를 기록한 뒤 stop 없이 다음 단계나 finish로 갔다.
  MISSING_RETURN_AFTER_STOP   stop 뒤 return 없이 다음 단계나 finish로 갔다.
  UNAWAITED_OPERATION         api 호출 앞에 await가 빠졌다.
  INVALID_SEQUENCE            validate → verifyApproval → 정해진 단계 순서를 어겼다.
  INVALID_RECEIPT             runStep 결과가 아닌 객체나 그 복사본을 기록했다.
  FAILED_ORCHESTRATION        stop이나 finish 없이 함수가 끝났다(성공 객체만 반환 등).
  INCOMPLETE_REQUIRED_STEPS   필수 작업이 모두 성공하기 전에 finish를 불렀다.
  RETRY_LIMIT                 같은 작업의 시도 한도를 다 썼다. 새 검토·새 실행이 필요하다.
  STATE_CHANGED               실행 도중 파일이 바뀌었다. 저장을 마친 뒤 다시 검토한다.
  INVALID_CHECKPOINT·INVALID_LOCK·EEXIST  기록 손상이나 동시 실행이다. 지우지 말고 강사와 확인한다.

필수 운영
  검증 15:30–15:40의 기존 운영 10분 안에서, C6 개인 검사로 바뀐
  test/learner.test.mjs를 포함한 현재 파일을 사람이 먼저 직접 재검토한다.
  npm run harness:approve -- --reason "직접 읽은 현재 파일의 범위와 허용 이유"
  → npm run harness:run → npm run harness:status 뒤에 아래 timeout/forbidden을 실행한다.
  옛 승인은 APPROVAL_REQUIRED로 거절된다. 이는 13:45 업무 승인과 별개의 로컬 재검토다.
  (1) timeout 실패의 마지막 JSON failure가 ETIMEDOUT인지 먼저 본다. checkpoint/events에서
      ETIMEDOUT과 실제 childStarted도 확인한다. failure가 MISSING_STOP_AFTER_FAILURE나
      MISSING_RETURN_AFTER_STOP이면 run.mjs 실패 분기를 고친 뒤 새 검토·승인·실행을 한다.
      같은 해시에서 resume하여 성공. 과거 실패 event는 그대로 보존한다.
  (2) forbidden 실패 event의 childStarted=false와 보호 파일 불변을 확인.
  (3) 정상 성공 후 instructions.txt에 허용된 지시를 추가한다.
      status=stale와 resume 거부를 확인한다. 변경을 직접 검토하고 새 approve,
      새 run을 실행한다. 승인만 갱신해도 옛 checkpoint는 재개할 수 없다.
  (4) 중단된 같은 해시 실행의 성공 작업/시도 횟수를 확인하고 resume한다.
      완료 후 resume을 반복하여 checkpoint와 성공 작업 횟수가 같은지 확인.
      retryLimit=1은 최초+추가 1회다. 한도 소진 후에는 새 검토/새 실행이 필요하다.

최종 인계의 현재 근거
  17:00–17:04 README/handoff 4분, 17:04–17:05 저장·동결 1분,
  17:05–17:07 새 비판/수동 대조 2분,
  17:07–17:09 현재 파일 사람 재검토 → npm run harness:approve → npm run harness:run 2분,
  17:09–17:10 npm run harness:status·현재 fingerprint/증거 경로 기록 1분이다.
  approve에는 위처럼 직접 검토한 이유를 붙인다. 문서 편집도 fingerprint를 바꾼다.
  시간 절약·비판 저장은 자동 승인이 아니다. 실행 뒤 파일 변경은 새 재검토·승인·실행 전 HOLD다.
  17:10 전 갱신한 하네스 근거가 없으면 HOLD다. 현재 근거와 재현 후 실제 완료 시각·상태·증거 경로는
  선택한 기존 work-record.json.coreRecord.execution 또는 워크북 execution에 연결한다.
  이 위치는 불변 firstTransfer·첫 예측/첫 결과·스냅샷과 수집 fileHashes 범위 밖이어야 한다.
  새 최종 필드는 만들지 않고 동결 README/handoff는 최종 주 기록에서 참조한다.
  17:10–17:25 여섯 명령과 17:25 이후 조건부 답안 공개는 그대로다.

Copilot 기본 구조와의 연결 (선택 도구, 필수 흐름은 그대로)
  example-project/.github에 GitHub Copilot이 바로 읽는 기본 파일이 있다.
  VS Code에서 example-project 폴더만 열어야 Copilot이 이 .github를 찾는다.
  .github/copilot-instructions.md      프로젝트 공통 규칙. Copilot Chat이 자동으로 읽는다.
  .github/instructions/*.instructions.md  harness/·test/ 파일을 다룰 때만 붙는 규칙(applyTo).
  .github/prompts/*.prompt.md          수업 단계별 요청. 채팅에서 /requirements, /context-check,
                                       /plan, /harness-review, /failure-read, /handoff-critique.
  .github/agents/harness-reviewer.agent.md  편집·실행 도구 없이 읽기만 하는 검토자.
  지금 하네스와의 관계:
    instructions.txt  ↔ 공통 규칙은 copilot-instructions.md가 주고, 이번 작업의 지시는 여전히
                        내가 instructions.txt에 쓴다(지문에 포함, 40자 이상, TODO 없음).
    workflow.json     ↔ Copilot 에이전트의 tools 목록은 Copilot이 쓸 도구를, workflow.json의
                        allowedTools·steps는 실행기가 실제로 돌릴 도구와 순서를 정한다.
    run.mjs           ↔ Copilot에는 같은 것이 없다. 순서·실패 중단·기록·재개는 코드와 보호
                        실행기가 강제하고, Copilot은 /harness-review로 검토만 한다.
  자동 적용이 안 되면 prompts.txt의 같은 요청을 복사해 쓴다. 파일 이름·도구 이름은 VS Code 버전에
  따라 경고가 날 수 있다. 그때는 편집·실행 도구를 더하지 말고 읽기 도구만 남긴다.

출력은 .harness/approval.json, latest.json, runs/<runId>/checkpoint.json이다.
checkpoint에는 실제 종료·출력·시간 제한·시도·실패 원인과 SHA-256 checksum이 있다.
checksum은 실수/손상 검출이며 악의적 같은 사용자에 대한 인증/위변조 방지가 아니다.
실행 전 시도를 예약 저장한다. 부모가 죽으면 INTERRUPTED_OR_NOT_STARTED인 미확인
시도로 남아 재시도 한도를 소비한다(실제 자식 실행 여부를 짐작하지 않는다).
죽은 부모의 lock만 자동 회수한다. 활성/손상 lock은 닫힌 상태로 거부한다.
희소한 lock 복구 도중 강제 종료되어 lock-recovery가 남아도 임의 삭제/추측 재개하지
않는다. 진단을 보존하고 사람이 활성 프로세스와 경로를 확인한다.
설정/입력 누락, symlink/비정규 파일, checkpoint 손상은 통과로 대체하지 않는다.
해시가 변경되거나 원인을 모르면 기존 근거를 보존하고 중단한다.

이것은 로컬 경계 연습이지 OS sandbox가 아니다. 학습자 JS/테스트는 Node 사용자
권한으로 실행된다. 보호 registry는 임의 shell을 제공하지 않는다. 네트워크·설치·
모델 호출은 제공하지 않는다. 개인정보/실고객 자료는 사용하지 않는다.
강사 정답·.harness 실행 기록·개인 기록은 공개/배포하지 않는다.
