# dsh-pr-gate

> **If this helps you, please give it a star** — it helps others find it. Thanks!

Deterministic write gate for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) —
**the CI gate moved to the moment of the write.**

Every file the agent writes (`write` / `edit` / `str_replace_editor`) passes
the same scope policy and residue rules that
[agent-pr-gate](https://github.com/zhengqiuyang/agent-pr-gate) applies to PRs
in CI — deny-before-write in `tools/pre-execute`, residue scan of the written
text in `tools/post-execute`, and a durable content-hashed JSONL ledger of
every decision. Zero LLM calls in the trust path: the parts of the gate that
must NOT be an LLM live here.

## Why now (checked 2026-10-12)

The review/guard lane in the dsh ecosystem is entirely LLM-shaped:
answer-reviewer plugins re-read turns with a second model, `dsh-gungnir`
verifies goal completion from exit codes, and the closest action-guard
(`cc-safety-net`, 1.6k★ in the Claude ecosystem) blocks destructive commands.
**Nobody gates what the agent writes deterministically** — scope policy,
residue markers, or a durable record the CI can consume. That slot is empty,
and this plugin is the [agent-pr-gate](https://github.com/zhengqiuyang/agent-pr-gate)
engine living inside the runtime instead of waiting for the PR.

## What it does

| Stage | Hook | Deterministic action |
|---|---|---|
| Before the write | `tools/pre-execute` | Scope policy: deny globs always win; a non-empty allow list means "only these". Denied writes never touch the disk |
| After the write | `tools/post-execute` | Residue scan of the written text: injection text aimed at reviewers, skipped tests, debug markers. `warn` (default) logs + ledgers; `block` also fails the write with corrective feedback |
| Always | JSONL ledger | One line per decision — tool, path, action, `sha256` of content, matched pattern, residue kinds. `agent-pr-gate` CI can consume it as the session-side record |

## One policy, two enforcement points

Point `policyFile` at your repo's `agent-pr-gate.yaml` and the live session
enforces the same allow/deny the CI gate enforces on PRs — all policy entries
are unioned. Inline `allow`/`deny` config works without a file.

## Install

```sh
dsh plugin --profile default add dsh-pr-gate
```

From npm — no build step, no `allowBuilds` authorization; git installs are equally prebuilt (`lib/` ships in the repo).



## Configure

```yaml
- id: dsh-pr-gate
  name: dsh-pr-gate
  config:
    tools: [write, edit, str_replace_editor]
    allow: [src/**, docs/**]     # non-empty = only these
    deny: ["**/*.pem", .github/workflows/**]
    policyFile: ""               # or e.g. agent-pr-gate.yaml
    residueMode: warn            # warn | block
    ledgerPath: .dsh-pr-gate/session.jsonl
```

## Compatibility

- **DSH**: verified against the 0.2.x line (source snapshot 0.2.1-alpha.2); installs on any profile via `dsh plugin add` (prebuilt `lib/`, no build approval).
- **Node**: >= 20 (CI matrix: Node 20/22/24 on Ubuntu and Windows).
- **Disposable-profile evidence (2026-10-19)**: `dsh plugin --profile <fresh> add github:zhengqiuyang/dsh-pr-gate` → installed in 30s; boot shows `[dsh-pr-gate] active: …`; `dsh plugin --profile <fresh> remove dsh-pr-gate` → dependencies cleared, bundles restored.

## Develop

```sh
npm install
npm test   # syncs the vendored agent-pr-gate core, builds, runs unit tests
```

The scope glob semantics and residue rules are vendored from the sibling
`agent-pr-gate` checkout (`npm run sync`; CI runs `sync --check`).

## Roadmap

- `bash` command write-heuristics (redirect/shell-write detection, warn-only)
- Ledger → GitHub check-run bridge (session attestations surfaced in CI)
- Per-policy selection by agent preset, matching the CI gate's policy classes
- Claims-vs-diff at turn end (the agent's final summary vs. the session ledger)

## Kill criteria

If dsh ships first-party deterministic write gating, or reviewer plugins
converge on deterministic enforcement (they are all LLM-based today), this
freezes at its last working version with a postmortem here. The engine stays
owned by agent-pr-gate either way.
