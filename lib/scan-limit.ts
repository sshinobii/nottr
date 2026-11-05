import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

export async function consumeScanRequest(request: NextRequest): Promise<'ok' | 'limited' | 'unavailable'> {
  if (!process.env.VERCEL) return 'ok';
  const ip = request.headers.get('x-vercel-forwarded-for')?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!ip || !isIP(ip) || !url || !key) return 'unavailable';
  const clientKey = createHmac('sha256', key).update(ip).digest('hex');
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc('consume_scan_request', { p_client_key: clientKey });
    if (error) return 'unavailable';
    return data ? 'ok' : 'limited';
  } catch {
    return 'unavailable';
  }
}
