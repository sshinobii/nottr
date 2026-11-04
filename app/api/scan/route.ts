import { NextRequest, NextResponse } from 'next/server';

const EXPLORER = 'https://robinhoodchain.blockscout.com';
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address') || '';
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return NextResponse.json({error:'Enter a valid EVM address.'},{status:400});
  try {
    const response = await fetch(`${EXPLORER}/api/v2/addresses/${address}/transactions`, {cache:'no-store', signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('Explorer unavailable');
    const data = await response.json();
    if (!Array.isArray(data.items)) throw new Error('Unexpected explorer response');
    const transactions = data.items.map((tx:any) => ({hash:tx.hash, timestamp:tx.timestamp, from:tx.from?.hash, to:tx.to?.hash, method:tx.method || 'Transfer', status:tx.status}));
    return NextResponse.json({address, transactions, hasMore:!!data.next_page_params, scannedAt:new Date().toISOString(), source:EXPLORER});
  } catch { return NextResponse.json({error:'Robinhood Chain data is currently unavailable. Please try again.'},{status:502}); }
}
