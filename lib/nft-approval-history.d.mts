export const APPROVAL_FOR_ALL_TOPIC: string;
export function nftApprovalEvents(owner: string, tokenLogs: unknown[], operatorLogs: unknown[], from: number, to: number): Array<{ collection: string; kind: 'token' | 'operator'; tokenId: string | null; spender: string; transaction: string; block: number }>;
