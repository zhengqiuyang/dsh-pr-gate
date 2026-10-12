/**
 * Pure scope decision: is this path inside the policy? Same semantics as the
 * CI gate — deny always wins; a non-empty allow list means "only these".
 */
import { globMatch } from './vendor/apg-core/policy.js';
export interface ScopePolicy {
    allow?: string[];
    deny?: string[];
}
export type ScopeVerdict = {
    kind: 'allowed';
} | {
    kind: 'denied';
    matchedBy: string;
    reason: string;
};
export declare function checkScope(filePath: string, policy: ScopePolicy): ScopeVerdict;
/** For tests and callers that just need the raw matcher. */
export { globMatch };
