import { privacyScore } from './privacy-score.mjs';

const EXPLORER = 'https://robinhoodchain.blockscout.com';
type Tx = { id: string; hash: string; timestamp: string | null; from?: string; to?: string; method: string; status: string };

async function blockscout(address: string) {
  const response = await fetch(`${EXPLORER}/api/v2/addresses/${address}/transactions`, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Explorer unavailable');
  const data = await response.json();
  if (!Array.isArray(data.items)) throw new Error('Unexpected explorer response');
  const transactions: Tx[] = data.items.map((tx: any) => ({ id: tx.hash, hash: tx.hash, timestamp: tx.timestamp, from: tx.from?.hash, to: tx.to?.hash, method: tx.method || 'Transfer', status: tx.status }));
  return { transactions, hasMore: !!data.next_page_params, coverage: 'Latest transaction page. Token transfers and internal transactions are excluded.', provider: 'Blockscout' };
}

async function alchemy(address: string, key: string) {
  const url = `https://robinhood-mainnet.g.alchemy.com/v2/${encodeURIComponent(key)}`;
  async function request(method: string, params: unknown[]) {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Provider unavailable');
    const body = await response.json();
    if (body.error || body.result == null) throw new Error('Provider request failed');
    return body.result;
  }
  const chainId = await request('eth_chainId', []);
  if (chainId !== '0x1237') throw new Error('Wrong chain');
  const filters = { fromBlock: '0x0', toBlock: 'latest', category: ['external', 'erc20'], withMetadata: true, excludeZeroValue: false, maxCount: '0x32', order: 'desc' };
  const [incoming, outgoing] = await Promise.all([
    request('alchemy_getAssetTransfers', [{ ...filters, toAddress: address }]),
    request('alchemy_getAssetTransfers', [{ ...filters, fromAddress: address }]),
  ]);
  if (!Array.isArray(incoming.transfers) || !Array.isArray(outgoing.transfers)) throw new Error('Unexpected provider response');
  const unique = new Map<string, Tx>();
  for (const transfer of [...incoming.transfers, ...outgoing.transfers]) {
    if (typeof transfer.hash !== 'string' || typeof transfer.uniqueId !== 'string') throw new Error('Unexpected transfer');
    unique.set(transfer.uniqueId, { id: transfer.uniqueId, hash: transfer.hash, timestamp: transfer.metadata?.blockTimestamp || null, from: transfer.from || undefined, to: transfer.to || undefined, method: transfer.category === 'erc20' ? 'Token transfer' : 'Native transfer', status: 'observed' });
  }
  const transactions = [...unique.values()].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  return { transactions, hasMore: !!incoming.pageKey || !!outgoing.pageKey, coverage: 'Up to 50 incoming and 50 outgoing native and ERC-20 transfers; contract calls and internal transfers are excluded.', provider: 'Alchemy' };
}

export async function scanAddress(address: string) {
    const key = process.env.ALCHEMY_API_KEY;
    let result;
    if (key) {
      try { result = await alchemy(address, key); }
      catch {
        const fallback = await blockscout(address);
        result = { ...fallback, coverage: `Alchemy was unavailable; showing Blockscout fallback. ${fallback.coverage}` };
      }
    } else result = await blockscout(address);
    return { address, ...result, score: privacyScore(address, result.transactions), scannedAt: new Date().toISOString(), source: EXPLORER };
}

// Monitoring adds the explorer's recent contract-call transactions to the
// transfer sample. Neither source provides complete historical coverage here.
export async function scanForMonitoring(address: string) {
  const scan = await scanAddress(address);
  if (scan.provider === 'Blockscout') return scan;
  try {
    const calls = await blockscout(address);
    const seen = new Set(scan.transactions.map(tx => `${tx.hash}:${tx.from?.toLowerCase()}:${tx.to?.toLowerCase()}`));
    const extra = calls.transactions.filter(tx => !seen.has(`${tx.hash}:${tx.from?.toLowerCase()}:${tx.to?.toLowerCase()}`));
    return { ...scan, transactions: [...scan.transactions, ...extra], hasMore: scan.hasMore || calls.hasMore, provider: `${scan.provider} + Blockscout`, coverage: `${scan.coverage} Also includes the latest Blockscout transaction page (including direct contract calls). Internal transfers and older history may be missing.` };
  } catch {
    return { ...scan, coverage: `${scan.coverage} Blockscout contract-call coverage was unavailable.` };
  }
}
