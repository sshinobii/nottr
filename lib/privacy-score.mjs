import { relationships } from './relationships.mjs';

/** v1 is a transparent connectivity heuristic, not a measure of identity or anonymity. */
export function privacyScore(address, records) {
  const parties = relationships(address, records);
  const hashes = new Set(parties.flatMap(item => item.evidence));
  if (hashes.size < 5) return { score: null, version: '1.0.0', observedTransactions: hashes.size, factors: [], reason: 'At least five distinct transactions involving counterparties are needed for this sample-based estimate.' };
  const repeat = parties.filter(item => item.evidence.length >= 2).length;
  const max = Math.max(...parties.map(item => item.evidence.length));
  const connectivity = Math.min(30, parties.length * 3);
  const repetition = Math.min(30, repeat * 5);
  const concentration = Math.min(20, Math.floor(max / hashes.size * 20));
  const factors = [
    { id:'connections', label:'Distinct counterparties', observed:parties.length, deduction:connectivity, explanation:'Three points per observed counterparty, capped at 30.' },
    { id:'repeated', label:'Repeated counterparties', observed:repeat, deduction:repetition, explanation:'Five points per address appearing in at least two distinct transactions, capped at 30.' },
    { id:'concentration', label:'Largest counterparty concentration', observed:max, deduction:concentration, explanation:`Up to 20 points, proportional to the largest counterparty’s ${max} distinct transactions out of ${hashes.size} in the sample.` },
  ];
  return { score:100-connectivity-repetition-concentration, version:'1.0.0', observedTransactions:hashes.size, factors, reason:null };
}
