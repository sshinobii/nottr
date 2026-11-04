import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSignals } from '../lib/signals.mjs';

const a = `0x${'a'.repeat(40)}`;
const b = `0x${'b'.repeat(40)}`;
test('multiple transfers from one transaction do not count as repeated transactions', () => {
  assert.deepEqual(deriveSignals(a, [{from:a,to:b,hash:'tx1'}, {from:a,to:b,hash:'tx1'}]), []);
});
test('two distinct direct transactions yield a signal with evidence', () => {
  const signals = deriveSignals(a, [{from:a,to:b,hash:'tx1'}, {from:b,to:a,hash:'tx2'}]);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].transactionCount, 2);
  assert.deepEqual(signals[0].evidence, ['tx1', 'tx2']);
});
test('missing evidence is not a signal', () => assert.deepEqual(deriveSignals(a, []), []));
