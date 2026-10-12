/**
 * Pure scope decision: is this path inside the policy? Same semantics as the
 * CI gate — deny always wins; a non-empty allow list means "only these".
 */
import { firstMatch, globMatch } from './vendor/apg-core/policy.js';

export interface ScopePolicy {
  allow?: string[];
  deny?: string[];
}

export type ScopeVerdict =
  | { kind: 'allowed' }
  | { kind: 'denied'; matchedBy: string; reason: string };

export function checkScope(filePath: string, policy: ScopePolicy): ScopeVerdict {
  const denyHit = firstMatch(policy.deny, filePath);
  if (denyHit !== undefined) {
    return {
      kind: 'denied',
      matchedBy: denyHit,
      reason: `path matched deny pattern '${denyHit}'`,
    };
  }
  if (policy.allow !== undefined && policy.allow.length > 0) {
    const allowHit = firstMatch(policy.allow, filePath);
    if (allowHit === undefined) {
      return {
        kind: 'denied',
        matchedBy: '(allowlist)',
        reason: `path outside allowlist (${policy.allow.length} pattern(s))`,
      };
    }
  }
  return { kind: 'allowed' };
}

/** For tests and callers that just need the raw matcher. */
export { globMatch };
