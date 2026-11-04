import test from 'node:test';
import assert from 'node:assert/strict';
import { relationships } from '../lib/relationships.mjs';

const a = '0x' + 'a'.repeat(40);
const b = '0x' + 'b'.repeat(40);
const c = '0x' + 'c'.repeat(40);

test('groups only direct interactions and preserves distinct evidence', () => {
  const result = relationships(a.toUpperCase().replace('0X', '0x'), [
    { from: a, to: b, hash: 'one' }, { from: b, to: a, hash: 'two' },
    { from: b, to: a, hash: 'two' }, { from: c, to: b, hash: 'unrelated' },
    { from: a, to: a, hash: 'self' }, { from: a, to: null, hash: 'create' },
  ]);
  assert.deepEqual(result, [{ address: b, interactions: 3, evidence: ['one', 'two'] }]);
});

test('returns an empty graph for an empty scan', () => assert.deepEqual(relationships(a, []), []));
