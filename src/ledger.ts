/**
 * Durable write ledger: one JSONL line per gated write decision, fixed field
 * order, content-hashed. The CI gate (agent-pr-gate) can consume this file as
 * the session-side record of what the agent wrote and what was refused.
 */
import { createHash } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

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

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function toLine(record: LedgerRecord): string {
  return JSON.stringify(record);
}

export function parseLine(line: string): LedgerRecord {
  return JSON.parse(line) as LedgerRecord;
}

export async function appendRecord(ledgerPath: string, record: LedgerRecord): Promise<void> {
  await mkdir(dirname(ledgerPath), { recursive: true });
  await appendFile(ledgerPath, toLine(record) + '\n', 'utf8');
}
