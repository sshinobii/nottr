import { verifyPrivyToken } from '../../../lib/privy-auth';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

async function context(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID || !url || !secret) return { error: 'History is not configured.', status: 503 } as const;
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return { error: 'Authentication required.', status: 401 } as const;
  try {
    const claims = await verifyPrivyToken(token);
    if (!claims.user_id.startsWith('did:privy:')) throw new Error('Invalid identity');
    return { userId: claims.user_id, db: createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }) } as const;
  } catch { return { error: 'Invalid or expired session.', status: 401 } as const; }
}

export async function GET(request: NextRequest) {
  const ctx = await context(request);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (request.nextUrl.searchParams.get('export') === '1') {
    const items: { id: number; address: string; created_at: string }[] = [];
    let lastId = 0;
    for (;;) {
      const { data, error } = await ctx.db.from('scan_history').select('id,address,created_at').eq('user_id', ctx.userId).gt('id', lastId).order('id', { ascending: true }).limit(500);
      if (error || !data) return NextResponse.json({ error: 'History export is unavailable.' }, { status: 503 });
      items.push(...data);
      if (items.length > 10000) return NextResponse.json({ error: 'History is too large to export at once.' }, { status: 413 });
      if (data.length < 500) break;
      lastId = data[data.length - 1].id;
    }
    return NextResponse.json({ exportedAt: new Date().toISOString(), history: items }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const { data, error } = await ctx.db.from('scan_history').select('id,address,created_at').eq('user_id', ctx.userId).order('created_at', { ascending: false }).limit(20);
  if (error) return NextResponse.json({ error: 'History is unavailable.' }, { status: 503 });
  return NextResponse.json({ items: data }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const ctx = await context(request);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  let address: unknown;
  try { ({ address } = await request.json()); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(address)) return NextResponse.json({ error: 'Invalid address.' }, { status: 400 });
  const { data, error } = await ctx.db.from('scan_history').insert({ user_id: ctx.userId, address }).select('id,address,created_at').single();
  if (error) return NextResponse.json({ error: 'History is unavailable.' }, { status: 503 });
  return NextResponse.json({ item: data }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: NextRequest) {
  const ctx = await context(request);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { error } = await ctx.db.from('scan_history').delete().eq('user_id', ctx.userId);
  if (error) return NextResponse.json({ error: 'History is unavailable.' }, { status: 503 });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
