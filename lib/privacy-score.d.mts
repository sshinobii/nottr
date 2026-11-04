export type ScoreFactor = {id:string;label:string;observed:number;deduction:number;explanation:string};
export type PrivacyScore = {score:number|null;version:string;observedTransactions:number;factors:ScoreFactor[];reason:string|null};
export function privacyScore(address:string, records:{from?:string;to?:string;hash:string}[]):PrivacyScore;
