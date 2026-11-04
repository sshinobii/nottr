import { NextRequest, NextResponse } from 'next/server';
import { scanAddress } from '../../../lib/scan';

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address') || '';
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return NextResponse.json({ error: 'Enter a valid EVM address.' }, { status: 400 });
  try {
    const scan = await scanAddress(address);
    return NextResponse.json(scan, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Robinhood Chain data is currently unavailable. Please try again.' }, { status: 502 }); }
}