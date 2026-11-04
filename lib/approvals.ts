import { approvalPairs } from './monitoring.mjs';
const APPROVAL = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';
const MAX = (1n << 256n) - 1n;
type Approval = { token: string; spender: string; allowance: string; unlimited: boolean; transaction: string };

// This is a bounded discovery window, not a complete allowance inventory.
export async function recentApprovals(owner: string): Promise<{ status: 'ok' | 'partial' | 'unavailable'; items: Approval[]; coverage: string }> {
  const key = process.env.ALCHEMY_API_KEY;
  const coverage = 'Direct ERC-20 Approval events from the latest 1,000 blocks only; older approvals, permits, NFTs and contract-mediated approvals may be missing.';
  if (!key) return { status: 'unavailable', items: [], coverage };
  const url = `https://robinhood-mainnet.g.alchemy.com/v2/${encodeURIComponent(key)}`;
  async function rpc(method: string, params: unknown[]) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!response.ok) throw new Error('RPC unavailable');
    const data = await response.json();
    if (data.error || data.result == null) throw new Error('RPC request failed');
    return data.result;
  }
  try {
    if (BigInt(await rpc('eth_chainId', [])) !== 4663n) throw new Error('Incorrect chain');
    const latest = BigInt(await rpc('eth_blockNumber', []));
    const from = latest > 999n ? latest - 999n : 0n;
    const ownerTopic = `0x${owner.slice(2).toLowerCase().padStart(64, '0')}`;
    const logs = await rpc('eth_getLogs', [{ fromBlock: `0x${from.toString(16)}`, toBlock: `0x${latest.toString(16)}`, topics: [APPROVAL, ownerTopic] }]);
    if (!Array.isArray(logs)) throw new Error('Invalid logs');
    const pairs = approvalPairs(logs);
    const candidates = pairs.slice(-20);
    const results = await Promise.allSettled(candidates.map(async item => {
      const data = `0xdd62ed3e${owner.slice(2).toLowerCase().padStart(64, '0')}${item.spender.slice(2).padStart(64, '0')}`;
      const raw = await rpc('eth_call', [{ to: item.token, data }, 'latest']);
      if (typeof raw !== 'string' || !/^0x[0-9a-f]+$/i.test(raw)) throw new Error('Invalid allowance');
      const amount = BigInt(raw);
      return { ...item, allowance: amount.toString(), unlimited: amount === MAX };
    }));
    const items = results.flatMap(result => result.status === 'fulfilled' && result.value.allowance !== '0' ? [result.value] : []);
    return { status: pairs.length > 20 || results.some(result => result.status === 'rejected') ? 'partial' : 'ok', items, coverage: `${coverage} Up to 20 token/spender pairs are checked; displayed amounts are raw token units.` };
  } catch { return { status: 'unavailable', items: [], coverage }; }
}
