/**
 * Pillar 2 — residue scan. Deterministic pattern rules over the ADDED lines of
 * the diff (never context lines) plus an advisory gitleaks wrapper. Every rule
 * is a curated regex with a stable kind id; findings carry file/line/excerpt.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
/**
 * Injection-text heuristics: text in the diff (or PR body) that reads like an
 * instruction aimed at an AI reviewer or CI system rather than at humans.
 * Curated for precision — each rule corresponds to a known attack phrasing.
 */
const INJECTION_RULES = [
    {
        kind: "injection-ignore-previous-instructions",
        description: "text instructing an AI to ignore previous/prior instructions",
        re: /ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above)\s+instructions/i,
    },
    {
        kind: "injection-disregard-instructions",
        description: "text instructing an AI to disregard its instructions",
        re: /disregard\s+(?:your\s+|the\s+|all\s+)?(?:system\s+)?instructions/i,
    },
    {
        kind: "injection-reveal-system-prompt",
        description: "text asking an AI to reveal its system prompt",
        re: /(?:reveal|show|print|repeat|output)\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions)/i,
    },
    {
        kind: "injection-addressed-to-reviewer",
        description: "instruction addressed to a reviewer/CI system ('reviewer:', 'CI:', ...)",
        // Anchored at line start after an optional comment marker, so ordinary
        // prose mentioning "CI" mid-sentence does not fire.
        re: /^\s*(?:\/\/+|#+|\*+|<!--|--|;)?\s*(?:note\s+to\s+the\s+(?:automated\s+)?reviewer|reviewer|ci|copilot|coderabbit|github-actions|dependabot)\s*:/i,
    },
];
/** Disabled/skipped test markers. */
const DISABLED_TEST_RULES = [
    {
        kind: "test-skip",
        description: "test skipped via .skip()/.todo()",
        re: /\b(?:it|test|describe|context|suite|t)\.skip\s*\(|\b(?:it|test)\.todo\s*\(/,
    },
    {
        kind: "test-skip-xit",
        description: "test disabled via xit(/xdescribe(/xtest(",
        re: /\bx(?:it|describe|test|context|suite)\s*\(/,
    },
    {
        kind: "test-skip-pytest",
        description: "pytest test skipped via pytest.mark.skip",
        re: /pytest\.mark\.skip(?!\w)/,
    },
    {
        kind: "test-skip-junit",
        description: "JUnit/Java test disabled via @Disabled/@Ignore",
        re: /@(?:Disabled|Ignore)\b/,
    },
    {
        kind: "test-commented-out",
        description: "commented-out test (comment line containing test(/it(/describe()",
        re: /(?:\/\/|#|^\s*\*).*\b(?:it|test|describe)\s*\(/,
    },
    {
        kind: "test-commented-out-python",
        description: "commented-out python test (comment line containing def test_...())",
        re: /#.*\bdef\s+test_\w*\s*\(/,
    },
];
/** Stub / not-actually-implemented markers. */
const STUB_RULES = [
    {
        kind: "stub-todo-implement",
        description: "'TODO: implement' marker",
        re: /\bTODO\b[:\s]+implement/i,
    },
    {
        kind: "stub-not-implemented-js",
        description: "throw new Error('not implemented')",
        re: /throw\s+new\s+\w*Error\s*\(\s*["'`](?:not[ _-]?implemented|unimplemented|todo)/i,
    },
    {
        kind: "stub-not-implemented-classic",
        description: "NotImplementedError / NotImplementedException",
        re: /\bNotImplemented(?:Error|Exception)\b/,
    },
    {
        kind: "stub-pass-todo",
        description: "python 'pass  # TODO' stub body",
        re: /\bpass\s+#\s*TODO\b/i,
    },
];
const ALL_LINE_RULES = [...INJECTION_RULES, ...DISABLED_TEST_RULES, ...STUB_RULES];
/** Hidden characters that can smuggle content past human review. */
const HIDDEN_UNICODE_RANGES = [
    { from: 0x200b, to: 0x200d, label: "zero-width character" },
    { from: 0x202a, to: 0x202e, label: "bidi control character" },
    { from: 0x2066, to: 0x2069, label: "bidi isolate character" },
];
function hiddenUnicodeAt(text) {
    for (let i = 0; i < text.length; i += 1) {
        const code = text.codePointAt(i);
        if (code === undefined)
            continue;
        for (const range of HIDDEN_UNICODE_RANGES) {
            if (code >= range.from && code <= range.to) {
                return { index: i, label: range.label, code };
            }
        }
    }
    return undefined;
}
/** Truncate to 120 chars and escape control/hidden characters for display. */
export function excerpt(text, max = 120) {
    let s = text.trim();
    if (s.length > max)
        s = `${s.slice(0, max - 1)}…`;
    return s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, (ch) => {
        const code = ch.codePointAt(0);
        return code === undefined ? "" : `\\u${code.toString(16).padStart(4, "0")}`;
    });
}
/** Scan added lines (never context lines) of every diff file. */
export function scanResidue(files) {
    const findings = [];
    let scannedLines = 0;
    for (const file of files) {
        for (const added of file.added) {
            scannedLines += 1;
            for (const rule of ALL_LINE_RULES) {
                if (rule.re.test(added.text)) {
                    findings.push({
                        pillar: "residue",
                        kind: `residue/${rule.kind}`,
                        severity: "error",
                        message: rule.description,
                        path: file.path,
                        line: added.number,
                        evidence: excerpt(added.text),
                    });
                }
            }
            const hidden = hiddenUnicodeAt(added.text);
            if (hidden !== undefined) {
                findings.push({
                    pillar: "residue",
                    kind: "residue/hidden-unicode",
                    severity: "error",
                    message: `${hidden.label} U+${hidden.code.toString(16).toUpperCase().padStart(4, "0")} in added line`,
                    path: file.path,
                    line: added.number,
                    evidence: excerpt(added.text),
                });
            }
        }
    }
    const scannedFiles = files.filter((f) => !f.binary).length;
    return { findings, scannedLines, scannedFiles };
}
/**
 * Advisory-only injection scan of the PR title + body: the PR description is
 * the classic surface for instructions aimed at AI reviewers. Findings are
 * always warnings (never gate the exit code) because honest bodies can quote
 * such text while discussing it.
 */
export function scanBody(title, body) {
    const findings = [];
    const lines = `${title}\n${body}`.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
        for (const rule of INJECTION_RULES) {
            if (rule.re.test(lines[i])) {
                findings.push({
                    pillar: "residue",
                    kind: `residue/body/${rule.kind}`,
                    severity: "warn",
                    message: `${rule.description} (PR body, advisory)`,
                    evidence: excerpt(lines[i]),
                });
            }
        }
        const hidden = hiddenUnicodeAt(lines[i]);
        if (hidden !== undefined) {
            findings.push({
                pillar: "residue",
                kind: "residue/body/hidden-unicode",
                severity: "warn",
                message: `${hidden.label} in PR body (advisory)`,
                evidence: excerpt(lines[i]),
            });
        }
    }
    return findings;
}
/**
 * We do not build a secrets scanner. When gitleaks is on the PATH we shell out
 * to it against the patch text; every result is advisory (severity warn) and
 * any wrapper problem is reported, never fatal. When gitleaks is absent the
 * pillar reports "skipped".
 */
export function gitleaksScan(diffText) {
    const exe = findGitleaks();
    if (exe === null) {
        return { status: "skipped", detail: "gitleaks not found on PATH — secret scanning advisory skipped", findings: [] };
    }
    let dir;
    try {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-pr-gate-"));
        const patchFile = path.join(dir, "pr.patch");
        fs.writeFileSync(patchFile, diffText, "utf8");
        const reportFile = path.join(dir, "gitleaks-report.json");
        const res = spawnSync(exe, [
            "detect",
            "--no-git",
            "--redact",
            "--report-format",
            "json",
            "--report-path",
            reportFile,
            "--exit-code",
            "0",
            "--source",
            dir,
        ], { encoding: "utf8", windowsHide: true });
        if (res.error !== undefined) {
            return { status: "error", detail: `gitleaks failed to run: ${res.error.message}`, findings: [] };
        }
        if (!fs.existsSync(reportFile)) {
            const tail = `${res.stderr ?? ""}`.trim().slice(0, 200);
            return { status: "error", detail: `gitleaks produced no report${tail === "" ? "" : `: ${tail}`}`, findings: [] };
        }
        const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
        const findings = report.map((r) => ({
            pillar: "residue",
            kind: `residue/gitleaks${r.RuleID === undefined ? "" : `:${r.RuleID}`}`,
            severity: "warn",
            message: `possible secret (gitleaks advisory: ${r.Description ?? "match"})`,
            path: r.File ?? "pr.patch",
            line: r.StartLine,
            evidence: excerpt(r.Match ?? ""),
        }));
        return { status: "ran", detail: `${findings.length} advisory finding(s)`, findings };
    }
    catch (err) {
        return {
            status: "error",
            detail: `gitleaks wrapper error: ${err instanceof Error ? err.message : String(err)}`,
            findings: [],
        };
    }
    finally {
        if (dir !== undefined) {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
            }
            catch {
                /* best-effort cleanup */
            }
        }
    }
}
/** Find the gitleaks binary without a shell (Windows: try the .exe form too). */
function findGitleaks() {
    for (const exe of ["gitleaks", "gitleaks.exe"]) {
        const probe = spawnSync(exe, ["--version"], { encoding: "utf8", windowsHide: true });
        if (probe.error === undefined)
            return exe;
    }
    return null;
}
