import test from 'node:test';
import assert from 'node:assert/strict';
import { transactionHistoryPage } from '../lib/history-scan.mjs';

test('history advances across paginated transactions, token transfers and internal transactions', async () => {
  const original = globalThis.fetch;
  const wallet = `0x${'1'.repeat(40)}`;
  const contract = `0x${'2'.repeat(40)}`;
  const hash = `0x${'3'.repeat(64)}`;
  const urls = [];
  const responses = [
    {items: [{from: {hash: wallet}, to: {hash: contract}, hash}], next_page_params: {block_number: 99, index: 1}},
    {items: [], next_page_params: null},
    {items: [{from: {hash: wallet}, to: {hash: wallet}, transaction_hash: hash, token: {address: contract}}], next_page_params: null},
    {items: [], next_page_params: null},
  ];
  globalThis.fetch = async url => { urls.push(String(url)); return new Response(JSON.stringify(responses.shift()), {headers: {'content-type': 'application/json'}}); };
  try {
    const first = await transactionHistoryPage(wallet, null);
    assert.deepEqual(first.observations, [{address: contract, hash}]);
    const second = await transactionHistoryPage(wallet, first.cursor);
    assert.match(urls[1], /block_number=99/);
    const third = await transactionHistoryPage(wallet, second.cursor);
    assert.deepEqual(third.observations, [{address: contract, hash}]);
    const fourth = await transactionHistoryPage(wallet, third.cursor);
    assert.equal(fourth.cursor, null);
    assert.match(urls[3], /internal-transactions/);
  } finally { globalThis.fetch = original; }
});

test('history rejects untrusted or non-advancing cursors', async () => {
  const original = globalThis.fetch;
  const wallet = `0x${'1'.repeat(40)}`;
  globalThis.fetch = async () => new Response(JSON.stringify({items: [], next_page_params: {block_number: 99}}), {headers: {'content-type': 'application/json'}});
  try {
    await assert.rejects(transactionHistoryPage(wallet, {phase: 'https://evil.example', params: null}));
    await assert.rejects(transactionHistoryPage(wallet, {phase: 'transactions', params: {block_number: 99}}));
  } finally { globalThis.fetch = original; }
});
