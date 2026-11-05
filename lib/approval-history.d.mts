export const APPROVAL_TOPIC: string;
export const MAX_LOGS: number;
export function approvalRange(nextBlock: number, window: number, head: number): { from: number; to: number };
export function nextApprovalWindow(window: number, count: number): number;
export function approvalEvents(owner: string, logs: unknown[], from: number, to: number): Array<{ token: string; spender: string; transaction: string; block: number }>;
