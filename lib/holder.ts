import { PrivyClient } from '@privy-io/node';
import { meetsHolderThreshold } from './monitoring.mjs';

const TOKEN = '0xd4531a83a8b29d54aab30428f99de889e9e0fc54';

// The account's linked addresses are obtained from Privy, never from the browser.
// Failure to verify falls back to the free tier.
export async function holderLimit(userId: string): Promise<2 | 10 | null> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  const key = process.env.ALCHEMY_API_KEY;
  if (!appId || !appSecret || !key) return null;
  try {
    const client = new PrivyClient({ appId, appSecret });
    const user = await client.users()._get(userId);
    const wallets = user.linked_accounts.filter(account => account.type === 'wallet' && account.chain_type === 'ethereum' && /^0x[a-fA-F0-9]{40}$/.test(account.address)).map(account => (account as { address: string }).address.toLowerCase());
    if (!wallets.length) return 2;
    const url = `https://robinhood-mainnet.g.alchemy.com/v2/${encodeURIComponent(key)}`;
    async function rpc(method: string, params: unknown[]) {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10000), cache: 'no-store' });
      if (!response.ok) throw new Error('RPC unavailable');
      const body = await response.json();
      if (body.error || typeof body.result !== 'string' || !/^0x[0-9a-f]+$/i.test(body.result)) throw new Error('Unexpected RPC response');
      return body.result as string;
    }
    if (BigInt(await rpc('eth_chainId', [])) !== 4663n) throw new Error('Unexpected network');
    const decimals = await rpc('eth_call', [{ to: TOKEN, data: '0x313ce567' }, 'latest']);
    const balances = await Promise.all(wallets.slice(0, 20).map(async wallet => {
      const data = `0x70a08231${wallet.slice(2).padStart(64, '0')}`;
      return rpc('eth_call', [{ to: TOKEN, data }, 'latest']);
    }));
    if (balances.some(balance => meetsHolderThreshold(balance, decimals))) return 10;
    return 2;
  } catch (error) { console.error('Holder verification unavailable', error instanceof Error ? error.message : 'unknown'); return null; }
}
