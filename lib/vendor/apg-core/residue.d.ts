import type { DiffFile, Finding } from "./types.js";
/** Truncate to 120 chars and escape control/hidden characters for display. */
export declare function excerpt(text: string, max?: number): string;
export interface ResidueScan {
    findings: Finding[];
    scannedLines: number;
    scannedFiles: number;
}
/** Scan added lines (never context lines) of every diff file. */
export declare function scanResidue(files: DiffFile[]): ResidueScan;
/**
 * Advisory-only injection scan of the PR title + body: the PR description is
 * the classic surface for instructions aimed at AI reviewers. Findings are
 * always warnings (never gate the exit code) because honest bodies can quote
 * such text while discussing it.
 */
export declare function scanBody(title: string, body: string): Finding[];
export interface GitleaksResult {
    status: "ran" | "skipped" | "error";
    detail?: string;
    findings: Finding[];
}
/**
 * We do not build a secrets scanner. When gitleaks is on the PATH we shell out
 * to it against the patch text; every result is advisory (severity warn) and
 * any wrapper problem is reported, never fatal. When gitleaks is absent the
 * pillar reports "skipped".
 */
export declare function gitleaksScan(diffText: string): GitleaksResult;
