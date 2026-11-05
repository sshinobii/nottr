import { serviceDatabase } from './account-context';
import { approvalRpc } from './approvals';
import { APPROVAL_TOPIC, MAX_LOGS, approvalRange, nextApprovalWindow } from './approval-history.mjs';
import { APPROVAL_FOR_ALL_TOPIC, nftApprovalEvents } from './nft-approval-history.mjs';

type Database = ReturnType<typeof serviceDatabase>;
type Job = { id: string; address: string; nft_approval_next_block: number; nft_approval_window: number; nft_approval_error_at: string | null };
type LogResponse = { status: string; message: string; result: unknown };
type NftRow = { collection: string; kind: 'token' | 'operator'; permission_key: string; token_id: string | null; spender: string; standard: 'erc721' | 'erc1155' | 'unknown'; transaction_hash: string; last_event_block: number };
const pad = (value: string) => value.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const addr = (word: string) => `0x${word.slice(-40).toLowerCase()}`;

async function explorerHead(): Promise<number> {
  const response = await fetch('https://robinhoodchain.blockscout.com/api/v2/blocks', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('NFT explorer head unavailable');
  const body = await response.json();
  const height = body?.items?.[0]?.height;
  if (!Number.isSafeInteger(height) || height < 0) throw new Error('Invalid NFT explorer head');
  return height;
}

async function logs(owner: string, topic: string, from: number, to: number): Promise<unknown[]> {
  const url = new URL('https://robinhoodchain.blockscout.com/api');
  url.search = new URLSearchParams({ module: 'logs', action: 'getLogs', fromBlock: String(from), toBlock: String(to), topic0: topic, topic1: `0x${pad(owner)}`, topic0_1_opr: 'and' }).toString();
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('NFT explorer unavailable');
  const body = await response.json() as LogResponse;
  if (!Array.isArray(body.result)) throw new Error('Unexpected NFT explorer response');
  if (body.status === '0' && body.message === 'No logs found') return [];
  if (body.status !== '1') throw new Error('NFT explorer rejected query');
  return body.result;
}

async function call(to: string, data: string): Promise<bigint> {
  const raw = await approvalRpc('eth_call', [{ to, data }, 'latest']);
  if (typeof raw !== 'string' || !/^0x[0-9a-f]{64}$/i.test(raw)) throw new Error('Invalid NFT contract response');
  return BigInt(raw);
}

async function standard(collection: string): Promise<'erc721' | 'erc1155' | 'unknown'> {
  try {
    const [nft721, nft1155] = await Promise.all([
      call(collection, `0x01ffc9a780ac58cd${'0'.repeat(56)}`),
      call(collection, `0x01ffc9a7d9b67a26${'0'.repeat(56)}`),
    ]);
    if (nft721 === 1n && nft1155 === 0n) return 'erc721';
    if (nft1155 === 1n && nft721 === 0n) return 'erc1155';
  } catch { /* Keep evidence, but do not mark an unverified interface active. */ }
  return 'unknown';
}

async function verify(db: Database, job: Job) {
  const stale = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await db.from('wallet_nft_approvals').select('collection,kind,permission_key,token_id,spender,standard,transaction_hash,last_event_block')
    .eq('wallet_id', job.id).or(`checked_at.is.null,checked_at.lt.${stale}`).order('checked_at', { ascending: true, nullsFirst: true }).limit(15);
  if (error) throw new Error('Could not load NFT permissions');
  const rows: Array<NftRow & { wallet_id: string; status: string; checked_at: string }> = [];
  for (let offset = 0; offset < (data?.length ?? 0); offset += 5) {
    const group = await Promise.all((data ?? []).slice(offset, offset + 5).map(async item => {
      let status: 'active' | 'revoked' | 'unavailable' = 'unavailable';
      try {
        const verifiedStandard = await standard(item.collection);
        if (verifiedStandard !== 'unknown' && (item.kind === 'operator' || verifiedStandard === 'erc721')) {
          if (item.kind === 'operator') {
            const approved = await call(item.collection, `0xe985e9c5${pad(job.address)}${pad(item.spender)}`);
            status = approved === 1n ? 'active' : approved === 0n ? 'revoked' : 'unavailable';
          } else if (item.token_id !== null) {
            const tokenWord = BigInt(item.token_id).toString(16).padStart(64, '0');
            const [owner, approved] = await Promise.all([
              call(item.collection, `0x6352211e${tokenWord}`),
              call(item.collection, `0x081812fc${tokenWord}`),
            ]);
            status = item.spender !== '0x0000000000000000000000000000000000000000' && addr(`0x${owner.toString(16).padStart(64, '0')}`) === job.address.toLowerCase() && addr(`0x${approved.toString(16).padStart(64, '0')}`) === item.spender ? 'active' : 'revoked';
          }
        }
        return { ...item, standard: verifiedStandard, wallet_id: job.id, status, checked_at: new Date().toISOString() };
      } catch {
        return { ...item, wallet_id: job.id, status, checked_at: new Date().toISOString() };
      }
    }));
    rows.push(...group);
  }
  if (rows.length) {
    const saved = await db.from('wallet_nft_approvals').upsert(rows, { onConflict: 'wallet_id,collection,kind,permission_key' });
    if (saved.error) throw new Error('Could not update NFT permissions');
  }
  const remaining = await db.from('wallet_nft_approvals').select('collection', { count: 'exact', head: true }).eq('wallet_id', job.id).or(`checked_at.is.null,checked_at.lt.${stale}`);
  if (remaining.error) throw new Error('Could not count NFT permissions');
  return (remaining.count ?? 0) > 0;
}

export async function advanceNftApprovalInventory(db: Database, job: Job) {
  if (job.nft_approval_error_at && Date.now() - new Date(job.nft_approval_error_at).getTime() < 3600_000) return;
  if (BigInt(await approvalRpc('eth_chainId', [])) !== 4663n) throw new Error('Wrong NFT approval chain');
  const [latest, indexed] = await Promise.all([approvalRpc('eth_blockNumber', []), explorerHead()]);
  const head = Math.max(0, Math.min(Number(BigInt(latest)), indexed) - 5000);
  if (!Number.isSafeInteger(head)) throw new Error('Invalid NFT approval head');
  const nextBlock = Number(job.nft_approval_next_block);
  const window = Number(job.nft_approval_window);
  const range = approvalRange(nextBlock, window, head);
  if (nextBlock <= head) {
    const [tokenLogs, operatorLogs] = await Promise.all([
      logs(job.address, APPROVAL_TOPIC, range.from, range.to),
      logs(job.address, APPROVAL_FOR_ALL_TOPIC, range.from, range.to),
    ]);
    const count = Math.max(tokenLogs.length, operatorLogs.length);
    if (count >= MAX_LOGS) {
      const width = range.to - range.from + 1;
      if (width === 1) throw new Error('NFT approval log limit reached in one block');
      const narrowed = await db.from('saved_wallets').update({ nft_approval_window: nextApprovalWindow(width, count), nft_approval_head_block: head, nft_approval_error_at: null, next_check_at: new Date().toISOString() }).eq('id', job.id);
      if (narrowed.error) throw new Error('Could not narrow NFT approval range');
    } else {
      const events = nftApprovalEvents(job.address, tokenLogs, operatorLogs, range.from, range.to);
      if (events.length) {
        const rows = events.map(item => ({ wallet_id: job.id, collection: item.collection, kind: item.kind, permission_key: item.tokenId ?? item.spender, token_id: item.tokenId, spender: item.spender, transaction_hash: item.transaction, last_event_block: item.block, standard: 'unknown', status: 'pending', checked_at: null }));
        const saved = await db.from('wallet_nft_approvals').upsert(rows, { onConflict: 'wallet_id,collection,kind,permission_key' });
        if (saved.error) throw new Error('Could not save discovered NFT permissions');
      }
      const complete = range.to >= head;
      const updated = await db.from('saved_wallets').update({
        nft_approval_next_block: range.to + 1, nft_approval_window: nextApprovalWindow(window, count), nft_approval_head_block: head,
        nft_approval_completed_at: complete ? new Date().toISOString() : null, nft_approval_error_at: null,
        ...(!complete ? { next_check_at: new Date().toISOString() } : {}),
      }).eq('id', job.id);
      if (updated.error) throw new Error('Could not checkpoint NFT approvals');
    }
  }
  const pending = await verify(db, job);
  if (pending) {
    const scheduled = await db.from('saved_wallets').update({ next_check_at: new Date().toISOString() }).eq('id', job.id);
    if (scheduled.error) throw new Error('Could not schedule NFT permission refresh');
  }
}
