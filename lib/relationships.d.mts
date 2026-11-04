export function relationships(address: string, transactions: {from?: string; to?: string; hash: string}[]): {address: string; interactions: number; evidence: string[]}[];
