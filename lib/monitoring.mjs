import { relationships } from './relationships.mjs';

// Only persist a direct counterparty when a valid supporting transaction exists.
export function monitoringObservations(address, transactions) {
  return relationships(address, transactions).flatMap(item => {
    const hash = item.evidence.find(value => /^0x[0-9a-f]{64}$/i.test(value));
    return hash ? [{ address: item.address, hash: hash.toLowerCase() }] : [];
  });
}

export function meetsHolderThreshold(balanceHex, decimalsHex) {
  if (!/^0x[0-9a-f]+$/i.test(balanceHex) || !/^0x[0-9a-f]+$/i.test(decimalsHex)) throw new Error('Invalid token response');
  const decimals = BigInt(decimalsHex);
  if (decimals > 36n) throw new Error('Invalid token decimals');
  return BigInt(balanceHex) >= 1_000_000n * (10n ** decimals);
}

export function approvalPairs(logs) {
  const pairs = new Map();
  for (const log of logs) {
    if (log.removed || !/^0x[a-f0-9]{40}$/i.test(log.address) || !/^0x[a-f0-9]{64}$/i.test(log.transactionHash) || !Array.isArray(log.topics) || log.topics.length !== 3 || !/^0x[a-f0-9]{64}$/i.test(log.topics[2]) || !/^0x[a-f0-9]{64}$/i.test(log.data)) continue;
    const token = log.address.toLowerCase();
    const spender = `0x${log.topics[2].slice(-40).toLowerCase()}`;
    pairs.set(`${token}:${spender}`, { token, spender, transaction: log.transactionHash.toLowerCase() });
  }
  return [...pairs.values()];
}
