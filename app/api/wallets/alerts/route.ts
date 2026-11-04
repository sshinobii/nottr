import { NextRequest, NextResponse } from 'next/server';
import { accountContext } from '../../../../lib/account-context';

export async function GET(request: NextRequest) {
  const ctx = await accountContext(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in or check account configuration.' }, { status: 401 });
  const { data: wallets, error: walletError } = await ctx.db.from('saved_wallets').select('id,address').eq('user_id', ctx.userId);
  if (walletError) return NextResponse.json({ error: 'Alerts unavailable.' }, { status: 503 });
  if (!wallets.length) return NextResponse.json({ items: [] }, { headers: { 'Cache-Control': 'no-store' } });
  const { data, error } = await ctx.db.from('wallet_alerts').select('id,wallet_id,kind,counterparty,evidence_hash,title,source_url,created_at').in('wallet_id', wallets.map(w => w.id)).order('created_at', { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: 'Alerts unavailable.' }, { status: 503 });
  const addresses = new Map(wallets.map(w => [w.id, w.address]));
  return NextResponse.json({ items: data.map(item => ({ ...item, wallet_address: addresses.get(item.wallet_id) })) }, { headers: { 'Cache-Control': 'no-store' } });
}
