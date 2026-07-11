/**
 * Cogitator Terminal — record model & pure presentation logic.
 *
 * The terminal is a **content-agnostic** reader: it renders a curated set of
 * Foundry Items (any type that carries a description) as permission-gated,
 * cross-linked "records", the way an in-fiction data-terminal / cogitator lists
 * files. It hard-codes no game content — the GM (or an importer) decides which
 * Items belong to a given terminal by grouping them (a Folder or an explicit
 * UUID list); this module turns the resolved Item surface into the index and
 * body the UI draws.
 *
 * Everything here is pure and framework-free so it unit-tests without Foundry:
 * the {@link CogitatorTerminal} Application maps live Documents onto
 * {@link CogitatorRecordItem} (reading `system.description.value` for the body
 * and `Document#testUserPermission` for `accessible`) and defers all decisions
 * to these functions.
 */

/**
 * Ownership level a user must hold on a record Item to read it, mirroring
 * Foundry's `CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER`. A record the viewer
 * lacks this on is listed but shown REDACTED — the "the file exists, you are not
 * cleared for it" beat — rather than silently hidden (see {@link buildTerminalIndex}
 * `hideRestricted`). Kept as a local constant so this module needs no Foundry import.
 */
export const RECORD_ACCESS_LEVEL = 2;

/**
 * Minimal Item surface the terminal reads. Structural (not the concrete
 * `WH40KItem`) so this logic stays framework-free and unit-testable; a real
 * Item satisfies it. `accessible` is precomputed by the Application from
 * `Document#testUserPermission(user, RECORD_ACCESS_LEVEL)`.
 */
export interface CogitatorRecordItem {
    /** Stable id used for in-terminal selection (`data-record-id`). */
    readonly id: string;
    /** Foundry UUID — the key cross-links resolve against for in-terminal navigation. */
    readonly uuid: string;
    /** Display name / record title. */
    readonly name: string;
    /** Record body HTML (`system.description.value`), pre-enrichment. */
    readonly body: string;
    /** Foundry sort weight; ties break by name. */
    readonly sort: number;
    /** True when the viewing user may read this record (OBSERVER+). */
    readonly accessible: boolean;
}

/** One row in the terminal's record index. */
export interface TerminalIndexEntry {
    readonly id: string;
    readonly uuid: string;
    /** The record name when accessible, or a redacted placeholder label when not. */
    readonly label: string;
    readonly accessible: boolean;
    /** True for the currently-open record. */
    readonly active: boolean;
}

/** Options controlling how the index is built. */
export interface BuildIndexOptions {
    /** UUID of the currently-open record (marks `active`), or null for the landing screen. */
    readonly activeUuid: string | null;
    /** Localized placeholder shown for records the viewer cannot read (e.g. "▓ RESTRICTED ▓"). */
    readonly restrictedLabel: string;
    /**
     * When true, records the viewer cannot read are omitted from the index
     * entirely instead of listed as REDACTED. Default (false) lists them, so
     * players can see a locked record exists.
     */
    readonly hideRestricted?: boolean;
}

/** Sort records by Foundry `sort` weight, then name (locale-aware, stable). */
function bySortThenName(a: CogitatorRecordItem, b: CogitatorRecordItem): number {
    if (a.sort !== b.sort) return a.sort - b.sort;
    return a.name.localeCompare(b.name);
}

/**
 * Build the ordered, permission-aware record index the terminal draws down its
 * left rail. Restricted records surface as a redacted placeholder unless
 * `hideRestricted` drops them.
 */
export function buildTerminalIndex(records: readonly CogitatorRecordItem[], options: BuildIndexOptions): TerminalIndexEntry[] {
    const visible = options.hideRestricted === true ? records.filter((r) => r.accessible) : records;
    return [...visible].sort(bySortThenName).map((r) => ({
        id: r.id,
        uuid: r.uuid,
        label: r.accessible ? r.name : options.restrictedLabel,
        accessible: r.accessible,
        active: r.uuid === options.activeUuid,
    }));
}

/** Find a record by its terminal id. */
export function findRecordById(records: readonly CogitatorRecordItem[], id: string): CogitatorRecordItem | undefined {
    return records.find((r) => r.id === id);
}

/**
 * Whether a clicked cross-link target UUID belongs to this terminal's record
 * set. True → the terminal navigates to it in-place (hypertext page turn);
 * false → the link falls through to Foundry's default handler (opens the sheet).
 */
export function isInternalRecord(uuid: string, recordUuids: readonly string[]): boolean {
    return recordUuids.includes(uuid);
}

/** The view state for the body pane, derived from the active record (or null for the landing screen). */
export interface ActiveRecordView {
    readonly name: string;
    /** Raw body HTML to enrich, or null when the record is restricted (→ show REDACTED). */
    readonly body: string | null;
    readonly accessible: boolean;
}

/**
 * Resolve which record body the terminal should show. Returns null for the
 * landing/boot screen (no active record), a `{ body: null }` view for a
 * restricted record (the caller renders the REDACTED notice), or the record's
 * raw body for the caller to enrich.
 */
export function resolveActiveRecord(records: readonly CogitatorRecordItem[], activeUuid: string | null): ActiveRecordView | null {
    if (activeUuid === null) return null;
    const record = records.find((r) => r.uuid === activeUuid);
    if (record === undefined) return null;
    return {
        name: record.name,
        body: record.accessible ? record.body : null,
        accessible: record.accessible,
    };
}
