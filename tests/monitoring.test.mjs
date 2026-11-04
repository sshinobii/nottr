import test from 'node:test';
import assert from 'node:assert/strict';
import { monitoringObservations, meetsHolderThreshold, approvalPairs } from '../lib/monitoring.mjs';

test('holder threshold uses exact integer token units', () => {
  const threshold = 1_000_000n * 10n ** 18n;
  assert.equal(meetsHolderThreshold(`0x${threshold.toString(16)}`, '0x12'), true);
  assert.equal(meetsHolderThreshold(`0x${(threshold - 1n).toString(16)}`, '0x12'), false);
  assert.throws(() => meetsHolderThreshold('0x1', '0xff'));
  assert.throws(() => meetsHolderThreshold('not-a-balance', '0x12'));
});

test('approval discovery ignores removed and NFT-style events and deduplicates pairs', () => {
  const token = `0x${'a'.repeat(40)}`;
  const hash = `0x${'b'.repeat(64)}`;
  const spender = `0x${'c'.repeat(40)}`;
  const topic = `0x${spender.slice(2).padStart(64, '0')}`;
  const base = { address: token, transactionHash: hash, data: `0x${'0'.repeat(64)}`, topics: ['0x0', '0x0', topic] };
  assert.deepEqual(approvalPairs([base, base, { ...base, removed: true }, { ...base, topics: [...base.topics, '0x0'] }]), [{ token, spender, transaction: hash }]);
});

test('observations require a direct counterparty and valid transaction evidence', () => {
  const wallet = `0x${'1'.repeat(40)}`;
  const other = `0x${'2'.repeat(40)}`;
  const unrelated = `0x${'3'.repeat(40)}`;
  const hash = `0x${'A'.repeat(64)}`;
  const result = monitoringObservations(wallet, [
    { from: wallet, to: other, hash: 'invalid' },
    { from: other, to: wallet, hash },
    { from: unrelated, to: other, hash },
    { from: wallet, to: wallet, hash },
  ]);
  assert.deepEqual(result, [{ address: other, hash: hash.toLowerCase() }]);
});
