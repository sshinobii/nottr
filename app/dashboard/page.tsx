'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PrivyProvider, usePrivy, useLogin, useLinkAccount } from '@privy-io/react-auth';
import { relationships } from '../../lib/relationships.mjs';
import './terminal.css';

type Transaction = { id: string; hash: string; timestamp: string | null; from?: string; to?: string; method: string; status: string };
type Scan = { address: string; transactions: Transaction[]; hasMore: boolean; scannedAt: string; source: string; provider: string; coverage: string };
type HistoryItem = { id: number; address: string; created_at: string };
type AuthState = { ready: boolean; configured: boolean; user: { id: string; email?: { address: string } | null; wallet?: { address: string } | null } | null; login: () => void; linkWallet: () => void; logout: () => Promise<void>; getAccessToken: () => Promise<string | null> };
const robinhood = { id: 4663, name: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } }, blockExplorers: { default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' } } } as const;
const short = (value?: string) => value ? `${value.slice(0, 8)}…${value.slice(-6)}` : '—';
const validAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value);

export default function Dashboard() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <DashboardContent auth={{ ready: true, configured: false, user: null, login: () => {}, linkWallet: () => {}, logout: async () => {}, getAccessToken: async () => null }} />;
  return <PrivyProvider appId={appId} config={{ loginMethods: ['email', 'wallet'], defaultChain: robinhood, supportedChains: [robinhood], appearance: { theme: 'dark', accentColor: '#ff0030', walletChainType: 'ethereum-only' } }}><PrivyDashboard /></PrivyProvider>;
}

function PrivyDashboard() {
  const { ready, authenticated, user, logout, getAccessToken } = usePrivy();
  const { login } = useLogin();
  const { linkWallet } = useLinkAccount();
  const handledLaunch = useRef(false);
  useEffect(() => {
    if (!ready || handledLaunch.current) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('login') !== '1') return;
    handledLaunch.current = true;
    url.searchParams.delete('login');
    window.history.replaceState(window.history.state, '', url);
    if (!authenticated) login({ loginMethods: ['email', 'wallet'], walletChainType: 'ethereum-only' });
  }, [ready, authenticated, login]);
  return <DashboardContent auth={{ ready, configured: true, user: authenticated ? user : null, login: () => login({ loginMethods: ['email', 'wallet'], walletChainType: 'ethereum-only' }), linkWallet: () => linkWallet(), logout, getAccessToken }} />;
}

function DashboardContent({ auth }: { auth: AuthState }) {
  const session = auth.user;
  const authReady = auth.ready;
  const configured = auth.configured;
  const [authError, setAuthError] = useState('');
  const [address, setAddress] = useState('');
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [tab, setTab] = useState<'overview' | 'activity' | 'account'>('overview');
  useEffect(() => {
    if (!session) { setHistory([]); setHistoryError(''); return; }
    let active = true;
    (async () => { try { const token = await auth.getAccessToken(); if (!token) throw new Error(); const response = await fetch('/api/history', { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error(); const data = await response.json(); if (active) { setHistory(data.items); setHistoryError(''); } } catch { if (active) setHistoryError('History is unavailable. Check the database setup.'); } })();
    return () => { active = false; };
  }, [session?.id]);

  async function signIn() {
    if (!configured || !authReady) return;
    setAuthError('');
    try { auth.login(); } catch { setAuthError('Sign-in could not be started.'); }
  }

  async function runScan(event: FormEvent) {
    event.preventDefault(); setError(''); setScan(null);
    const clean = address.trim();
    if (!validAddress(clean)) { setError('Enter a valid EVM address starting with 0x.'); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/scan?address=${encodeURIComponent(clean)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Scan unavailable.');
      setScan(data); setTab('overview');
      if (session) {
        try { const token = await auth.getAccessToken(); if (!token) throw new Error(); const saved = await fetch('/api/history', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ address: clean }) }); if (!saved.ok) throw new Error(); const body = await saved.json(); setHistory(previous => [body.item, ...previous].slice(0, 20)); setHistoryError(''); }
        catch { setHistoryError('Scan completed, but could not be saved to history.'); }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Scan unavailable.'); }
    finally { setLoading(false); }
  }

  async function deleteHistory() {
    if (!session) return;
    if (!window.confirm('Delete all saved scan history for this account? This cannot be undone.')) return;
    try { const token = await auth.getAccessToken(); if (!token) throw new Error(); const response = await fetch('/api/history', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error(); setHistory([]); setHistoryError(''); }
    catch { setHistoryError('Could not clear scan history.'); }
  }

  async function signOut() {
    try { await auth.logout(); setScan(null); setAddress(''); setTab('overview'); }
    catch { setAuthError('Could not sign out.'); }
  }

  const identityAddress = session?.wallet?.address || session?.email?.address;
  const counterparties = scan ? relationships(scan.address, scan.transactions) : [];

  return <div className="terminal-shell">
    <aside className="terminal-sidebar">
      <Link className="brand terminal-brand" href="/"><span className="eye" aria-hidden="true"/> NOTTR</Link>
      <div className="side-caption">WORKSPACE <span>01</span></div>
      <nav className="side-nav" aria-label="Workspace navigation">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><span>◫</span> Overview <b>↗</b></button>
        <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}><span>≋</span> Activity</button>
        <button className={tab === 'account' ? 'active' : ''} onClick={() => setTab('account')}><span>◇</span> Account</button>
      </nav>
      <div className="side-bottom"><span className="pulse"/> ROBINHOOD CHAIN <small>MAINNET · 4663</small></div>
    </aside>
    <div className="terminal-main">
      <header className="terminal-top"><div><Link href="/">NOTTR</Link><span> / </span> {tab === 'overview' ? 'Overview' : tab === 'activity' ? 'Activity' : 'Account'}</div><div className="terminal-top-right"><span className="network-dot"/> ROBINHOOD CHAIN <span className="top-divider"/>{authReady && session ? <button className="top-action" onClick={signOut}>Sign out ↗</button> : <button className="top-action" onClick={signIn} disabled={!configured || !authReady}>{!authReady ? 'Loading…' : 'Sign in ↗'}</button>}</div></header>
      <main className="terminal-content">
        {!configured && <p className="notice" role="status">Sign-in is not configured. Public address scans remain available.</p>}
        {tab === 'account' ? <><div className="terminal-kicker">YOUR ACCOUNT / 03</div><div className="terminal-title"><div><h1>Account<span>.</span></h1><p>Manage your workspace and wallet session.</p></div></div>
          <section className="panel account-panel"><div className="panel-head"><div><span className="panel-index">01 / IDENTITY</span><h2>Sign in</h2></div><span className={`status-pill ${session ? 'is-on' : ''}`}>{session ? 'SIGNED IN' : 'NOT CONNECTED'}</span></div>
            {!authReady ? <p>Checking session…</p> : session ? <><p>You are signed in with Privy. A linked wallet is required for wallet-specific features.</p><div className="account-row"><span>ACCOUNT</span><strong>{identityAddress || 'Authenticated account'}</strong></div><div className="account-actions"><button className="solid-button" onClick={auth.linkWallet}>LINK A WALLET ↗</button><button className="outline-button" onClick={signOut}>SIGN OUT ↗</button></div></> : <><p>Sign in with email or an Ethereum-compatible wallet. Connecting a wallet does not authorize a transaction.</p><button className="solid-button" onClick={signIn} disabled={!configured || !authReady}>{!authReady ? 'LOADING…' : 'SIGN IN ↗'}</button>{!configured && <p className="notice">Sign in is not configured yet.</p>}</>}{authError && <p className="terminal-error" role="alert">{authError}</p>}</section>
          <section className="panel account-panel"><div className="panel-head"><div><span className="panel-index">02 / YOUR DATA</span><h2>Scan history</h2></div></div><p>When signed in, successful scans save the address and time to your account. Results are fetched again when you scan. Saved wallets, reports and monitoring are not available yet.</p>{session && <><button className="outline-button" onClick={deleteHistory}>CLEAR SCAN HISTORY ↗</button>{historyError && <p className="terminal-error" role="alert">{historyError}</p>}</>}</section></>
        : <><div className="terminal-kicker">PRIVACY INTELLIGENCE / {tab === 'overview' ? '01' : '02'}</div><div className="terminal-title"><div><h1>{tab === 'overview' ? 'Overview' : 'Activity'}<span>.</span></h1><p>{tab === 'overview' ? 'Your onchain footprint, in focus.' : 'Transactions observed in your current scan.'}</p></div><div className="environment"><span className="pulse"/> PUBLIC DATA <small>ROBINHOOD MAINNET</small></div></div>
          <section className="scan-panel"><div className="scan-copy"><span className="panel-index">START AN INVESTIGATION</span><h2>Look closer.</h2><p>Enter any Robinhood Chain address. No wallet connection required.</p></div><form onSubmit={runScan}><label htmlFor="terminal-address">WALLET ADDRESS</label><div className="terminal-input"><span>⌘</span><input id="terminal-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="0x..." autoComplete="off"/><button disabled={loading}>{loading ? 'SCANNING…' : 'SCAN ADDRESS'} <span>↗</span></button></div>{error && <p className="terminal-error" role="alert">{error}</p>}</form></section>
          {session && tab === 'activity' && <section className="panel activity-panel"><div className="panel-head"><div><span className="panel-index">YOUR WORKSPACE / 01</span><h2>Scan history</h2></div></div>{historyError ? <p className="terminal-error">{historyError}</p> : history.length ? <div className="table-wrap"><table><thead><tr><th>ADDRESS</th><th>SCANNED</th><th>ACTION</th></tr></thead><tbody>{history.map(item => <tr key={item.id}><td>{short(item.address)}</td><td>{new Date(item.created_at).toLocaleString()}</td><td><button className="history-action" onClick={() => { setAddress(item.address); document.getElementById('terminal-address')?.focus(); }}>USE ADDRESS ↗</button></td></tr>)}</tbody></table></div> : <p>No saved scans yet.</p>}</section>}
          {scan ? <><div className="scan-meta"><span><i/> SCAN COMPLETE</span><span>ADDRESS / {short(scan.address)}</span><span>SCANNED / {new Date(scan.scannedAt).toLocaleString()}</span><a href={`${scan.source}/address/${scan.address}`} target="_blank" rel="noreferrer">SOURCE ↗</a></div>
            {tab === 'overview' && <><div className="metrics"><article><span>PRIVACY SCORE <b>01</b></span><strong>—<small> / 100</small></strong><p>Unavailable until scoring is validated.</p></article><article><span>OBSERVED RECORDS <b>02</b></span><strong>{scan.transactions.length}{scan.hasMore ? '+' : ''}</strong><p>Records returned by {scan.provider}.</p></article><article><span>COVERAGE <b>03</b></span><strong className="metric-text">Partial</strong><p>{scan.coverage}</p></article></div><div className="panel"><div className="panel-head"><div><span className="panel-index">EVIDENCE / 01</span><h2>Direct connections</h2></div><span className="status-pill">OBSERVED · {counterparties.length}</span></div><p>Derived from the records in this scan. A direct interaction does not establish that two addresses share an owner.</p>{counterparties.length > 0 && <div className="connections">{counterparties.slice(0, 8).map(item => <div className="connection" key={item.address}><span className="connection-dot"/><a href={`${scan.source}/address/${item.address}`} target="_blank" rel="noreferrer">{short(item.address)} ↗</a><span>{item.interactions} {item.interactions === 1 ? 'record' : 'records'}</span>{item.evidence[0] && <a href={`${scan.source}/tx/${item.evidence[0]}`} target="_blank" rel="noreferrer">EVIDENCE ↗</a>}</div>)}</div>}</div><div className="panel"><div className="panel-head"><div><span className="panel-index">INTERPRETATION / 02</span><h2>What to consider</h2></div><span className="status-pill">DERIVED · PARTIAL DATA</span></div>{counterparties.some(item => item.interactions > 1) ? <p>Multiple records involving the same address were observed in this sample. Repeated public interactions can make a relationship easier to notice. Review the linked records before drawing conclusions; one transaction can produce multiple records.</p> : <p>No repeated counterparty was found in this sample. This does not establish that none exist outside the scanned data.</p>}<p className="notice">For future activity, consider what your transactions and recurring counterparties reveal publicly. Changing your behavior cannot erase past transactions or guarantee privacy.</p></div></>}
            <section className="panel activity-panel"><div className="panel-head"><div><span className="panel-index">ACTIVITY FEED / 01</span><h2>Recent activity</h2></div><a href={`${scan.source}/address/${scan.address}`} target="_blank" rel="noreferrer">OPEN EXPLORER ↗</a></div>{scan.transactions.length ? <div className="table-wrap"><table><thead><tr><th>TRANSACTION</th><th>METHOD</th><th>FROM</th><th>TO</th><th>DATE</th></tr></thead><tbody>{scan.transactions.map(transaction => <tr key={transaction.id}><td><a href={`${scan.source}/tx/${transaction.hash}`} target="_blank" rel="noreferrer">{short(transaction.hash)} ↗</a></td><td>{transaction.method}</td><td>{short(transaction.from)}</td><td>{short(transaction.to)}</td><td>{transaction.timestamp ? new Date(transaction.timestamp).toLocaleDateString() : '—'}</td></tr>)}</tbody></table></div> : <p className="empty-message">No activity was returned for this address.</p>}<p className="notice">{scan.provider}: {scan.coverage}{scan.hasMore && ' Additional activity may be available in the explorer.'}</p></section></>
          : <><div className="metrics"><article><span>PRIVACY SCORE <b>01</b></span><strong>—<small> / 100</small></strong><p>Available after a supported analysis.</p></article><article><span>OBSERVED TRANSACTIONS <b>02</b></span><strong>—</strong><p>Run a scan to see activity.</p></article><article><span>COVERAGE <b>03</b></span><strong className="metric-text">—</strong><p>Data coverage appears with results.</p></article></div><section className="panel empty-panel"><div className="empty-eye"/><span className="panel-index">NO SCAN YET</span><h2>Start with an address.</h2><p>Your workspace will show observed activity and its source here.</p></section></>}
        </>}
        <footer className="terminal-footer"><span>NOTTR / WALLET PRIVACY INTELLIGENCE</span><span>PUBLIC DATA DOES NOT GUARANTEE PRIVACY</span></footer>
      </main>
    </div>
  </div>;
}
