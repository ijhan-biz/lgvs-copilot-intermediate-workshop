---
description: "10:20 맥락 · AI의 주장을 계약 원문과 대조하기"
agent: ask
argument-hint: "확인할 주장 (예: 충돌하면 마지막 행을 쓰면 돼요)"
---
참고 자료: [contract.txt](../../contract.txt) · [domain-behavior.txt](../../domain-behavior.txt)

계약·코드·출력이 각각 규칙·구현·관찰이라는 점을 설명하고, 이번 질문에 필요한 근거와 필요 없는 문맥을 나눠 주세요.
아래 주장이 계약의 어느 문장과 맞거나 어긋나는지, 그 문장을 인용해 판단해 주세요.

주장: ${input:claim:확인할 주장을 적으세요}

누락된 조건을 추정하지 마세요. 코드는 수정하지 마세요.
not_run 건수와 같은 검사의 기준(buildId + module + caseId)을 빠뜨리지 마세요.
