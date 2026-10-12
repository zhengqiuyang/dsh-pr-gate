/**
 * dsh-pr-gate — deterministic write gate for DeepSeek Harness.
 *
 * The CI gate moved to the moment of the write. Every file the agent writes
 * (`write` / `edit` / `str_replace_editor`) passes the same scope policy and
 * residue rules the agent-pr-gate CI gate applies to PRs — deny-before-write
 * in `tools/pre-execute`, residue scan on the written text in
 * `tools/post-execute`, and a durable content-hashed JSONL ledger of every
 * decision. Zero LLM calls in the trust path.
 *
 * Thin adapter: the policy glob semantics and residue rules are vendored
 * from agent-pr-gate (`npm run sync`); this file only bridges Cordis
 * <-> decisions.
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { type ScopePolicy } from './scope.js';
export declare const name = "dsh-pr-gate";
export interface Config {
    /** File tools to gate. */
    tools: string[];
    /** Allowlist globs (posix). Non-empty means "only these". */
    allow: string[];
    /** Denylist globs. Always wins over allow. */
    deny: string[];
    /**
     * Optional agent-pr-gate.yaml — reuse the CI policy in the live session.
     * All policy entries' allow/deny are unioned with the inline lists.
     */
    policyFile: string;
    /** Residue findings: 'warn' logs + ledgers, 'block' also fails the write. */
    residueMode: 'warn' | 'block';
    /** JSONL ledger path; empty string disables the ledger. */
    ledgerPath: string;
}
export declare const Config: Schema<Config>;
interface ToolExecView {
    readonly name: string;
    readonly arguments: unknown;
    readonly agent?: unknown;
}
interface ToolResultView {
    readonly isError: boolean;
    readonly content: {
        type: string;
    } & Record<string, unknown>[];
}
type PreToolDecisionView = {
    kind: 'allow';
} | {
    kind: 'deny';
    reason: string;
    info?: {
        name: string;
        code: string;
    };
};
type PostToolDecisionView = {
    kind: 'accept';
    content?: unknown;
    additionalContexts?: unknown;
} | {
    kind: 'block';
    feedback: unknown;
};
declare module '@deepseek-ai/cordis' {
    interface Events {
        'tools/pre-execute': (exec: ToolExecView, next: () => Promise<PreToolDecisionView>) => Promise<PreToolDecisionView>;
        'tools/post-execute': (exec: ToolExecView, result: Readonly<ToolResultView>, next: () => Promise<PostToolDecisionView>) => Promise<PostToolDecisionView>;
    }
}
/** Union the inline policy with every entry of an agent-pr-gate.yaml, if any. */
export declare function resolvePolicy(config: Config): ScopePolicy;
export declare function apply(ctx: Context, config: Config): void;
export {};
