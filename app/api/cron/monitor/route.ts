import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { serviceDatabase } from '../../../../lib/account-context';
import { monitoringObservations } from '../../../../lib/monitoring.mjs';
import { scanForMonitoring } from '../../../../lib/scan';
import { holderLimit } from '../../../../lib/holder';
import { recentApprovals } from '../../../../lib/approvals';
import { transactionHistoryPage } from '../../../../lib/history-scan.mjs';
import { advanceApprovalInventory } from '../../../../lib/approval-inventory';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const supplied = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  return Buffer.byteLength(supplied) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = serviceDatabase();
  const deadline = Date.now() + 220_000;
  let checked = 0, failed = 0, approvalFailed = 0, suspended = 0;
  while (Date.now() < deadline) {
    const { data: jobs, error } = await db.rpc('claim_wallet_checks', { batch_size: 5 });
    if (error) { console.error('Monitor claim failed', error.message); return NextResponse.json({ error: 'Could not claim jobs.', checked, failed }, { status: 503 }); }
    if (!jobs?.length) break;
    await Promise.all(jobs.map(async (job: { id: string; address: string; slot: number; user_id: string; last_checked_at: string | null; history_cursor: Record<string, unknown> | null; history_completed_at: string | null; approval_next_block: number; approval_window: number; approval_error_at: string | null }) => {
      try {
        if (job.slot > 2) {
          const lower = await db.from('saved_wallets').select('id', { count: 'exact', head: true }).eq('user_id', job.user_id).lt('slot', job.slot);
          if (lower.error || lower.count === null) throw new Error('Could not verify free wallet allowance');
          if (lower.count >= 2) {
            const limit = await holderLimit(job.user_id);
            if (limit === null) throw new Error('Holder verification unavailable');
            if (limit < 10) {
              const next = new Date(); next.setUTCHours(24, 0, 0, 0);
              const { error } = await db.from('saved_wallets').update({ next_check_at: next.toISOString(), lease_until: null }).eq('id', job.id);
              if (error) throw error;
              suspended++; return;
            }
          }
        }
        const checkedToday = job.last_checked_at && job.last_checked_at.slice(0, 10) === new Date().toISOString().slice(0, 10);
        if (!checkedToday) {
          const [scan, approvals] = await Promise.all([scanForMonitoring(job.address), recentApprovals(job.address)]);
          const observations = monitoringObservations(scan.address, scan.transactions);
          const result = { scannedAt: scan.scannedAt, score: scan.score, coverage: scan.coverage, provider: scan.provider, hasMore: scan.hasMore, recordCount: scan.transactions.length, approvals };
          const approvalSignals = await db.rpc('record_approval_signals', { p_id: job.id, p_approvals: approvals.items });
          if (approvalSignals.error) throw new Error('Could not save approval signals');
          const { error } = await db.rpc('complete_wallet_check', { p_id: job.id, p_observations: observations, p_result: result });
          if (error) throw error;
        }
        if (!job.history_completed_at) {
          try {
            const page = await transactionHistoryPage(job.address, job.history_cursor);
            const saved = await db.rpc('record_history_page', { p_id: job.id, p_observations: page.observations, p_cursor: page.cursor });
            if (saved.error) throw new Error('Could not save history page');
          } catch {
            const next = new Date(); next.setUTCHours(24, 0, 0, 0);
            await db.from('saved_wallets').update({ history_error_at: new Date().toISOString(), lease_until: null, next_check_at: next.toISOString() }).eq('id', job.id);
          }
        }
        if (job.approval_next_block !== undefined) {
          try {
            await advanceApprovalInventory(db, job);
          } catch (cause) {
            approvalFailed++;
            console.error('Approval inventory failed', cause instanceof Error ? cause.message : 'provider or database error');
            await db.from('saved_wallets').update({ approval_error_at: new Date().toISOString(), next_check_at: new Date(Date.now() + 3600_000).toISOString(), lease_until: null }).eq('id', job.id);
          }
        }
        checked++;
      } catch (error) {
        failed++; console.error('Wallet check failed', error instanceof Error ? error.message : 'database or provider error');
        await db.from('saved_wallets').update({ last_error_at: new Date().toISOString(), next_check_at: new Date(Date.now() + 3600_000).toISOString(), lease_until: null }).eq('id', job.id);
      }
    }));
  }
  return NextResponse.json({ checked, failed, approvalFailed, suspended, timeLimitReached: Date.now() >= deadline }, { headers: { 'Cache-Control': 'no-store' } });
}
