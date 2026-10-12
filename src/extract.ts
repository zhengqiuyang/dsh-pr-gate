/**
 * Pure extraction: which path does this tool call write, and what text does
 * it write? Covers the first-party file tools; unknown shapes return null and
 * pass through untouched (fail-open for coverage, the scope gate stays loud).
 */
import { isAbsolute, relative, sep } from 'node:path';

export interface WriteIntent {
  /** Path as the tool expressed it, posix-normalized for glob matching. */
  path: string;
  /** The text being written (full new content or replacement fragment). */
  writtenText?: string;
}

const PATH_KEYS = ['file_path', 'path', 'filePath'] as const;
const TEXT_KEYS = ['content', 'new_string', 'newText', 'new_text'] as const;

function firstString(args: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const v = args[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

export function toPosix(p: string): string {
  return p.split(sep).join('/');
}

/**
 * A path under `root` is matched relative to it (matching how CI diffs name
 * files); paths outside `root` stay absolute. Both forms are what the glob
 * policy sees, so an absolute-path allowlist keeps working too.
 */
export function matchPath(rawPath: string, root: string): string {
  const posix = toPosix(rawPath);
  if (!isAbsolute(rawPath)) return posix;
  const rel = relative(toPosix(root), posix);
  if (rel && !rel.startsWith('..') && !isAbsolute(rel)) return toPosix(rel);
  return posix;
}

export function extractWriteIntent(
  toolName: string,
  args: unknown,
  cwd: string,
): WriteIntent | null {
  if (typeof args !== 'object' || args === null) return null;
  const record = args as Record<string, unknown>;
  const rawPath = firstString(record, PATH_KEYS);
  if (rawPath === undefined) return null;
  const intent: WriteIntent = { path: matchPath(rawPath, cwd) };
  const text = firstString(record, TEXT_KEYS);
  if (text !== undefined) intent.writtenText = text;
  return intent;
}
