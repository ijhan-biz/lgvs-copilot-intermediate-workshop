import assert from 'node:assert/strict';
import { test } from 'node:test';

const expected = null;

test('readiness | edit, save, run', () => {
  assert.notEqual(expected, null, 'not-completed: calculate the synthetic expression, edit only expected, save, then rerun');
  assert.equal((6 * 3) - 4, expected);
});
