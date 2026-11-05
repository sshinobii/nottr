import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVAL_TOPIC } from '../lib/approval-history.mjs';
import { APPROVAL_FOR_ALL_TOPIC, nftApprovalEvents } from '../lib/nft-approval-history.mjs';

const owner = `0x${'a'.repeat(40)}`;
const collection = `0x${'b'.repeat(40)}`;
const spender = `0x${'c'.repeat(40)}`;
const word = address => `0x${address.slice(2).padStart(64, '0')}`;
const base = { address: collection, transactionHash: `0x${'1'.repeat(64)}`, blockNumber: '0xc', logIndex: '0x1' };

test('NFT operator and per-token approvals are parsed independently of ERC-20', () => {
  const token = { ...base, topics: [APPROVAL_TOPIC, word(owner), word(spender), `0x${'0'.repeat(63)}7`], data: '0x' };
  const operator = { ...base, topics: [APPROVAL_FOR_ALL_TOPIC, word(owner), word(spender), null], data: `0x${'0'.repeat(63)}1` };
  const erc20 = { ...base, topics: [APPROVAL_TOPIC, word(owner), word(spender), null], data: `0x${'0'.repeat(64)}` };
  assert.deepEqual(nftApprovalEvents(owner, [erc20, token], [operator], 0, 20), [
    { collection, kind: 'token', tokenId: '7', spender, transaction: base.transactionHash, block: 12 },
    { collection, kind: 'operator', tokenId: null, spender, transaction: base.transactionHash, block: 12 },
  ]);
});

test('NFT parser rejects mismatched owner', () => {
  assert.throws(() => nftApprovalEvents(owner, [], [{ ...base, topics: [APPROVAL_FOR_ALL_TOPIC, word(spender), word(spender)], data: `0x${'0'.repeat(64)}` }], 0, 20));
});
