/**
 * Type declarations for `validate-adventure-events.cjs` (#592), so the `.ts`
 * tests import the build-time validator with full types under `tsconfig.test.json`.
 */
import type { PackSourceDocument, UuidIndex } from './resolve-adventures.cjs';

/** Required and optional fields per completion-trigger kind. */
export const COMPLETION_TRIGGER_FIELDS: Readonly<Record<string, { readonly required: readonly string[]; readonly optional: readonly string[] }>>;

/** Options every trigger kind may carry. */
export const TRIGGER_OPTION_FIELDS: readonly string[];

/** What a scenario's references resolve against. */
export interface EventGraphContext {
    /** The Adventure's own world-relative UUIDs (see {@link adventureOwnDocuments}). */
    own: ReadonlySet<string>;
    uuidIndex: UuidIndex;
    /** Known condition status ids (see {@link conditionStatusIds}). */
    statuses: ReadonlySet<string>;
}

/** Every condition status id the compiled packs declare, plus core's `dead`. */
export function conditionStatusIds(uuidIndex: UuidIndex): Set<string>;

/** The world-relative UUIDs of an Adventure's own documents once imported. */
export function adventureOwnDocuments(journalEntries: readonly PackSourceDocument[], scenario: PackSourceDocument, uuidIndex: UuidIndex): Set<string>;

/** Validate one scenario's `eventGraph`: the error messages, empty when valid. */
export function validateEventGraph(scenario: PackSourceDocument, ctx: EventGraphContext): string[];

/** Validate the event graph of one Adventure source document. */
export function validateAdventureSource(source: PackSourceDocument, uuidIndex: UuidIndex, statuses: ReadonlySet<string>): string[];

/** Validate every Adventure source under a pack root; each message is prefixed with its source path. */
export function validateAdventurePacks(packsRoot: string, uuidIndex: UuidIndex, resolveSource: (filePath: string) => PackSourceDocument): string[];
