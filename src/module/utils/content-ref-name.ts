/**
 * Display name of a stored content reference (#159, #160, #161).
 *
 * OW sheet slots (regimental drawbacks, regimental awards, a mount) store a
 * Foundry document UUID, and the panels show the document's name. A value that
 * is not a UUID is shown as stored, so free text a player typed (a Comrade's
 * name) reads as written.
 */

/** A Foundry document UUID: a compendium reference or a world document reference. */
const DOCUMENT_UUID = /^(Compendium|Actor|Item|JournalEntry|RollTable|Scene|Macro)\.\S+$/;

/** Whether a stored reference is a Foundry document UUID. */
export function isDocumentUuid(ref: string): boolean {
    return DOCUMENT_UUID.test(ref);
}

/**
 * The name to show for a stored reference: the referenced document's name
 * (through `lookup`, normally `uuidNameCache.getName`) for a UUID, or the
 * value itself otherwise.
 */
export function contentRefName(ref: string, lookup: (uuid: string) => string): string {
    return isDocumentUuid(ref) ? lookup(ref) : ref;
}

/**
 * The name to show for a slot that only ever holds a document reference (a
 * regimental award): the document's name for a UUID, or `unknownLabel` for
 * anything else. Such a slot never shows its raw value, which is an id, not a
 * name (#699: an award stored as "award-cadian-valour" printed that slug).
 */
export function documentRefName(ref: string, lookup: (uuid: string) => string, unknownLabel: string): string {
    return isDocumentUuid(ref) ? lookup(ref) : unknownLabel;
}
