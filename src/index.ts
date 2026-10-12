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
import { existsSync } from 'node:fs';
import { extractWriteIntent } from './extract.js';
import { appendRecord, sha256 } from './ledger.js';
import { checkScope, type ScopePolicy } from './scope.js';
import { loadConfig } from './vendor/apg-core/policy.js';
import { scanResidue } from './vendor/apg-core/residue.js';
import type { DiffFile } from './vendor/apg-core/types.js';
export const name = 'dsh-pr-gate';

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

export const Config: Schema<Config> = Schema.object({
  tools: Schema.array(Schema.string())
    .default(['write', 'edit', 'str_replace_editor'])
    .description('file tools to gate'),
  allow: Schema.array(Schema.string()).default([]).description('allowlist globs; non-empty means only these paths may be written'),
  deny: Schema.array(Schema.string()).default([]).description('denylist globs; always wins over allow'),
  policyFile: Schema.string().default('').description('optional agent-pr-gate.yaml to reuse the CI policy live'),
  residueMode: Schema.union(['warn', 'block']).default('warn').description('residue findings: warn or block'),
  ledgerPath: Schema.string().default('.dsh-pr-gate/session.jsonl').description('JSONL ledger path; empty disables'),
});

// Harness surface restated so the plugin typechecks standalone; identical
// declarations merge cleanly inside the source checkout.
interface ToolExecView {
  readonly name: string;
  readonly arguments: unknown;
  readonly agent?: unknown;
}

interface ToolResultView {
  readonly isError: boolean;
  readonly content: { type: string } & Record<string, unknown>[];
}

type PreToolDecisionView =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string; info?: { name: string; code: string } };

type PostToolDecisionView =
  | { kind: 'accept'; content?: unknown; additionalContexts?: unknown }
  | { kind: 'block'; feedback: unknown };

declare module '@deepseek-ai/cordis' {
  interface Events {
    'tools/pre-execute': (
      exec: ToolExecView,
      next: () => Promise<PreToolDecisionView>,
    ) => Promise<PreToolDecisionView>;
    'tools/post-execute': (
      exec: ToolExecView,
      result: Readonly<ToolResultView>,
      next: () => Promise<PostToolDecisionView>,
    ) => Promise<PostToolDecisionView>;
  }
}

function diffFileOf(path: string, writtenText: string): DiffFile {
  const lines = writtenText.split('\n');
  return {
    path,
    status: 'modified',
    added: lines.map((text, i) => ({ number: i + 1, text })),
    additions: lines.length,
    deletions: 0,
    binary: false,
  };
}

/** Union the inline policy with every entry of an agent-pr-gate.yaml, if any. */
export function resolvePolicy(config: Config): ScopePolicy {
  const allow = [...config.allow];
  const deny = [...config.deny];
  if (config.policyFile !== '') {
    if (!existsSync(config.policyFile)) {
      throw new Error(`dsh-pr-gate: policyFile '${config.policyFile}' does not exist`);
    }
    const { config: gateConfig } = loadConfig(config.policyFile);
    for (const entry of Object.values(gateConfig.policies)) {
      allow.push(...(entry.allow ?? []));
      deny.push(...(entry.deny ?? []));
    }
  }
  const policy: ScopePolicy = {};
  if (allow.length > 0) policy.allow = [...new Set(allow)];
  if (deny.length > 0) policy.deny = [...new Set(deny)];
  return policy;
}

export function apply(ctx: Context, config: Config) {
  const gated = new Set(config.tools);
  const policy = resolvePolicy(config);
  const cwd = process.cwd();
  console.log(
    `[dsh-pr-gate] active: gating [${[...gated].join(', ')}], ` +
      `allow=${policy.allow?.length ?? 0} deny=${policy.deny?.length ?? 0} pattern(s), ` +
      `residue=${config.residueMode}, ledger=${config.ledgerPath === '' ? 'off' : config.ledgerPath}`,
  );

  async function ledger(record: Parameters<typeof appendRecord>[1]): Promise<void> {
    if (config.ledgerPath === '') return;
    try {
      await appendRecord(config.ledgerPath, record);
    } catch (err) {
      console.warn(`[dsh-pr-gate] ledger append failed: ${String(err)}`);
    }
  }

  ctx.on('tools/pre-execute', async (exec, next) => {
    if (!gated.has(exec.name)) return next();
    const intent = extractWriteIntent(exec.name, exec.arguments, cwd);
    if (intent === null) return next();

    const verdict = checkScope(intent.path, policy);
    if (verdict.kind === 'allowed') return next();

    console.warn(`[dsh-pr-gate] denied ${exec.name} -> ${intent.path}: ${verdict.reason}`);
    void ledger({
      time: new Date().toISOString(),
      tool: exec.name,
      action: 'denied',
      path: intent.path,
      matchedBy: verdict.matchedBy,
    });
    return {
      kind: 'deny',
      reason: `dsh-pr-gate: ${verdict.reason}. The session's write policy does not cover '${intent.path}'.`,
      info: { name: 'dsh-pr-gate', code: 'OUT_OF_SCOPE' },
    };
  });

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next();
    if (decision.kind !== 'accept') return decision;
    if (result.isError) return decision;
    if (!gated.has(exec.name)) return decision;

    const intent = extractWriteIntent(exec.name, exec.arguments, cwd);
    if (intent === null || intent.writtenText === undefined) return decision;

    const scan = scanResidue([diffFileOf(intent.path, intent.writtenText)]);
    const kinds = scan.findings.map((f) => f.kind);
    const hash = sha256(intent.writtenText);

    if (kinds.length > 0) {
      console.warn(`[dsh-pr-gate] residue in ${intent.path}: ${kinds.join(', ')}`);
      void ledger({
        time: new Date().toISOString(),
        tool: exec.name,
        action: 'written',
        path: intent.path,
        contentSha256: hash,
        residueKinds: kinds,
      });
      if (config.residueMode === 'block') {
        return {
          kind: 'block',
          feedback: [
            {
              type: 'text',
              text:
                `[dsh-pr-gate] The write was recorded but its content carries residue markers ` +
                `(${kinds.join(', ')}) that the deterministic gate refuses to ship. ` +
                `Remove the markers and write again.`,
            },
          ],
        };
      }
      return decision;
    }

    void ledger({
      time: new Date().toISOString(),
      tool: exec.name,
      action: 'written',
      path: intent.path,
      contentSha256: hash,
    });
    return decision;
  });
}
