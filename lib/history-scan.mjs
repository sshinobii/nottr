import { monitoringObservations } from './monitoring.mjs';

// Only cursor parameters from Blockscout are used; the origin and endpoint are fixed.
export async function transactionHistoryPage(address, cursor) {
  const phases = ['transactions', 'token-transfers', 'internal-transactions'];
  const phase = cursor?.phase ?? 'transactions';
  if (typeof phase !== 'string' || !phases.includes(phase)) throw new Error('Invalid history phase');
  const params = cursor?.params;
  if (params !== null && params !== undefined && (typeof params !== 'object' || Array.isArray(params))) throw new Error('Invalid explorer cursor');
  const url = new URL(`https://robinhoodchain.blockscout.com/api/v2/addresses/${address}/${phase}`);
  if (params) for (const [key, value] of Object.entries(params)) {
    if (!/^[a-z_]{1,40}$/.test(key) || (typeof value !== 'string' && typeof value !== 'number') || String(value).length > 128) throw new Error('Invalid explorer cursor');
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('History provider unavailable');
  const body = await response.json();
  if (!Array.isArray(body.items)) throw new Error('Invalid history response');
  const next = body.next_page_params;
  if (next !== null && next !== undefined && (typeof next !== 'object' || Array.isArray(next) || Object.keys(next).length === 0)) throw new Error('Invalid history cursor');
  if (next && params && JSON.stringify(next) === JSON.stringify(params)) throw new Error('History cursor did not advance');
  const transactions = body.items.flatMap(tx => {
    const hash = tx.hash || tx.transaction_hash || tx.tx_hash;
    const entries = [{ from: tx.from?.hash, to: tx.to?.hash || tx.created_contract?.hash, hash }];
    const token = tx.token?.address || tx.token?.address_hash;
    if (phase === 'token-transfers' && /^0x[a-f0-9]{40}$/i.test(token || '')) entries.push({ from: address, to: token, hash });
    return entries;
  });
  const nextPhase = phases[phases.indexOf(phase) + 1];
  return { observations: monitoringObservations(address, transactions), cursor: next ? { phase, params: next } : nextPhase ? { phase: nextPhase, params: null } : null };
}
