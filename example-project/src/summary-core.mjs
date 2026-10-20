const newCounts = () => ({ passed: 0, failed: 0, timed_out: 0, not_run: 0 });
const fullIdentity = (result) => JSON.stringify([result.buildId, result.module, result.caseId]);

export function summarizeValidatedResults(results, buildId, candidateStatuses, identityOf = fullIdentity) {
  const unique = new Map();
  let sourceRowCount = 0;
  for (const result of results) {
    if (result.buildId === buildId) sourceRowCount += 1;
    const identity = identityOf(result);
    if (!unique.has(identity)) unique.set(identity, result);
  }
  const counts = newCounts();
  const modules = new Map();
  const rerunCandidates = [];
  let uniqueCaseCount = 0;
  for (const result of unique.values()) {
    if (result.buildId !== buildId) continue;
    uniqueCaseCount += 1;
    counts[result.status] += 1;
    if (!modules.has(result.module)) {
      modules.set(result.module, { module: result.module, counts: newCounts() });
    }
    modules.get(result.module).counts[result.status] += 1;
    if (candidateStatuses.includes(result.status)) rerunCandidates.push(result);
  }
  return {
    buildId,
    sourceRowCount,
    uniqueCaseCount,
    duplicateRowCount: sourceRowCount - uniqueCaseCount,
    counts,
    modules: [...modules.values()],
    rerunCandidates,
  };
}
