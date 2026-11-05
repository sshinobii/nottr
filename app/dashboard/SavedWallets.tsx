'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Approval = { token: string; spender: string; allowance: string; unlimited: boolean; transaction: string };
type Wallet = { id: string; address: string; slot: number; last_checked_at: string | null; last_error_at: string | null; history_pages?: number; history_completed_at?: string | null; history_error_at?: string | null; last_result: { score?: { score: number | null }; coverage?: string; approvals?: { status: 'ok' | 'partial' | 'unavailable'; items: Approval[]; coverage: string } } | null };
type Alert = { id: string; kind: 'privacy' | 'risk'; title: string; counterparty: string; evidence_hash: string; source_url: string | null; wallet_address: string; created_at: string };

export function SavedWallets({ userId, getAccessToken }: { userId: string; getAccessToken: () => Promise<string | null> }) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(2);
  const [verificationUnavailable, setVerificationUnavailable] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setWallets([]);
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('Please sign in again.');
        const response = await fetch('/api/wallets', { headers: { Authorization: `Bearer ${token}` } });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Saved wallets are unavailable.');
        if (active) { setWallets(body.items); setLimit(body.limit === 10 ? 10 : 2); setVerificationUnavailable(body.verificationUnavailable); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Saved wallets are unavailable.'); }
      finally { if (active) setLoading(false); }
    })();
    async function refreshAlerts() {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const response = await fetch('/api/wallets/alerts', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (!response.ok) throw new Error('Alerts are unavailable. Check database setup.');
        const body = await response.json();
        if (active) setAlerts(body.items);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Alerts are unavailable.'); }
    }
    refreshAlerts();
    const timer = window.setInterval(refreshAlerts, 60_000);
    window.addEventListener('focus', refreshAlerts);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refreshAlerts); };
  }, [userId]);

  async function add(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Please sign in again.');
      const response = await fetch('/api/wallets', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ address }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not save address.');
      setWallets(previous => [...previous, body.item]); setAddress('');
      setNotice(body.firstCheck === 'complete' ? 'First check complete. Your score and observed activity are ready below.' : 'Address saved. The first check is queued for the scheduled monitor.');
      if (body.firstCheck === 'complete') {
        try {
          const alertsResponse = await fetch('/api/wallets/alerts', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
          if (alertsResponse.ok) {
            const alertsBody = await alertsResponse.json();
            setAlerts(alertsBody.items);
          }
        } catch { /* The scheduled alert refresh will retry. */ }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save address.'); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    setBusy(true); setError('');
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Please sign in again.');
      const response = await fetch(`/api/wallets?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Could not remove address.');
      const removed = wallets.find(wallet => wallet.id === id);
      setWallets(previous => previous.filter(wallet => wallet.id !== id));
      if (removed) setAlerts(previous => previous.filter(alert => alert.wallet_address !== removed.address));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove address.'); }
    finally { setBusy(false); }
  }

  return <section className="panel account-panel"><div className="panel-head"><div><span className="panel-index">02 / WATCHLIST</span><h2>Saved wallets</h2></div><span className="status-pill">{wallets.length} / {limit}</span></div>
    <p>Save Robinhood Chain addresses without connecting a wallet. Free accounts can save two. Link a wallet holding at least 1,000,000 $NOTTR to unlock up to ten. Saving an address does not verify ownership.</p>
    <p className="notice">Checks use a limited sample of public activity. A new connection is not proof of risk. Risk indicators require a configured source and may be incomplete.</p>
    {verificationUnavailable && <p className="notice">Holder verification is unavailable. Your extra addresses remain saved.</p>}
    {loading ? <p>Loading saved addresses…</p> : <>{wallets.length > 0 && <div className="connections">{wallets.map(wallet => <div className="signal" key={wallet.id}><div><a href={`https://robinhoodchain.blockscout.com/address/${wallet.address}`} target="_blank" rel="noreferrer">{wallet.address.slice(0, 10)}…{wallet.address.slice(-6)} ↗</a><p>{wallets.filter(other => other.slot < wallet.slot).length >= 2 && limit === 2 ? (verificationUnavailable ? 'Monitoring is waiting for holder verification.' : 'Monitoring paused: holder threshold not met.') : wallet.last_error_at && (!wallet.last_checked_at || wallet.last_error_at > wallet.last_checked_at) ? 'Last check failed. Showing the previous successful result if available.' : wallet.last_checked_at ? `Last checked ${new Date(wallet.last_checked_at).toLocaleString()}` : 'Awaiting first scheduled check.'}</p>{wallet.last_result && <p>Privacy Score: {wallet.last_result.score?.score ?? 'insufficient data'} · {wallet.last_result.coverage}</p>}</div><button className="history-action" type="button" disabled={busy} onClick={() => remove(wallet.id)}>REMOVE</button></div>)}</div>}
    {wallets.length < limit && <form onSubmit={add}><label htmlFor="saved-wallet-address">WALLET ADDRESS</label><div className="terminal-input"><input id="saved-wallet-address" value={address} onChange={event => setAddress(event.target.value)} placeholder="0x..." autoComplete="off" required/><button disabled={busy}>{busy ? 'CHECKING…' : 'SAVE & SCAN'} ↗</button></div></form>}</>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <p className="terminal-error" role="alert">{error}</p>}
    {wallets.length > 0 && <div className="connections"><div className="panel-head"><div><span className="panel-index">HISTORICAL COVERAGE</span><h2>Transaction history</h2></div></div><p>Blockscout transaction, token transfer and internal transaction pages are processed over multiple checks. Coverage depends on the explorer and does not include offchain connections or a complete approval history. Risk matching requires a configured source.</p>{wallets.map(wallet => <div className="connection" key={wallet.id}><span>{wallet.address.slice(0, 8)}…{wallet.address.slice(-6)}</span><span>{wallet.history_error_at ? 'HISTORY CHECK FAILED - WILL RETRY' : wallet.history_completed_at ? 'AVAILABLE HISTORY PAGES CHECKED' : 'HISTORY CHECK IN PROGRESS'} · {wallet.history_pages ?? 0} PAGES</span></div>)}</div>}
    {wallets.some(wallet => wallet.last_result?.approvals) && <div className="connections"><div className="panel-head"><div><span className="panel-index">RECENT APPROVAL EVENTS</span><h2>Token permissions</h2></div></div><p>These are active ERC-20 permissions discovered in a short recent event window. Older permissions can still be active even when none are listed. This is not a full approval inventory.</p>{wallets.filter(wallet => wallet.last_result?.approvals).map(wallet => { const result = wallet.last_result!.approvals!; return <div className="signal" key={wallet.id}><div><strong>Wallet {wallet.address.slice(0, 8)}…{wallet.address.slice(-6)}</strong><p>{result.status === 'unavailable' ? 'Approval check unavailable.' : result.status === 'partial' ? 'Partial approval check.' : 'Recent event window checked.'} {result.coverage}</p>{result.items.map(item => <p key={`${item.token}:${item.spender}`}>TOKEN <a href={`https://robinhoodchain.blockscout.com/address/${item.token}`} target="_blank" rel="noreferrer">{item.token.slice(0, 8)}…{item.token.slice(-6)}</a> · SPENDER <a href={`https://robinhoodchain.blockscout.com/address/${item.spender}`} target="_blank" rel="noreferrer">{item.spender.slice(0, 8)}…{item.spender.slice(-6)}</a> · {item.unlimited ? 'UNLIMITED' : 'ACTIVE'} · <a href={`https://robinhoodchain.blockscout.com/tx/${item.transaction}`} target="_blank" rel="noreferrer">EVENT ↗</a></p>)}</div></div>; })}</div>}
    <div className="panel-head"><div><span className="panel-index">MONITORING / SIGNALS</span><h2>Recent alerts</h2></div></div>
    {alerts.length ? <div className="connections">{alerts.map(alert => <div className="signal" key={alert.id}><div><strong>{alert.title}</strong><p>{alert.kind === 'risk' ? 'A source flagged a direct counterparty. This does not establish compromise.' : alert.title === 'Unlimited token permission observed' ? 'An unlimited ERC-20 allowance was found. Review whether this permission is still needed; this does not mean the spender is malicious.' : 'A direct counterparty was newly observed in the returned sample.'}</p><p>WALLET {alert.wallet_address.slice(0, 8)}…{alert.wallet_address.slice(-6)} · COUNTERPARTY {alert.counterparty.slice(0, 8)}…{alert.counterparty.slice(-6)} · {new Date(alert.created_at).toLocaleString()}</p><a href={`https://robinhoodchain.blockscout.com/tx/${alert.evidence_hash}`} target="_blank" rel="noreferrer">TRANSACTION ↗</a>{alert.source_url && <> · <a href={alert.source_url} target="_blank" rel="noreferrer">SOURCE ↗</a></>}</div><span className="panel-index">{alert.kind.toUpperCase()}</span></div>)}</div> : <p>No alerts to show. This does not mean there are no risks.</p>}
  </section>;
}
