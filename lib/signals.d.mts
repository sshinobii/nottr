export type Signal = { id: string; label: string; address: string; transactionCount: number; evidence: string[]; description: string };
export function deriveSignals(address: string, records: {from?:string;to?:string;hash:string}[]): Signal[];
