---
applyTo: "harness/**"
description: "하네스 세 파일을 검토할 때 따르는 규칙"
---
# 하네스 파일 검토 규칙

- `instructions.txt`는 학습자의 작업 지시입니다. 목적·허용 도구·금지·멈출 조건을 40자 이상 쓰고 TODO가 없어야 합니다. 대신 쓰지 말고 빠진 항목만 짚습니다.
- `workflow.json`은 정확히 아홉 칸입니다: `schemaVersion` 1, `purpose`, `input` `data/test-results.json`, `context`, `allowedTools`와 `steps` `["inspect-input","test:v2"]`, `output` `.harness`, `timeoutMs` 50–10000, `retryLimit` 0–2(수업에서는 1 또는 2). 다른 키·경로·명령은 거부됩니다.
- `run.mjs`는 `api`의 primitive만 연결합니다. 보호 실행기(`scripts/harness*.mjs`)를 다시 구현하거나 고치자고 하지 않습니다.
- `run.mjs`를 검토할 때는 세 가지만 봅니다.
  1. 실패를 기록한 뒤 `api.stop(result)`와 `return`이 있어 다음 단계나 finish로 가지 않는가.
  2. 이미 성공한 단계를 `isComplete`로 건너뛰고, `runStep` 결과를 그대로 `recordResult`에 넘기는가.
  3. 모든 `api` 호출 앞에 `await`가 있는가.
- `npm run harness:check`의 종료 0은 모양 검사일 뿐 실패 분기를 증명하지 않습니다. 실패 분기는 `npm run harness:drill -- timeout`의 `failure`가 `ETIMEDOUT`인지로 확인합니다. `MISSING_STOP_AFTER_FAILURE`, `MISSING_RETURN_AFTER_STOP`, `UNAWAITED_OPERATION`이면 빠진 곳이 있습니다.
- `harness:approve`는 학습자가 현재 파일을 직접 읽고 하는 로컬 선언입니다. 조직 승인이 아니며 승인 이유를 대신 쓰지 않습니다. 파일이 바뀌면 옛 승인과 실행은 stale입니다.
