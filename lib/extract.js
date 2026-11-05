/**
 * Pure extraction: which path does this tool call write, and what text does
 * it write? Covers the first-party file tools; unknown shapes return null and
 * pass through untouched (fail-open for coverage, the scope gate stays loud).
 */
import { isAbsolute, relative, resolve, sep } from 'node:path';
const PATH_KEYS = ['file_path', 'path', 'filePath'];
const TEXT_KEYS = ['content', 'new_string', 'newText', 'new_text'];
function firstString(args, keys) {
    for (const key of keys) {
        const v = args[key];
        if (typeof v === 'string' && v.length > 0)
            return v;
    }
    return undefined;
}
export function toPosix(p) {
    return p.split(sep).join('/');
}
/**
 * A path is judged by its RESOLVED target relative to `root` (T04): textual
 * traversal like `src/../.github/workflows/x.yml` is judged by where it
 * actually lands (.github/workflows/x.yml), not by its `src/` prefix. Paths
 * outside `root` stay absolute so absolute-path policies keep working.
 * Symlinks are NOT followed here (pure string/path math, no fs) — documented
 * limitation; the host's own permissions remain the hard boundary.
 */
export function matchPath(rawPath, root) {
    const posix = toPosix(rawPath);
    const resolved = toPosix(resolve(root, posix));
    const rel = relative(toPosix(root), resolved);
    if (rel && !rel.startsWith('..') && !isAbsolute(rel))
        return toPosix(rel);
    return resolved;
}
export function extractWriteIntent(toolName, args, cwd) {
    if (typeof args !== 'object' || args === null)
        return null;
    const record = args;
    const rawPath = firstString(record, PATH_KEYS);
    if (rawPath === undefined)
        return null;
    const intent = { path: matchPath(rawPath, cwd) };
    const text = firstString(record, TEXT_KEYS);
    if (text !== undefined)
        intent.writtenText = text;
    return intent;
}
