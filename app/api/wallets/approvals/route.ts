import { NextRequest, NextResponse } from 'next/server';
import { accountContext } from '../../../../lib/account-context';

const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: NextRequest) {
  const ctx = await accountContext(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in or check account configuration.' }, { status: 401, headers });
  const rawOffset = request.nextUrl.searchParams.get('offset') || '0';
  if (!/^(0|[1-9][0-9]{0,4})$/.test(rawOffset)) return NextResponse.json({ error: 'Invalid page.' }, { status: 400, headers });
  const offset = Number(rawOffset);
  const owned = await ctx.db.from('saved_wallets').select('id,approval_next_block,approval_head_block,approval_completed_at,approval_error_at').eq('user_id', ctx.userId);
  if (owned.error) return NextResponse.json({ error: 'Permissions are unavailable.' }, { status: 503, headers });
  const walletProgress = owned.data || [];
  const ids = walletProgress.map(item => item.id);
  if (!ids.length) return NextResponse.json({ items: [], nextOffset: null, walletProgress }, { headers });
  const page = await ctx.db.from('wallet_approvals')
    .select('wallet_id,token,spender,transaction_hash,last_event_block,allowance,status,checked_at')
    .in('wallet_id', ids)
    .order('last_event_block', { ascending: false })
    .range(offset, offset + 50);
  if (page.error) return NextResponse.json({ error: 'Permission inventory is unavailable. Check database setup.' }, { status: 503, headers });
  const items = (page.data || []).slice(0, 50);
  return NextResponse.json({ items, nextOffset: (page.data || []).length > 50 ? offset + 50 : null, walletProgress }, { headers });
}
