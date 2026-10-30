/**
 * Type declarations for the pure scan surface of `scripts/copyright-audit.mjs`.
 *
 * The runtime is a node-runnable `.mjs`; this hand-written `.d.mts` gives the
 * `.ts` unit test (`tests/copyright-audit.test.ts`) full types under
 * `tsconfig.test.json` without pulling the script into `allowJs`.
 */

/** One scan rule: a name and a global regex. */
export interface AuditRule {
    name: string;
    pattern: RegExp;
}

/** One rule hit on one line. */
export interface AuditViolation {
    line: number;
    rule: string;
    match: string;
}

/** The content-agnostic rules. */
export const GENERIC_RULES: readonly AuditRule[];

/** The rules built from the private content's book titles and book-named pack ids. */
export function contentRules(content: { titles?: readonly string[]; packIds?: readonly string[] }): AuditRule[];

/** Every violation in one file's text; `repoDocs` holds the repo's own `.md` basenames. */
export function findViolations(text: string, rules: readonly AuditRule[], repoDocs?: ReadonlySet<string>): AuditViolation[];

/** Whether a tracked path is scanned. */
export function isScanned(path: string): boolean;
