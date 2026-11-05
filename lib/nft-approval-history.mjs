import { APPROVAL_TOPIC } from './approval-history.mjs';

export const APPROVAL_FOR_ALL_TOPIC = '0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31';

export function nftApprovalEvents(owner, tokenLogs, operatorLogs, from, to) {
  if (!/^0x[0-9a-f]{40}$/i.test(owner) || !Array.isArray(tokenLogs) || !Array.isArray(operatorLogs)) throw new Error('Invalid NFT approval input');
  const ownerTopic = `0x${owner.slice(2).toLowerCase().padStart(64, '0')}`;
  const items = new Map();
  for (const [kind, logs] of [['token', tokenLogs], ['operator', operatorLogs]]) {
    for (const log of logs) {
      const topics = log?.topics;
      const block = typeof log?.blockNumber === 'string' && /^0x[0-9a-f]+$/i.test(log.blockNumber) ? Number.parseInt(log.blockNumber, 16) : NaN;
      const index = typeof log?.logIndex === 'string' && /^0x[0-9a-f]+$/i.test(log.logIndex) ? Number.parseInt(log.logIndex, 16) : NaN;
      if (log?.removed || !/^0x[0-9a-f]{40}$/i.test(log?.address) || !/^0x[0-9a-f]{64}$/i.test(log?.transactionHash) ||
        !Array.isArray(topics) || topics[0]?.toLowerCase() !== (kind === 'token' ? APPROVAL_TOPIC : APPROVAL_FOR_ALL_TOPIC) ||
        topics[1]?.toLowerCase() !== ownerTopic || !/^0x0{24}[0-9a-f]{40}$/i.test(topics[2]) ||
        !Number.isSafeInteger(block) || block < from || block > to || !Number.isSafeInteger(index)) throw new Error('Unexpected NFT approval log');
      let tokenId = null;
      if (kind === 'token') {
        if (topics.length !== 4 || !/^0x[0-9a-f]{64}$/i.test(topics[3]) || log.data !== '0x') continue; // ERC-20 shares topic0.
        tokenId = BigInt(topics[3]).toString();
      } else {
        if (!(topics.length === 3 || (topics.length === 4 && topics[3] == null)) || !/^0x[0-9a-f]{64}$/i.test(log.data)) throw new Error('Unexpected NFT operator log');
        if (BigInt(log.data) !== 0n && BigInt(log.data) !== 1n) throw new Error('Unexpected NFT operator flag');
      }
      const collection = log.address.toLowerCase();
      const spender = `0x${topics[2].slice(-40).toLowerCase()}`;
      const key = kind === 'token' ? `${collection}:token:${tokenId}` : `${collection}:operator:${spender}`;
      const previous = items.get(key);
      if (!previous || block > previous.block || (block === previous.block && index > previous.index))
        items.set(key, { collection, kind, tokenId, spender, transaction: log.transactionHash.toLowerCase(), block, index });
    }
  }
  return [...items.values()].map(({ index, ...item }) => item);
}
