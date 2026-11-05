import { approvalPairs } from './monitoring.mjs';
import { APPROVAL_TOPIC } from './approval-history.mjs';
const MAX = (1n << 256n) - 1n;
type Approval = { token: string; spender: string; allowance: string; unlimited: boolean; transaction: string };

export async function approvalRpc(method: string, params: unknown[]) {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error('Approval RPC unavailable');
  const url = `https://robinhood-mainnet.g.alchemy.com/v2/${encodeURIComponent(key)}`;
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10000), cache: 'no-store' });
  if (!response.ok) throw new Error('Approval RPC unavailable');
  const data = await response.json();
  if (data.error || data.result == null) throw new Error('Approval RPC request failed');
  return data.result;
}

export async function currentAllowance(owner: string, token: string, spender: string): Promise<bigint> {
  const data = `0xdd62ed3e${owner.slice(2).toLowerCase().padStart(64, '0')}${spender.slice(2).toLowerCase().padStart(64, '0')}`;
  const raw = await approvalRpc('eth_call', [{ to: token, data }, 'latest']);
  if (typeof raw !== 'string' || !/^0x[0-9a-f]+$/i.test(raw)) throw new Error('Invalid allowance');
  return BigInt(raw);
}

export function isUnlimitedAllowance(amount: bigint) { return amount === MAX; }

// This is a bounded discovery window, not a complete allowance inventory.
export async function recentApprovals(owner: string): Promise<{ status: 'ok' | 'partial' | 'unavailable'; items: Approval[]; coverage: string }> {
  const key = process.env.ALCHEMY_API_KEY;
  const coverage = 'Direct ERC-20 Approval events from the latest 1,000 blocks only; older approvals, permits, NFTs and contract-mediated approvals may be missing.';
  if (!key) return { status: 'unavailable', items: [], coverage };
  try {
    if (BigInt(await approvalRpc('eth_chainId', [])) !== 4663n) throw new Error('Incorrect chain');
    const latest = BigInt(await approvalRpc('eth_blockNumber', []));
    const from = latest > 999n ? latest - 999n : 0n;
    const ownerTopic = `0x${owner.slice(2).toLowerCase().padStart(64, '0')}`;
    const logs = await approvalRpc('eth_getLogs', [{ fromBlock: `0x${from.toString(16)}`, toBlock: `0x${latest.toString(16)}`, topics: [APPROVAL_TOPIC, ownerTopic] }]);
    if (!Array.isArray(logs)) throw new Error('Invalid logs');
    const pairs = approvalPairs(logs);
    const candidates = pairs.slice(-20);
    const results = await Promise.allSettled(candidates.map(async item => {
      const amount = await currentAllowance(owner, item.token, item.spender);
      return { ...item, allowance: amount.toString(), unlimited: isUnlimitedAllowance(amount) };
    }));
    const items = results.flatMap(result => result.status === 'fulfilled' && result.value.allowance !== '0' ? [result.value] : []);
    return { status: pairs.length > 20 || results.some(result => result.status === 'rejected') ? 'partial' : 'ok', items, coverage: `${coverage} Up to 20 token/spender pairs are checked; displayed amounts are raw token units.` };
  } catch { return { status: 'unavailable', items: [], coverage }; }
}
