const fields = ['buildId', 'module', 'caseId', 'name', 'status'];
const statuses = new Set(['passed', 'failed', 'timed_out', 'not_run']);
const invalidIdentifier = /[^A-Za-z0-9_-]/;

function requireRecord(value, keys, label) {
  if (value === null || typeof value !== 'object' ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError(`${label}: 일반 객체가 필요합니다.`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => !keys.includes(key))) {
    throw new TypeError(`${label}: 필수 필드만 허용합니다.`);
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`${label}.${key}: 데이터 필드가 필요합니다.`);
    }
  }
}

function requireIdentifier(value, label) {
  if (typeof value !== 'string' || value.length === 0 || invalidIdentifier.test(value)) {
    throw new TypeError(`${label}: 영문자·숫자·밑줄·하이픈 식별자가 필요합니다.`);
  }
}

export function validateInput(results, options) {
  requireRecord(options, ['buildId'], 'options');
  requireIdentifier(options.buildId, 'options.buildId');
  if (!Array.isArray(results)) {
    throw new TypeError('results: 빈 칸 없는 배열이 필요합니다.');
  }
  const seen = new Map();
  for (let index = 0; index < results.length; index += 1) {
    if (!Object.hasOwn(results, index)) {
      throw new TypeError('results: 빈 칸을 허용하지 않습니다.');
    }
    const result = results[index];
    requireRecord(result, fields, `results[${index}]`);
    for (const key of ['buildId', 'module', 'caseId']) {
      requireIdentifier(result[key], key);
    }
    if (typeof result.name !== 'string' || result.name.trim().length === 0) {
      throw new TypeError('name: 공백뿐이지 않은 문자열이 필요합니다.');
    }
    if (!statuses.has(result.status)) {
      throw new TypeError('status: passed/failed/timed_out/not_run만 허용합니다.');
    }
    const identity = JSON.stringify([result.buildId, result.module, result.caseId]);
    const first = seen.get(identity);
    if (first && (first.name !== result.name || first.status !== result.status)) {
      throw new TypeError('같은 buildId/module/caseId의 이름 또는 상태가 충돌합니다.');
    }
    if (!first) seen.set(identity, result);
  }
}
