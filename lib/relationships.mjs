/** Summarize observed direct interactions; this does not infer ownership. */
export function relationships(address, transactions) {
  const subject = address.toLowerCase();
  const matches = new Map();
  for (const tx of transactions) {
    const from = tx.from?.toLowerCase();
    const to = tx.to?.toLowerCase();
    if (from !== subject && to !== subject) continue;
    const other = from === subject ? to : from;
    if (!other || other === subject || !/^0x[a-f0-9]{40}$/.test(other)) continue;
    const entry = matches.get(other) || { address: other, interactions: 0, evidence: [] };
    entry.interactions++;
    if (tx.hash && !entry.evidence.includes(tx.hash)) entry.evidence.push(tx.hash);
    matches.set(other, entry);
  }
  return [...matches.values()].sort((a, b) => b.interactions - a.interactions || a.address.localeCompare(b.address));
}
