'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PrivyProvider, usePrivy, useLogin, useLinkAccount } from '@privy-io/react-auth';
import { relationships } from '../../lib/relationships.mjs';
import { deriveSignals } from '../../lib/signals.mjs';
import type { PrivacyScore } from '../../lib/privacy-score.mjs';
import { ExposureMap } from './ExposureMap';
import { SavedWallets } from './SavedWallets';
import './terminal.css';

type Transaction = { id: string; hash: string; timestamp: string | null; from?: string; to?: string; method: string; status: string };
type Scan = { address: string; transactions: Transaction[]; hasMore: boolean; scannedAt: string; source: string; provider: string; coverage: string; score: PrivacyScore };
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
  const [question, setQuestion] = useState('What should I pay attention to in this scan?');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiMeta, setAiMeta] = useState('');
  const [aiError, setAiError] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [tab, setTab] = useState<'overview' | 'activity' | 'account'>('overview');
  const [alertCount, setAlertCount] = useState(0);
  useEffect(() => {
    if (!session) { setHistory([]); setHistoryError(''); return; }
    let active = true;
    (async () => { try { const token = await auth.getAccessToken(); if (!token) throw new Error(); const response = await fetch('/api/history', { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error(); const data = await response.json(); if (active) { setHistory(data.items); setHistoryError(''); } } catch { if (active) setHistoryError('History is unavailable. Check the database setup.'); } })();
    return () => { active = false; };
  }, [session?.id]);
  useEffect(() => {
    if (!session) { setAlertCount(0); return; }
    let active = true;
    async function refreshAlerts() {
      try {
        const token = await auth.getAccessToken();
        if (!token) return;
        const response = await fetch('/api/wallets/alerts', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (active) setAlertCount(Array.isArray(data.items) ? data.items.length : 0);
      } catch { /* The account panel shows any setup error. */ }
    }
    refreshAlerts();
    const timer = window.setInterval(refreshAlerts, 60_000);
    window.addEventListener('focus', refreshAlerts);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refreshAlerts); };
  }, [session?.id, tab]);

  async function signIn() {
    if (!configured || !authReady) return;
    setAuthError('');
    try { auth.login(); } catch { setAuthError('Sign-in could not be started.'); }
  }

  async function runScan(event: FormEvent) {
    event.preventDefault(); setError(''); setScan(null); setAiAnswer(''); setAiMeta(''); setAiError('');
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

  async function askAnalyst(event: FormEvent) {
    event.preventDefault();
    if (!scan || !session || aiLoading) return;
    setAiError(''); setAiAnswer(''); setAiMeta(''); setAiLoading(true);
    try {
      const token = await auth.getAccessToken();
      if (!token) throw new Error('Please sign in again.');
      const response = await fetch('/api/insights', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ address: scan.address, question }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI analysis is unavailable.');
      setAiAnswer(data.answer); setAiMeta(`${data.provider} · ${new Date(data.scannedAt).toLocaleString()} · ${data.coverage}`);
    } catch (cause) { setAiError(cause instanceof Error ? cause.message : 'AI analysis is unavailable.'); }
    finally { setAiLoading(false); }
  }

  async function deleteHistory() {
    if (!session) return;
    if (!window.confirm('Delete all saved scan history for this account? This cannot be undone.')) return;
    try { const token = await auth.getAccessToken(); if (!token) throw new Error(); const response = await fetch('/api/history', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error(); setHistory([]); setHistoryError(''); }
    catch { setHistoryError('Could not clear scan history.'); }
  }

  async function exportHistory() {
    if (!session) return;
    try {
      const token = await auth.getAccessToken();
      if (!token) throw new Error();
      const response = await fetch('/api/history?export=1', { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'nottr-scan-history.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setHistoryError('');
    } catch { setHistoryError('Could not export scan history.'); }
  }

  async function signOut() {
    try { await auth.logout(); setScan(null); setAddress(''); setAiAnswer(''); setAiMeta(''); setAiError(''); setTab('overview'); }
    catch { setAuthError('Could not sign out.'); }
  }

  const identityAddress = session?.wallet?.address || session?.email?.address;
  const counterparties = scan ? relationships(scan.address, scan.transactions) : [];
  const signals = scan ? deriveSignals(scan.address, scan.transactions) : [];

  return <div className="terminal-shell">
    <aside className="terminal-sidebar">
      <Link className="brand terminal-brand" href="/"><span className="eye" aria-hidden="true"/> NOTTR</Link>
      <div className="side-caption">WORKSPACE <span>01</span></div>
      <nav className="side-nav" aria-label="Workspace navigation">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><span>◫</span> Overview <b>↗</b></button>
        <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}><span>≋</span> Activity</button>
        <button className={tab === 'account' ? 'active' : ''} onClick={() => setTab('account')}><span>◇</span> Account {alertCount > 0 && <b aria-label={`${alertCount} recent alerts`}>{alertCount}</b>}</button>
      </nav>
      <div className="side-bottom"><span className="pulse"/> ROBINHOOD CHAIN <small>MAINNET · 4663</small></div>
    </aside>
    <div className="terminal-main">
      <header className="terminal-top"><div><Link href="/">NOTTR</Link><span> / </span> {tab === 'overview' ? 'Overview' : tab === 'activity' ? 'Activity' : 'Account'}</div><div className="terminal-top-right"><span className="network-dot"/> ROBINHOOD CHAIN <span className="top-divider"/>{authReady && session ? <button className="top-action" onClick={signOut}>Sign out ↗</button> : <button className="top-action" onClick={signIn} disabled={!configured || !authReady}>{!authReady ? 'Loading…' : 'Sign in ↗'}</button>}</div></header>
      <main className="terminal-content">
        {!configured && <p className="notice" role="status">Sign-in is not configured. Public address scans remain available.</p>}
        {tab === 'account' ? <><div className="terminal-kicker">YOUR ACCOUNT / 03</div><div className="terminal-title"><div><h1>Account<span>.</span></h1><p>Manage your workspace and wallet session.</p></div></div>
          <section className="panel account-panel"><div className="panel-head"><div><span className="panel-index">01 / IDENTITY</span><h2>Sign in</h2></div><span className={`status-pill ${session ? 'is-on' : ''}`}>{session ? 'SIGNED IN' : 'NOT CONNECTED'}</span></div>
            {!authReady ? <p>Checking session…</p> : session ? <><p>You are signed in with Privy. You can save public addresses without linking a wallet. Linking a wallet is optional.</p><div className="account-row"><span>ACCOUNT</span><strong>{identityAddress || 'Authenticated account'}</strong></div><div className="account-actions"><button className="solid-button" onClick={auth.linkWallet}>LINK A WALLET ↗</button><button className="outline-button" onClick={signOut}>SIGN OUT ↗</button></div></> : <><p>Sign in with email or an Ethereum-compatible wallet. Connecting a wallet does not authorize a transaction.</p><button className="solid-button" onClick={signIn} disabled={!configured || !authReady}>{!authReady ? 'LOADING…' : 'SIGN IN ↗'}</button>{!configured && <p className="notice">Sign in is not configured yet.</p>}</>}{authError && <p className="terminal-error" role="alert">{authError}</p>}</section>
          {session && <SavedWallets key={`${session.id}:${session.wallet?.address || ''}`} userId={session.id} getAccessToken={auth.getAccessToken}/>}
          <section className="panel account-panel"><div className="panel-head"><div><span className="panel-index">03 / YOUR DATA</span><h2>Scan history</h2></div></div><p>When signed in, successful scans save the address and time to your account. Results are fetched again when you scan. Paid reports are not available yet.</p>{session && <><div className="account-actions"><button className="outline-button" onClick={exportHistory}>EXPORT SCAN HISTORY ↗</button><button className="outline-button" onClick={deleteHistory}>CLEAR SCAN HISTORY ↗</button></div>{historyError && <p className="terminal-error" role="alert">{historyError}</p>}</>}</section></>
        : <><div className="terminal-kicker">PRIVACY INTELLIGENCE / {tab === 'overview' ? '01' : '02'}</div><div className="terminal-title"><div><h1>{tab === 'overview' ? 'Overview' : 'Activity'}<span>.</span></h1><p>{tab === 'overview' ? 'Your onchain footprint, in focus.' : 'Transactions observed in your current scan.'}</p></div><div className="environment"><span className="pulse"/> PUBLIC DATA <small>ROBINHOOD MAINNET</small></div></div>
          <section className="scan-panel"><div className="scan-copy"><span className="panel-index">START AN INVESTIGATION</span><h2>Look closer.</h2><p>Enter any Robinhood Chain address. No wallet connection required.</p></div><form onSubmit={runScan}><label htmlFor="terminal-address">WALLET ADDRESS</label><div className="terminal-input"><span>⌘</span><input id="terminal-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="0x..." autoComplete="off"/><button disabled={loading || aiLoading}>{loading ? 'SCANNING…' : 'SCAN ADDRESS'} <span>↗</span></button></div>{error && <p className="terminal-error" role="alert">{error}</p>}</form></section>
          {session && tab === 'overview' && <section className="panel account-panel"><div className="panel-head"><div><span className="panel-index">SAVED WALLETS / MONITORING</span><h2>Alerts in your workspace</h2></div><span className="status-pill">{alertCount} RECENT</span></div><p>Review privacy signals, token permissions and any source-backed risk matches for your saved Robinhood Chain addresses.</p><button className="outline-button" onClick={() => setTab('account')}>OPEN SAVED WALLETS & ALERTS ↗</button></section>}
          {session && tab === 'activity' && <section className="panel activity-panel"><div className="panel-head"><div><span className="panel-index">YOUR WORKSPACE / 01</span><h2>Scan history</h2></div></div>{historyError ? <p className="terminal-error">{historyError}</p> : history.length ? <div className="table-wrap"><table><thead><tr><th>ADDRESS</th><th>SCANNED</th><th>ACTION</th></tr></thead><tbody>{history.map(item => <tr key={item.id}><td>{short(item.address)}</td><td>{new Date(item.created_at).toLocaleString()}</td><td><button className="history-action" onClick={() => { setAddress(item.address); document.getElementById('terminal-address')?.focus(); }}>USE ADDRESS ↗</button></td></tr>)}</tbody></table></div> : <p>No saved scans yet.</p>}</section>}
          {scan ? <><div className="scan-meta"><span><i/> SCAN COMPLETE</span><span>ADDRESS / {short(scan.address)}</span><span>SCANNED / {new Date(scan.scannedAt).toLocaleString()}</span><a href={`${scan.source}/address/${scan.address}`} target="_blank" rel="noreferrer">SOURCE ↗</a></div>
            {tab === 'overview' && <><div className="metrics"><article><span>PRIVACY SCORE <b>01</b></span><strong>{scan.score.score ?? "—"}<small> / 100</small></strong><p>Experimental sample-based estimate · v{scan.score.version}</p></article><article><span>OBSERVED RECORDS <b>02</b></span><strong>{scan.transactions.length}{scan.hasMore ? '+' : ''}</strong><p>Records returned by {scan.provider}.</p></article><article><span>COVERAGE <b>03</b></span><strong className="metric-text">Partial</strong><p>{scan.coverage}</p></article></div><section className="panel analyst-panel"><div className="panel-head"><div><span className="panel-index">NOTTR ANALYST / AI</span><h2>Look beyond the obvious.</h2></div><span className="status-pill">AI INTERPRETATION</span></div><p>Ask NOTTR to explain the observed signals and suggest practical next steps. A fresh scan is sent to OpenAI when you submit. AI can make mistakes; verify its conclusions against the evidence.</p>{session ? <form onSubmit={askAnalyst}><label htmlFor="analyst-question">YOUR QUESTION</label><textarea id="analyst-question" value={question} onChange={event => setQuestion(event.target.value)} maxLength={500} rows={3} required/><button className="solid-button" disabled={aiLoading}>{aiLoading ? "ANALYZING…" : "ASK NOTTR ↗"}</button></form> : <p className="notice">Sign in to use AI analysis.</p>}{aiError && <p className="terminal-error" role="alert">{aiError}</p>}{aiAnswer && <div className="analyst-answer"><span className="panel-index">NOTTR / ANALYSIS</span><p>{aiAnswer}</p><small>{aiMeta}</small></div>}</section><div className="panel"><div className="panel-head"><div><span className="panel-index">METHODOLOGY / 01</span><h2>Privacy Score</h2></div><span className="status-pill">EXPERIMENTAL · V{scan.score.version}</span></div><p>This provisional score describes only observed connectivity in the returned sample. Higher scores indicate fewer observed exposure signals under these rules. It is not an anonymity guarantee, a measure of personal identity, or an audited risk assessment. Missing data is not zero risk.</p>{scan.score.reason ? <p className="notice">{scan.score.reason}</p> : <div className="connections">{scan.score.factors.map(factor => <div className="signal" key={factor.id}><div><strong>{factor.label}: {factor.observed}</strong><p>{factor.explanation}</p></div><span className="panel-index">−{factor.deduction} POINTS</span></div>)}</div>}</div><div className="panel"><div className="panel-head"><div><span className="panel-index">EVIDENCE / 01</span><h2>Direct connections</h2></div><span className="status-pill">OBSERVED · {counterparties.length}</span></div><p>Derived from the records in this scan. A direct interaction does not establish that two addresses share an owner.</p><ExposureMap address={scan.address} counterparties={counterparties} explorer={scan.source}/>{counterparties.length > 0 && <div className="connections">{counterparties.slice(0, 8).map(item => <div className="connection" key={item.address}><span className="connection-dot"/><a href={`${scan.source}/address/${item.address}`} target="_blank" rel="noreferrer">{short(item.address)} ↗</a><span>{item.interactions} {item.interactions === 1 ? 'record' : 'records'}</span>{item.evidence[0] && <a href={`${scan.source}/tx/${item.evidence[0]}`} target="_blank" rel="noreferrer">EVIDENCE ↗</a>}</div>)}</div>}</div><div className="panel"><div className="panel-head"><div><span className="panel-index">INTERPRETATION / 02</span><h2>What to consider</h2></div><span className="status-pill">DERIVED · PARTIAL DATA</span></div>{signals.length ? <><p>Repeated public interactions can make a relationship easier to notice. Review the source transactions before drawing conclusions.</p><div className="connections">{signals.slice(0, 8).map(signal => <div className="signal" key={signal.id}><div><strong>{signal.label}</strong><p>{short(signal.address)} · {signal.transactionCount} distinct transactions</p><p>{signal.description}</p></div><div className="signal-evidence">{signal.evidence.slice(0, 5).map(hash => <a key={hash} href={`${scan.source}/tx/${hash}`} target="_blank" rel="noreferrer">{short(hash)} ↗</a>)}</div></div>)}</div></> : <p>No repeated transaction counterparties were found in this sample. This does not establish that none exist outside the scanned data.</p>}<p className="notice">For future activity, consider what your transactions and recurring counterparties reveal publicly. Changing your behavior cannot erase past transactions or guarantee privacy.</p></div></>}
            <section className="panel activity-panel"><div className="panel-head"><div><span className="panel-index">ACTIVITY FEED / 01</span><h2>Recent activity</h2></div><a href={`${scan.source}/address/${scan.address}`} target="_blank" rel="noreferrer">OPEN EXPLORER ↗</a></div>{scan.transactions.length ? <div className="table-wrap"><table><thead><tr><th>TRANSACTION</th><th>METHOD</th><th>FROM</th><th>TO</th><th>DATE</th></tr></thead><tbody>{scan.transactions.map(transaction => <tr key={transaction.id}><td><a href={`${scan.source}/tx/${transaction.hash}`} target="_blank" rel="noreferrer">{short(transaction.hash)} ↗</a></td><td>{transaction.method}</td><td>{short(transaction.from)}</td><td>{short(transaction.to)}</td><td>{transaction.timestamp ? new Date(transaction.timestamp).toLocaleDateString() : '—'}</td></tr>)}</tbody></table></div> : <p className="empty-message">No activity was returned for this address.</p>}<p className="notice">{scan.provider}: {scan.coverage}{scan.hasMore && ' Additional activity may be available in the explorer.'}</p></section></>
          : <><div className="metrics"><article><span>PRIVACY SCORE <b>01</b></span><strong>—<small> / 100</small></strong><p>Available after a supported analysis.</p></article><article><span>OBSERVED TRANSACTIONS <b>02</b></span><strong>—</strong><p>Run a scan to see activity.</p></article><article><span>COVERAGE <b>03</b></span><strong className="metric-text">—</strong><p>Data coverage appears with results.</p></article></div><section className="panel empty-panel"><div className="empty-eye"/><span className="panel-index">NO SCAN YET</span><h2>Start with an address.</h2><p>Your workspace will show observed activity and its source here.</p></section></>}
        </>}
        <footer className="terminal-footer"><span>NOTTR / WALLET PRIVACY INTELLIGENCE</span><span>PUBLIC DATA DOES NOT GUARANTEE PRIVACY</span></footer>
      </main>
    </div>
  </div>;
}
