/**
 * Pure extraction: which path does this tool call write, and what text does
 * it write? Covers the first-party file tools; unknown shapes return null and
 * pass through untouched (fail-open for coverage, the scope gate stays loud).
 */
import { isAbsolute, relative, sep } from 'node:path';
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
 * A path under `root` is matched relative to it (matching how CI diffs name
 * files); paths outside `root` stay absolute. Both forms are what the glob
 * policy sees, so an absolute-path allowlist keeps working too.
 */
export function matchPath(rawPath, root) {
    const posix = toPosix(rawPath);
    if (!isAbsolute(rawPath))
        return posix;
    const rel = relative(toPosix(root), posix);
    if (rel && !rel.startsWith('..') && !isAbsolute(rel))
        return toPosix(rel);
    return posix;
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
