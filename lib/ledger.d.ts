export type LedgerAction = 'written' | 'denied';
export interface LedgerRecord {
    time: string;
    tool: string;
    action: LedgerAction;
    path: string;
    /** sha256 of the written text — 'denied' records never carry content. */
    contentSha256?: string;
    matchedBy?: string;
    residueKinds?: string[];
}
export declare function sha256(text: string): string;
export declare function toLine(record: LedgerRecord): string;
export declare function parseLine(line: string): LedgerRecord;
export declare function appendRecord(ledgerPath: string, record: LedgerRecord): Promise<void>;
