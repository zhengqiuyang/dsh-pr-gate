/**
 * Durable write ledger: one JSONL line per gated write decision, fixed field
 * order, content-hashed. The CI gate (agent-pr-gate) can consume this file as
 * the session-side record of what the agent wrote and what was refused.
 */
import { createHash } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
export function sha256(text) {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}
export function toLine(record) {
    return JSON.stringify(record);
}
export function parseLine(line) {
    return JSON.parse(line);
}
export async function appendRecord(ledgerPath, record) {
    await mkdir(dirname(ledgerPath), { recursive: true });
    await appendFile(ledgerPath, toLine(record) + '\n', 'utf8');
}
