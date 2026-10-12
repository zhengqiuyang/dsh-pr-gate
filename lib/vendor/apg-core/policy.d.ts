import type { DiffFile, PrContext, ScopeCheck } from "./types.js";
export declare class ConfigError extends Error {
}
export interface PolicyEntry {
    allow?: string[];
    deny?: string[];
}
export interface GateConfig {
    agentSignals: {
        actors: string[];
        labels: string[];
    };
    policies: Record<string, PolicyEntry>;
    claims: {
        verify: boolean;
        onMismatch: "fail" | "warn";
        apiPaths?: string[];
    };
    attest: {
        testChecks: string[];
    };
    /** Path the config was loaded from (absent for built-in defaults). */
    source?: string;
}
export declare const DEFAULT_CONFIG_PATHS: string[];
/** Built-in defaults: identical to agent-pr-gate.example.yaml. */
export declare function defaultConfig(): GateConfig;
/** Parse + validate a config object (already YAML-parsed). Throws ConfigError. */
export declare function normalizeConfig(raw: unknown, source?: string): GateConfig;
/**
 * Load config from an explicit path (error if missing/invalid) or from the
 * default search paths (fall back to built-in defaults when none exist).
 * CRLF-tolerant: the YAML parser does not care, and we never split on raw \n.
 */
export declare function loadConfig(explicitPath: string | undefined, cwd?: string): {
    config: GateConfig;
    note?: string;
};
export declare function errMsg(err: unknown): string;
/**
 * Match a diff path against a glob pattern.
 * Supported: `**` (any number of path segments, including zero when leading),
 * `*` (anything but `/`), `?` (one char, not `/`). Everything else literal.
 * Case-sensitive, like POSIX globs. Trailing `/` in a pattern matches a prefix.
 */
export declare function globMatch(pattern: string, filePath: string): boolean;
/** First glob in `patterns` that matches `filePath`, or undefined. */
export declare function firstMatch(patterns: string[] | undefined, filePath: string): string | undefined;
export interface AgentDetection {
    isAgent: boolean;
    reason: string;
}
/**
 * Is this PR agent-authored? OR semantics: any actor substring or any label
 * match counts. `force` (--force-agent) short-circuits to yes.
 */
export declare function detectAgent(pr: PrContext, config: GateConfig, force: boolean): AgentDetection;
export interface PolicyResolution {
    name: string;
    entry: PolicyEntry;
    source: "label" | "path-heuristic" | "default";
    /** Explanation shown in the report (matched label or heuristic counts). */
    detail: string;
}
/**
 * Resolve the policy class for a PR:
 * 1. exact label named after a policy class -> that policy;
 * 2. otherwise the non-default policy whose allow-list matches the most
 *    changed paths (ties broken by config order) -> path heuristic;
 * 3. otherwise `default`.
 * Unknown policy label -> default (deterministic, never an error).
 */
export declare function resolvePolicy(config: GateConfig, pr: PrContext, files: DiffFile[]): PolicyResolution;
/** Check every changed path against the resolved policy. Deny wins over allow. */
export declare function checkScope(entry: PolicyEntry, files: DiffFile[]): ScopeCheck[];
