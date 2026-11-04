import { NextRequest, NextResponse } from 'next/server';
import { scanAddress } from '../../../lib/scan';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address') || '';
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return NextResponse.json({ error: 'Enter a valid EVM address.' }, { status: 400 });
  if (process.env.VERCEL) {
    const ip = request.headers.get('x-vercel-forwarded-for')?.trim();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!ip || !isIP(ip) || !url || !key) return NextResponse.json({ error: 'Scan is temporarily unavailable.' }, { status: 503 });
    const clientKey = createHmac('sha256', key).update(ip).digest('hex');
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc('consume_scan_request', { p_client_key: clientKey });
    if (error) return NextResponse.json({ error: 'Scan is temporarily unavailable.' }, { status: 503 });
    if (!data) return NextResponse.json({ error: 'Scan limit reached. Please try again later.' }, { status: 429, headers: { 'Retry-After': '3600' } });
  }
  try {
    const scan = await scanAddress(address);
    return NextResponse.json(scan, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Robinhood Chain data is currently unavailable. Please try again.' }, { status: 502 }); }
}
