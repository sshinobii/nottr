import { serviceDatabase } from './account-context';
import { approvalRpc, currentAllowance, isUnlimitedAllowance } from './approvals';
import { APPROVAL_TOPIC, MAX_LOGS, approvalEvents, approvalRange, nextApprovalWindow } from './approval-history.mjs';

type Database = ReturnType<typeof serviceDatabase>;
type Job = { id: string; address: string; approval_next_block: number; approval_window: number; approval_error_at: string | null };
type LogResponse = { status: string; message: string; result: unknown };

async function indexedHead(): Promise<number> {
  const response = await fetch('https://robinhoodchain.blockscout.com/api/v2/blocks', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Approval explorer head unavailable');
  const body = await response.json();
  const height = body?.items?.[0]?.height;
  if (!Number.isSafeInteger(height) || height < 0) throw new Error('Invalid approval explorer head');
  return height;
}

async function explorerLogs(owner: string, from: number, to: number): Promise<unknown[]> {
  const url = new URL('https://robinhoodchain.blockscout.com/api');
  url.search = new URLSearchParams({
    module: 'logs', action: 'getLogs', fromBlock: String(from), toBlock: String(to),
    topic0: APPROVAL_TOPIC, topic1: `0x${owner.slice(2).toLowerCase().padStart(64, '0')}`, topic0_1_opr: 'and',
  }).toString();
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Approval explorer unavailable');
  const body = await response.json() as LogResponse;
  if (!Array.isArray(body.result)) throw new Error('Unexpected approval explorer response');
  if (body.status === '0' && body.message === 'No logs found') return [];
  if (body.status !== '1') throw new Error('Approval explorer rejected query');
  return body.result;
}

async function verifyAllowances(db: Database, job: Job) {
  const stale = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: due, error } = await db.from('wallet_approvals')
    .select('token,spender,transaction_hash,last_event_block')
    .eq('wallet_id', job.id)
    .or(`checked_at.is.null,checked_at.lt.${stale}`)
    .order('checked_at', { ascending: true, nullsFirst: true })
    .limit(20);
  if (error) throw new Error('Could not load token permissions');
  const updates: Array<{ wallet_id: string; token: string; spender: string; transaction_hash: string; last_event_block: number; allowance: string | null; status: string; checked_at: string }> = [];
  for (let offset = 0; offset < (due?.length ?? 0); offset += 5) {
    const group = await Promise.all((due ?? []).slice(offset, offset + 5).map(async item => {
      try {
        const amount = await currentAllowance(job.address, item.token, item.spender);
        return { wallet_id: job.id, token: item.token, spender: item.spender, transaction_hash: item.transaction_hash, last_event_block: item.last_event_block, allowance: amount.toString(), status: amount === 0n ? 'revoked' : isUnlimitedAllowance(amount) ? 'unlimited' : 'active', checked_at: new Date().toISOString() };
      } catch {
        return { wallet_id: job.id, token: item.token, spender: item.spender, transaction_hash: item.transaction_hash, last_event_block: item.last_event_block, allowance: null, status: 'unavailable', checked_at: new Date().toISOString() };
      }
    }));
    updates.push(...group);
  }
  const unlimited = updates.filter(item => item.status === 'unlimited').map(item => ({ token: item.token, spender: item.spender, transaction: item.transaction_hash, unlimited: true }));
  if (unlimited.length) {
    const signaled = await db.rpc('record_approval_signals', { p_id: job.id, p_approvals: unlimited });
    if (signaled.error) throw new Error('Could not record token permission alerts');
  }
  if (updates.length) {
    const saved = await db.from('wallet_approvals').upsert(updates, { onConflict: 'wallet_id,token,spender' });
    if (saved.error) throw new Error('Could not save token permissions');
  }
  const remaining = await db.from('wallet_approvals').select('token', { count: 'exact', head: true }).eq('wallet_id', job.id).or(`checked_at.is.null,checked_at.lt.${stale}`);
  if (remaining.error) throw new Error('Could not count pending permissions');
  return (remaining.count ?? 0) > 0;
}

export async function advanceApprovalInventory(db: Database, job: Job) {
  if (job.approval_error_at && Date.now() - new Date(job.approval_error_at).getTime() < 3600_000) {
    await db.from('saved_wallets').update({ next_check_at: new Date(new Date(job.approval_error_at).getTime() + 3600_000).toISOString(), lease_until: null }).eq('id', job.id);
    return;
  }
  if (BigInt(await approvalRpc('eth_chainId', [])) !== 4663n) throw new Error('Wrong approval chain');
  const [latest, explorerHead] = await Promise.all([approvalRpc('eth_blockNumber', []), indexedHead()]);
  const head = Math.max(0, Math.min(Number(BigInt(latest)), explorerHead) - 5000);
  if (!Number.isSafeInteger(head)) throw new Error('Invalid approval chain head');
  const nextBlock = Number(job.approval_next_block);
  const window = Number(job.approval_window);
  const range = approvalRange(nextBlock, window, head);
  let complete = nextBlock > head;
  if (!complete) {
    const logs = await explorerLogs(job.address, range.from, range.to);
    if (logs.length >= MAX_LOGS) {
      const width = range.to - range.from + 1;
      if (width === 1) throw new Error('Approval log limit reached in one block');
      const updated = await db.from('saved_wallets').update({ approval_window: nextApprovalWindow(width, logs.length), approval_head_block: head, approval_error_at: null, next_check_at: new Date().toISOString() }).eq('id', job.id);
      if (updated.error) throw new Error('Could not narrow approval range');
    } else {
      const events = approvalEvents(job.address, logs, range.from, range.to);
      if (events.length) {
        const rows = events.map(item => ({ wallet_id: job.id, token: item.token, spender: item.spender, transaction_hash: item.transaction, last_event_block: item.block, allowance: null, status: 'pending', checked_at: null }));
        const saved = await db.from('wallet_approvals').upsert(rows, { onConflict: 'wallet_id,token,spender' });
        if (saved.error) throw new Error('Could not save discovered permissions');
      }
      complete = range.to >= head;
      const updated = await db.from('saved_wallets').update({
        approval_next_block: range.to + 1, approval_window: nextApprovalWindow(window, logs.length), approval_head_block: head,
        approval_completed_at: complete ? new Date().toISOString() : null, approval_error_at: null,
        ...(!complete ? { next_check_at: new Date().toISOString() } : {}),
      }).eq('id', job.id);
      if (updated.error) throw new Error('Could not checkpoint permission history');
    }
  }
  const pending = await verifyAllowances(db, job);
  const released = await db.from('saved_wallets').update({
    lease_until: null, approval_error_at: null,
    ...(pending ? { next_check_at: new Date().toISOString() } : {}),
  }).eq('id', job.id);
  if (released.error) throw new Error('Could not release permission check');
}
