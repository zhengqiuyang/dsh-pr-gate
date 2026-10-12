export interface WriteIntent {
    /** Path as the tool expressed it, posix-normalized for glob matching. */
    path: string;
    /** The text being written (full new content or replacement fragment). */
    writtenText?: string;
}
export declare function toPosix(p: string): string;
/**
 * A path under `root` is matched relative to it (matching how CI diffs name
 * files); paths outside `root` stay absolute. Both forms are what the glob
 * policy sees, so an absolute-path allowlist keeps working too.
 */
export declare function matchPath(rawPath: string, root: string): string;
export declare function extractWriteIntent(toolName: string, args: unknown, cwd: string): WriteIntent | null;
