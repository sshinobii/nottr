import test from 'node:test';
import assert from 'node:assert/strict';
import { privacyScore } from '../lib/privacy-score.mjs';
const a = `0x${'a'.repeat(40)}`;
const b = `0x${'b'.repeat(40)}`;
const records = Array.from({length:5}, (_,i) => ({from:a,to:b,hash:`tx${i}`}));
test('insufficient evidence does not yield a score', () => {
  assert.equal(privacyScore(a, []).score, null);
  assert.equal(privacyScore(a, [{from:a,to:b,hash:'same'}, {from:a,to:b,hash:'same'}]).score, null);
});
test('score is deterministic, explained and higher means fewer observed penalties', () => {
  const value = privacyScore(a, records);
  assert.equal(value.score, 72);
  assert.equal(value.score, 100 - value.factors.reduce((sum,f) => sum + f.deduction,0));
  assert.deepEqual(privacyScore(a,records),value);
});
test('duplicate token transfers within one transaction cannot change score', () => {
  assert.deepEqual(privacyScore(a,[...records,records[0]]),privacyScore(a,records));
});
test('unrelated and self-transfers do not contribute', () => {
  assert.deepEqual(privacyScore(a,[...records,{from:a,to:a,hash:'self'}, {from:b,to:b,hash:'other'}]),privacyScore(a,records));
});
