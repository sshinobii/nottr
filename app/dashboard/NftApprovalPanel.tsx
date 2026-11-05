'use client';

import { useCallback, useEffect, useState } from 'react';

type Item = { wallet_id: string; collection: string; kind: 'token' | 'operator'; token_id: string | null; spender: string; standard: 'erc721' | 'erc1155' | 'unknown'; transaction_hash: string; status: 'pending' | 'active' | 'revoked' | 'unavailable' };
type Progress = { id: string; nft_approval_next_block: number; nft_approval_head_block: number | null; nft_approval_completed_at: string | null; nft_approval_error_at: string | null };

export function NftApprovalPanel({ wallets, getAccessToken }: { wallets: Array<{ id: string; address: string }>; getAccessToken: () => Promise<string | null> }) {
  const [items, setItems] = useState<Item[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [offset, setOffset] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (nextOffset = 0) => {
    const token = await getAccessToken();
    if (!token) throw new Error('Please sign in again.');
    const response = await fetch(`/api/wallets/nft-approvals?offset=${nextOffset}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!response.ok) throw new Error('NFT inventory is unavailable. Apply the NFT approval migration.');
    const body = await response.json();
    setItems(previous => nextOffset ? [...previous, ...body.items] : body.items);
    setProgress(body.walletProgress);
    setOffset(body.nextOffset);
    setError('');
  }, [getAccessToken]);

  useEffect(() => {
    if (!wallets.length) return;
    let active = true;
    const refresh = async () => { try { await load(); } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'NFT inventory unavailable.'); } };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [wallets.length, load]);

  if (!wallets.length) return null;
  return <>
    <div className="panel-head"><div><span className="panel-index">HISTORICAL NFT APPROVALS</span><h2>NFT permissions</h2></div></div>
    <p>NOTTR checks standard ERC-721 token approvals and ERC-721/1155 operator approvals from public events, then reads current contract state. A permission is not proof that an operator is malicious. Only verified standard interfaces can be marked active.</p>
    {progress.map(wallet => <p className="notice" key={wallet.id}>{wallets.find(item => item.id === wallet.id)?.address.slice(0, 8)}… · {wallet.nft_approval_error_at ? 'NFT history check failed; will retry.' : wallet.nft_approval_completed_at ? `NFT events checked through block ${wallet.nft_approval_head_block ?? 'unknown'}.` : `Checking NFT events: reached block ${Math.max(0, wallet.nft_approval_next_block - 1)} of ${wallet.nft_approval_head_block ?? 'latest'}.`}</p>)}
    {error && <p className="terminal-error" role="alert">{error}</p>}
    {items.length ? <div className="connections">{items.map(item => <div className="signal" key={`${item.wallet_id}:${item.collection}:${item.kind}:${item.token_id ?? item.spender}`}><div>
      <strong>{wallets.find(wallet => wallet.id === item.wallet_id)?.address.slice(0, 8)}… · {item.status.toUpperCase()}</strong>
      <p>{item.standard.toUpperCase()} {item.kind === 'token' ? `TOKEN #${item.token_id}` : 'COLLECTION OPERATOR'} · COLLECTION <a href={`https://robinhoodchain.blockscout.com/address/${item.collection}`} target="_blank" rel="noreferrer">{item.collection.slice(0, 10)}…{item.collection.slice(-6)}</a> · OPERATOR <a href={`https://robinhoodchain.blockscout.com/address/${item.spender}`} target="_blank" rel="noreferrer">{item.spender.slice(0, 10)}…{item.spender.slice(-6)}</a></p>
      <p>{item.status === 'active' ? 'Current contract state confirms this approval.' : item.status === 'revoked' ? 'This approval is no longer active.' : 'Current approval could not be confirmed.'} · <a href={`https://robinhoodchain.blockscout.com/tx/${item.transaction_hash}`} target="_blank" rel="noreferrer">EVENT ↗</a></p>
    </div></div>)}</div> : !error && <p>No standard NFT approvals discovered yet. The historical scan may still be running.</p>}
    {offset !== null && <button className="outline-button" type="button" disabled={busy} onClick={async () => { setBusy(true); try { await load(offset); } catch (cause) { setError(cause instanceof Error ? cause.message : 'NFT inventory unavailable.'); } finally { setBusy(false); } }}>{busy ? 'LOADING…' : 'LOAD MORE NFT PERMISSIONS ↗'}</button>}
    <p>Used ERC-2612 permits appear in the ERC-20 inventory through their Approval events. Unsubmitted signatures, Permit2 and custom permission contracts are not covered by this scan.</p>
  </>;
}
