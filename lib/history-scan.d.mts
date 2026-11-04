export function transactionHistoryPage(address: string, cursor: Record<string, unknown> | null): Promise<{observations: {address: string; hash: string}[]; cursor: Record<string, unknown> | null}>;
