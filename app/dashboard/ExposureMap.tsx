type Counterparty = { address: string; interactions: number; evidence: string[] };

export function ExposureMap({ address, counterparties, explorer }: {address:string;counterparties:Counterparty[];explorer:string}) {
  const visible = counterparties.slice(0, 8);
  if (!visible.length) return <p className="graph-empty">No direct counterparties were found in the returned records.</p>;
  const positions = visible.map((item, i) => {
    const angle = (Math.PI * 2 * i / visible.length) - Math.PI / 2;
    return { ...item, x: 300 + Math.cos(angle) * 205, y: 165 + Math.sin(angle) * 115 };
  });
  return <div className="exposure-map"><svg viewBox="0 0 600 330" role="img" aria-label={`Map of ${visible.length} direct counterparties. Connections reflect observed activity, not common ownership.`}>
    {positions.map(item => <line key={`edge-${item.address}`} x1="300" y1="165" x2={item.x} y2={item.y} className="graph-edge" />)}
    <circle className="graph-halo" cx="300" cy="165" r="37"/><circle className="graph-hub" cx="300" cy="165" r="23"/><text className="graph-hub-label" x="300" y="170" textAnchor="middle">◉</text>
    {positions.map(item => <a key={item.address} href={`${explorer}/address/${item.address}`} target="_blank" rel="noreferrer" aria-label={`View address ${item.address} in Blockscout`}><circle className="graph-node" cx={item.x} cy={item.y} r="12"/><text className="graph-label" x={item.x} y={item.y + 27} textAnchor="middle">{item.address.slice(0,6)}…{item.address.slice(-4)}</text></a>)}
  </svg><div className="graph-key"><span><i/> SCANNED WALLET · {address.slice(0,8)}…{address.slice(-6)}</span><span><i/> DIRECT COUNTERPARTY</span></div>{counterparties.length > visible.length && <p className="notice">Showing {visible.length} of {counterparties.length} observed counterparties.</p>}</div>;
}
