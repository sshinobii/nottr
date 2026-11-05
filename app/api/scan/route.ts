import { NextRequest, NextResponse } from 'next/server';
import { scanAddress } from '../../../lib/scan';
import { consumeScanRequest } from '../../../lib/scan-limit';

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address') || '';
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return NextResponse.json({ error: 'Enter a valid EVM address.' }, { status: 400 });
  const limit = await consumeScanRequest(request);
  if (limit === 'unavailable') return NextResponse.json({ error: 'Scan is temporarily unavailable.' }, { status: 503 });
  if (limit === 'limited') return NextResponse.json({ error: 'Scan limit reached. Please try again later.' }, { status: 429, headers: { 'Retry-After': '3600' } });
  try {
    const scan = await scanAddress(address);
    return NextResponse.json(scan, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Robinhood Chain data is currently unavailable. Please try again.' }, { status: 502 }); }
}
