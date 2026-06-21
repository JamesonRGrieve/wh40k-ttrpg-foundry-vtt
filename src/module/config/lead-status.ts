/**
 * @file Shared investigation-lead status vocabulary — the single, extensible
 * registry both lead-bearing item models and the lead sheet derive from.
 *
 * Lives in `config/` (not `data/`) so the sheet layer can read its select
 * options without an `applications/ → data/` layering violation — the same
 * neutral home as {@link ./location-types.ts}.
 *
 * {@link LEAD_STATUSES} is the enum-dict source of truth. Append one entry to
 * add a status: the {@link LeadStatus} union, the field {@link LEAD_STATUS_CHOICES},
 * the sheet {@link leadStatusSelectOptions select options}, and the label / icon /
 * terminal lookups all derive from it, so the vocabulary cannot drift and a new
 * state is a one-line change.
 *
 * Both lead-bearing models share this one four-state set (#361):
 * `active → pursued → resolved | dead-end`.
 *
 * - `LeadData` (`data/item/lead.ts`) — `state`.
 * - `JournalEntryItemData` (`data/item/journal-entry.ts`) — `leadStatus`
 *   (whose `migrateData` normalises the legacy `deadEnd` spelling to the
 *   canonical `dead-end` via {@link normalizeLeadStatus}).
 *
 * `resolved` ("the lead paid off and closed") and `dead-end` ("investigated,
 * yielded nothing") are distinct outcomes but both `terminal` — `terminal` is
 * the data that drives "is this lead closed?", replacing the old hard-coded
 * `state === 'dead-end'` check.
 */

/** One lead-status definition. The {@link LEAD_STATUSES} registry is the SSOT. */
interface LeadStatusDef {
    /** Stable id — the value stored in the document field. */
    readonly id: string;
    /** Localization key for the display label. */
    readonly labelKey: string;
    /** Font Awesome icon class for the state pill. */
    readonly icon: string;
    /** Terminal (closed): the lead is no longer actionable — `resolved` or `dead-end`. */
    readonly terminal: boolean;
}

/**
 * Canonical, ordered lead-status registry. Append an entry to extend the
 * vocabulary everywhere at once. Order is the display order for choices and
 * select options.
 */
export const LEAD_STATUSES = {
    'active': { id: 'active', labelKey: 'WH40K.Lead.State.Active', icon: 'fa-magnifying-glass', terminal: false },
    'pursued': { id: 'pursued', labelKey: 'WH40K.Lead.State.Pursued', icon: 'fa-route', terminal: false },
    'resolved': { id: 'resolved', labelKey: 'WH40K.Lead.State.Resolved', icon: 'fa-circle-check', terminal: true },
    'dead-end': { id: 'dead-end', labelKey: 'WH40K.Lead.State.DeadEnd', icon: 'fa-ban', terminal: true },
} as const satisfies Record<string, LeadStatusDef>;

/** Valid lead-status ids — derived, so a new registry entry extends the union automatically. */
export type LeadStatus = keyof typeof LEAD_STATUSES;

/** Ordered choice list for the document field `choices`, derived from the registry. */
export const LEAD_STATUS_CHOICES: readonly LeadStatus[] = Object.values(LEAD_STATUSES).map((def) => def.id);

/**
 * Legacy stored ids that map onto a canonical registry id. The journal model
 * historically stored the terminal state camel-cased (`deadEnd`); it is
 * normalised to the canonical `dead-end` on load via {@link normalizeLeadStatus}.
 */
const LEAD_STATUS_ALIASES: Record<string, LeadStatus> = {
    deadEnd: 'dead-end',
};

/** Lookup by canonical id (after alias normalisation); `undefined` for unknown ids. */
const STATUS_BY_ID = new Map<string, LeadStatusDef>(Object.values(LEAD_STATUSES).map((def): [string, LeadStatusDef] => [def.id, def]));

/** Normalise a possibly-legacy stored status id to its canonical registry id. */
export function normalizeLeadStatus(id: string): string {
    return LEAD_STATUS_ALIASES[id] ?? id;
}

function leadStatusDef(id: string): LeadStatusDef | undefined {
    return STATUS_BY_ID.get(normalizeLeadStatus(id));
}

/** Localization key for a status id (falls back to the Active label for unknown ids). */
export function leadStatusLabelKey(id: string): string {
    return leadStatusDef(id)?.labelKey ?? 'WH40K.Lead.State.Active';
}

/** Font Awesome icon class for a status id (falls back to a neutral marker for unknown ids). */
export function leadStatusIcon(id: string): string {
    return leadStatusDef(id)?.icon ?? 'fa-circle-question';
}

/** Whether a status id is terminal (the lead is closed): `resolved` or `dead-end`. */
export function isTerminalLeadStatus(id: string): boolean {
    return leadStatusDef(id)?.terminal ?? false;
}

/** Select-option map (`{ id: labelKey }`) for sheet dropdowns, derived from the registry. */
export function leadStatusSelectOptions(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const def of Object.values(LEAD_STATUSES)) {
        out[def.id] = def.labelKey;
    }
    return out;
}
