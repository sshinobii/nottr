import { NextRequest, NextResponse } from 'next/server';
import { accountContext } from '../../../../lib/account-context';

const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: NextRequest) {
  const ctx = await accountContext(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in or check account configuration.' }, { status: 401, headers });
  const rawOffset = request.nextUrl.searchParams.get('offset') || '0';
  if (!/^(0|[1-9][0-9]{0,4})$/.test(rawOffset)) return NextResponse.json({ error: 'Invalid page.' }, { status: 400, headers });
  const offset = Number(rawOffset);
  const owned = await ctx.db.from('saved_wallets').select('id,nft_approval_next_block,nft_approval_head_block,nft_approval_completed_at,nft_approval_error_at').eq('user_id', ctx.userId);
  if (owned.error) return NextResponse.json({ error: 'NFT permission inventory is unavailable. Check database setup.' }, { status: 503, headers });
  const walletProgress = owned.data || [];
  const ids = walletProgress.map(item => item.id);
  if (!ids.length) return NextResponse.json({ items: [], nextOffset: null, walletProgress }, { headers });
  const page = await ctx.db.from('wallet_nft_approvals')
    .select('wallet_id,collection,kind,token_id,spender,standard,transaction_hash,last_event_block,status,checked_at')
    .in('wallet_id', ids).order('last_event_block', { ascending: false }).range(offset, offset + 50);
  if (page.error) return NextResponse.json({ error: 'NFT permission inventory is unavailable. Check database setup.' }, { status: 503, headers });
  return NextResponse.json({ items: (page.data || []).slice(0, 50), nextOffset: (page.data || []).length > 50 ? offset + 50 : null, walletProgress }, { headers });
}
