import { relationships } from './relationships.mjs';

/** Derivations are limited to provided records; one transaction may produce many records. */
export function deriveSignals(address, records) {
  const counterparties = relationships(address, records);
  return counterparties.filter(item => item.evidence.length >= 2).map(item => ({
    id: `repeated:${item.address}`,
    label: 'Repeated direct interaction',
    address: item.address,
    transactionCount: item.evidence.length,
    evidence: item.evidence,
    description: 'At least two distinct transactions in this sample involve this address. A direct interaction does not establish common ownership.',
  }));
}
