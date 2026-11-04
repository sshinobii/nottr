import { NextRequest, NextResponse } from 'next/server';
import { accountContext } from '../../../lib/account-context';
import { holderLimit } from '../../../lib/holder';

const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: NextRequest) {
  const ctx = await accountContext(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in or check account configuration.' }, { status: 401, headers });
  const { data, error } = await ctx.db.from('saved_wallets').select('id,address,slot,created_at,last_checked_at,last_error_at,last_result,history_pages,history_completed_at,history_error_at').eq('user_id', ctx.userId).order('created_at');
  if (error) return NextResponse.json({ error: 'Saved wallets are unavailable. Check database setup.' }, { status: 503, headers });
  const verifiedLimit = await holderLimit(ctx.userId);
  return NextResponse.json({ items: data, limit: verifiedLimit ?? 2, verificationUnavailable: verifiedLimit === null }, { headers });
}

export async function POST(request: NextRequest) {
  const ctx = await accountContext(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in or check account configuration.' }, { status: 401, headers });
  let address: unknown;
  try { ({ address } = await request.json()); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(address.trim())) return NextResponse.json({ error: 'Enter a valid 0x address.' }, { status: 400 });
  const normalized = address.trim().toLowerCase();
  // Unique user/slot constraints enforce the free limit even for concurrent requests.
  const verifiedLimit = await holderLimit(ctx.userId);
  const limit = verifiedLimit ?? 2;
  for (let slot = 1; slot <= limit; slot++) {
    const { data, error } = await ctx.db.from('saved_wallets').insert({ user_id: ctx.userId, address: normalized, slot }).select('id,address,slot,created_at,last_checked_at,last_error_at,last_result').single();
    if (!error) return NextResponse.json({ item: data }, { status: 201, headers });
    if (error.code !== '23505') return NextResponse.json({ error: 'Could not save wallet. Check database setup.' }, { status: 503 });
    const existing = await ctx.db.from('saved_wallets').select('id').eq('user_id', ctx.userId).eq('address', normalized).maybeSingle();
    if (existing.data) return NextResponse.json({ error: 'This address is already saved.' }, { status: 409 });
    if (existing.error) return NextResponse.json({ error: 'Could not save wallet.' }, { status: 503 });
  }
  return NextResponse.json({ error: verifiedLimit === null ? 'Holder verification is temporarily unavailable. Try again later.' : limit === 2 ? 'Free accounts can save two addresses. Link a wallet holding at least 1,000,000 $NOTTR for up to ten.' : 'Your account can save up to ten addresses.' }, { status: verifiedLimit === null ? 503 : 409 });
}

export async function DELETE(request: NextRequest) {
  const ctx = await accountContext(request);
  if (!ctx) return NextResponse.json({ error: 'Sign in or check account configuration.' }, { status: 401 });
  const id = request.nextUrl.searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid wallet.' }, { status: 400 });
  const { error } = await ctx.db.from('saved_wallets').delete().eq('id', id).eq('user_id', ctx.userId);
  if (error) return NextResponse.json({ error: 'Could not remove wallet.' }, { status: 503 });
  return NextResponse.json({ ok: true }, { headers });
}
