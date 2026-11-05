import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVAL_TOPIC, approvalEvents, approvalRange, nextApprovalWindow } from '../lib/approval-history.mjs';

const owner = `0x${'a'.repeat(40)}`;
const token = `0x${'b'.repeat(40)}`;
const spender = `0x${'c'.repeat(40)}`;
const log = (block, index, hash) => ({
  address: token,
  transactionHash: `0x${hash.repeat(64)}`,
  blockNumber: `0x${block.toString(16)}`,
  logIndex: `0x${index.toString(16)}`,
  topics: [APPROVAL_TOPIC, `0x${owner.slice(2).padStart(64, '0')}`, `0x${spender.slice(2).padStart(64, '0')}`, null],
  data: `0x${'0'.repeat(64)}`,
});

test('historical approval parsing accepts Blockscout padding and keeps the latest evidence', () => {
  assert.deepEqual(approvalEvents(owner, [log(12, 1, '1'), log(12, 2, '2'), log(11, 9, '3')], 0, 20), [
    { token, spender, transaction: `0x${'2'.repeat(64)}`, block: 12 },
  ]);
});

test('historical approval parsing rejects other owners and malformed records', () => {
  assert.throws(() => approvalEvents(owner, [{ ...log(12, 1, '1'), topics: [APPROVAL_TOPIC, `0x${'d'.repeat(64)}`, `0x${spender.slice(2).padStart(64, '0')}`] }], 0, 20));
  assert.throws(() => approvalEvents(owner, [log(21, 1, '1')], 0, 20));
});

test('approval ranges advance and narrow when the explorer result is saturated', () => {
  assert.deepEqual(approvalRange(100, 50, 120), { from: 100, to: 120 });
  assert.equal(nextApprovalWindow(21, 1000), 10);
  assert.equal(nextApprovalWindow(100, 0), 200);
  assert.throws(() => approvalRange(-1, 10, 100));
});
