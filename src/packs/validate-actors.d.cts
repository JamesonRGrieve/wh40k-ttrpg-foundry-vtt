/**
 * Type declarations for `validate-actors.cjs`.
 *
 * The completeness validator is authored as node-runnable CommonJS so the pack
 * tooling and the ratchet can require it directly; this hand-written `.d.cts`
 * gives the consuming `.ts` test full types under `tsconfig.test.json` without
 * pulling the script into `allowJs`. Same arrangement as `validate-schema.d.cts`.
 */

/** One completeness issue: which rule, which file, and the specifics. */
export interface ActorWarning {
    rule: string;
    file: string;
    detail: string;
}

/** packName -> set of every `_id` authored in that pack's `_source`. */
export type IdIndex = Record<string, Set<string>>;

/** Options for a whole-tree actor-completeness run. */
export interface ValidateActorPacksOptions {
    /** Packs root to walk; defaults to the validator's own directory. */
    rootDir?: string;
    /** List offending files under each rule. */
    verbose?: boolean;
    /** Output sink; defaults to stdout. */
    log?: (msg: string) => void;
}

/** Result of a whole-tree run. */
export interface ActorValidationResult {
    filesScanned: number;
    filesWithWarnings: number;
    warnings: ActorWarning[];
    byRule: Record<string, number>;
    softRules: string[];
}

/** Validate one parsed actor doc, pushing any completeness issues onto `warnings`. */
export function validateActor(doc: unknown, relFile: string, index: IdIndex, warnings: ActorWarning[]): void;

/** Walk every pack `_source` tree and return `{ packName -> Set(_id) }`. */
export function buildIdIndex(rootDir: string): IdIndex;

/** True for a bare `npc` or any `<line>-npc` type. */
export function isNpcFamily(type: unknown): boolean;

/** Split a prose talents/traits line into candidate ability names (Size excluded). */
export function splitProseAbilities(line: unknown): string[];

/** Walk the actor packs and collect completeness issues. */
export function validateActorPacks(opts?: ValidateActorPacksOptions): ActorValidationResult;

/** Rules that are soft/review-grade (reported, not gated by the ratchet). */
export const SOFT_RULES: Set<string>;
