---
applyTo: "test/**"
description: "검사 기대값을 정할 때 따르는 규칙"
---
# 검사 파일 규칙

- 기대값은 `contract.txt`와 입력 행에서 한 줄씩 정합니다. 지금 코드를 실행해 나온 값을 기대값으로 베끼지 않습니다.
- 학습자가 고치는 검사 파일은 `test/learner.test.mjs` 하나입니다. 다른 검사(`contract-suite`, `v1`, `v2`, `review`, `harness-regression`)는 고치거나 약화하지 않습니다.
- 새 검사가 먼저 실패하는지(RED) 확인한 뒤, 승인된 한 곳만 고쳐 통과시키는(GREEN) 순서를 지킵니다.
- `test/transfer.test.mjs`의 `expectedIds`는 학습자가 혼자 정하고 실행 전에 고정합니다. 값을 제안하지 않습니다.
