export const APPROVAL_TOPIC = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';
export const MAX_LOGS = 1000;

export function approvalRange(nextBlock, window, head) {
  if (![nextBlock, window, head].every(Number.isSafeInteger) || nextBlock < 0 || window < 1 || head < 0) throw new Error('Invalid approval checkpoint');
  return { from: nextBlock, to: Math.min(head, nextBlock + window - 1) };
}

export function nextApprovalWindow(window, count) {
  if (!Number.isSafeInteger(window) || window < 1 || !Number.isSafeInteger(count) || count < 0) throw new Error('Invalid approval window');
  if (count >= MAX_LOGS) return Math.max(1, Math.floor(window / 2));
  return count < 100 ? Math.min(100000000, window * 2) : window;
}

export function approvalEvents(owner, logs, from, to) {
  if (!/^0x[0-9a-f]{40}$/i.test(owner) || !Array.isArray(logs)) throw new Error('Invalid approval logs');
  const ownerTopic = `0x${owner.slice(2).toLowerCase().padStart(64, '0')}`;
  const pairs = new Map();
  for (const log of logs) {
    const topics = log?.topics;
    const block = typeof log?.blockNumber === 'string' && /^0x[0-9a-f]+$/i.test(log.blockNumber) ? Number.parseInt(log.blockNumber, 16) : NaN;
    const index = typeof log?.logIndex === 'string' && /^0x[0-9a-f]+$/i.test(log.logIndex) ? Number.parseInt(log.logIndex, 16) : NaN;
    if (log?.removed || !/^0x[0-9a-f]{40}$/i.test(log?.address) || !/^0x[0-9a-f]{64}$/i.test(log?.transactionHash) ||
      !Array.isArray(topics) || topics.length < 3 || topics.length > 4 || (topics.length === 4 && topics[3] != null) ||
      topics[0]?.toLowerCase() !== APPROVAL_TOPIC || topics[1]?.toLowerCase() !== ownerTopic ||
      !/^0x0{24}[0-9a-f]{40}$/i.test(topics[2]) || !/^0x[0-9a-f]{64}$/i.test(log?.data) ||
      !Number.isSafeInteger(block) || block < from || block > to || !Number.isSafeInteger(index)) throw new Error('Unexpected approval log');
    const token = log.address.toLowerCase();
    const spender = `0x${topics[2].slice(-40).toLowerCase()}`;
    const key = `${token}:${spender}`;
    const previous = pairs.get(key);
    if (!previous || block > previous.block || (block === previous.block && index > previous.index))
      pairs.set(key, { token, spender, transaction: log.transactionHash.toLowerCase(), block, index });
  }
  return [...pairs.values()].map(({ index, ...event }) => event);
}
