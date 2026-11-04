export function monitoringObservations(address: string, transactions: { from?: string; to?: string; hash: string }[]): { address: string; hash: string }[];
export function meetsHolderThreshold(balanceHex: string, decimalsHex: string): boolean;
export function approvalPairs(logs: any[]): { token: string; spender: string; transaction: string }[];
