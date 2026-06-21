/**
 * @file Shared investigation-lead status vocabulary.
 *
 * Two item models track an investigation lead's status with historically
 * divergent vocabularies:
 *
 * - {@link ../item/lead.ts LeadData} — `state`: `active | pursued | dead-end`.
 * - {@link ../item/journal-entry.ts JournalEntryItemData} — `leadStatus`:
 *   `active | pursued | resolved | deadEnd`.
 *
 * This module is the single source of truth for those choice arrays plus the
 * shared label / icon lookup so the vocabulary cannot drift between the two at
 * the code level. The two stored field choice-sets are intentionally kept
 * distinct (changing them is a stored-data migration, out of scope here) — but
 * they now reference named consts here rather than inline string arrays, and
 * the shared label/icon maps cover both spellings of the terminal "dead end"
 * state (`dead-end` and `deadEnd`), which are the same semantic state.
 *
 * NOTE (maintainer decision still open): `JournalEntryItemData` carries a
 * fourth `resolved` state with no equivalent in `LeadData`, and `LeadData`'s
 * `isResolved` treats `dead-end` as resolved — which conflicts with the
 * journal's meaning of `resolved` ("the lead paid off"). Collapsing the two
 * vocabularies to one set requires a value/semantic decision + a stored-data
 * migration, deliberately NOT done here.
 */

/** {@link LeadData} state vocabulary (the three-state model). */
export type LeadState = 'active' | 'pursued' | 'dead-end';

/**
 * {@link JournalEntryItemData} lead status vocabulary (the four-state model).
 * - `active`: the lead is open and worth pursuing.
 * - `pursued`: acolytes are currently working it.
 * - `resolved`: the lead paid off and is closed.
 * - `deadEnd`: the lead was investigated and yielded nothing.
 */
export type LeadStatus = 'active' | 'pursued' | 'resolved' | 'deadEnd';

/** Canonical choices for `LeadData.state`. */
export const LEAD_STATE_CHOICES: readonly LeadState[] = ['active', 'pursued', 'dead-end'];

/** Canonical choices for `JournalEntryItemData.leadStatus`. */
export const JOURNAL_LEAD_STATUS_CHOICES: readonly LeadStatus[] = ['active', 'pursued', 'resolved', 'deadEnd'];

/**
 * Localization keys for every lead status string across BOTH vocabularies.
 * Both spellings of the terminal state (`dead-end`, `deadEnd`) map to the same
 * existing `WH40K.Lead.State.DeadEnd` key. `resolved` reuses the same key
 * (it is the journal's terminal/closed state) until a dedicated key exists.
 */
export const LEAD_STATUS_LABEL_KEYS: Record<string, string> = {
    'active': 'WH40K.Lead.State.Active',
    'pursued': 'WH40K.Lead.State.Pursued',
    'dead-end': 'WH40K.Lead.State.DeadEnd',
    'deadEnd': 'WH40K.Lead.State.DeadEnd',
    'resolved': 'WH40K.Lead.State.DeadEnd',
};

/** Font Awesome icon class for every lead status string across both vocabularies. */
export const LEAD_STATUS_ICONS: Record<string, string> = {
    'active': 'fa-magnifying-glass',
    'pursued': 'fa-route',
    'dead-end': 'fa-ban',
    'deadEnd': 'fa-ban',
    'resolved': 'fa-circle-check',
};
