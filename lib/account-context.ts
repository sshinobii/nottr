import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { verifyPrivyToken } from './privy-auth';

export function serviceDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Database unavailable');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function accountContext(request: NextRequest) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return null;
  try {
    const claims = await verifyPrivyToken(token);
    if (!claims.user_id.startsWith('did:privy:')) return null;
    return { userId: claims.user_id, db: serviceDatabase() };
  } catch { return null; }
}
