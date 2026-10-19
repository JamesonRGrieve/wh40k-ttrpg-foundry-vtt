/**
 * Dark Pacts (DH2 Enemies Beyond pp. 72–76, #84).
 *
 * A pact is a compendium `darkPact` item: the Boons a Daemon may grant, the
 * Banes that come with them, and the terms of striking it. A character's
 * struck pacts live on `system.pacts`, one {@link PactRecord} each, holding
 * which Boons and Banes this bargain carries, the Daemon's Disposition and the
 * pact's bookkeeping. Everything specific to a pact is read from its item;
 * this module holds only the content-agnostic plumbing.
 *
 * The rules it applies, from the book:
 * - "A Daemon's Disposition begins at 15+ the character's Corruption total"
 *   (p. 73). Disposition is the core NPC characteristic on a 0–100 scale (core
 *   p. 277). The 15 and the Corruption term are each pact's `negotiation` data.
 * - "a character who makes a Dark Pact gains 2d10+10 Corruption points"
 *   (p. 76): each pact's `corruptionFormula`.
 * - The GM chooses which Boons and Banes a bargain carries (p. 73). A taken
 *   entry with mechanics (`modifiers`, `grants`) is applied to the actor through
 *   the central paths: an ActiveEffect built by `modifiersToEffectChanges` and
 *   compendium items the actor owns.
 * - The Subtlety change "should be tailored to the individual bargain" (p. 76):
 *   no number is printed, so discovery only records the fact.
 */

import { SYSTEM_ID } from '../constants.ts';
import { type EffectChange, modifiersToEffectChanges } from './condition-registry.ts';
import { clampDisposition, DISPOSITION_MODELS } from './disposition.ts';

/** An item a Boon or Bane grants: a compendium talent / trait, with its specialization and level. */
export interface DarkPactGrant {
    uuid: string;
    specialization: string;
    level: number | null;
}

/** A Boon or Bane as its pact item authors it. */
export interface DarkPactEntry {
    identifier: string;
    name: string;
    description: string;
    /** A ModifiersTemplate-shaped block: `characteristics` / `skills` / `combat` maps. */
    modifiers: { characteristics?: Record<string, number>; skills?: Record<string, number>; combat?: Record<string, number> };
    grants: DarkPactGrant[];
}

/** The terms of striking a pact. */
export interface DarkPactTerms {
    dispositionBase: number;
    addsCorruption: boolean;
    testModifier: number;
}

/** The two kinds of pact entry. */
export const PACT_ENTRY_KINDS = ['boons', 'banes'] as const;

/** `boons` or `banes`. */
export type PactEntryKind = (typeof PACT_ENTRY_KINDS)[number];

/** A pact a character has struck (`system.pacts[]`). */
export interface PactRecord {
    pactUuid: string;
    discovered: boolean;
    /** The Daemon's Disposition toward the character (core p. 277, 0–100). */
    disposition: number;
    paymentCurrent: boolean;
    /** Identifiers of the Boons this bargain carries. */
    boons: string[];
    /** Identifiers of the Banes this bargain carries. */
    banes: string[];
}

/** A Daemon's Disposition is the DH2 characteristic Disposition, on its 0–100 scale (core p. 277, #73). */
const DAEMON_DISPOSITION = DISPOSITION_MODELS.characteristic;

/** The Daemon's starting Disposition: the pact's base, plus the character's Corruption when the terms add it. */
export function startingDaemonDisposition(terms: DarkPactTerms, corruption: number): number {
    return clampDisposition(terms.dispositionBase + (terms.addsCorruption ? Math.max(0, Math.trunc(corruption)) : 0), DAEMON_DISPOSITION);
}

/** Shift a Daemon's Disposition, kept on the 0–100 scale. */
export function adjustPactDisposition(current: number, delta: number): number {
    return clampDisposition(current + Math.trunc(delta), DAEMON_DISPOSITION);
}

/** A newly struck pact: no Boons or Banes chosen yet, payment current, undiscovered. */
export function newPactRecord(pactUuid: string, terms: DarkPactTerms, corruption: number): PactRecord {
    return { pactUuid, discovered: false, disposition: startingDaemonDisposition(terms, corruption), paymentCurrent: true, boons: [], banes: [] };
}

/** Whether a character already holds this pact. */
export function holdsPact(records: readonly PactRecord[], pactUuid: string): boolean {
    return records.some((record) => record.pactUuid === pactUuid);
}

/** A pact's entries of one kind, split into those this bargain carries and those still on offer. */
export function pactEntryChoices(entries: readonly DarkPactEntry[], chosen: readonly string[]): { taken: DarkPactEntry[]; available: DarkPactEntry[] } {
    const taken = entries.filter((entry) => chosen.includes(entry.identifier));
    const available = entries.filter((entry) => !chosen.includes(entry.identifier));
    return { taken, available };
}

/** The record with an entry added to (or, when already taken, removed from) the bargain. */
export function togglePactEntry(record: PactRecord, kind: PactEntryKind, identifier: string): PactRecord {
    const current = record[kind];
    const next = current.includes(identifier) ? current.filter((id) => id !== identifier) : [...current, identifier];
    return { ...record, [kind]: next };
}

/** The flag key (scope `wh40k-rpg`) marking what a pact entry put on the actor. */
export const DARK_PACT_FLAG = 'darkPact';

/** Which pact entry an ActiveEffect or granted item came from. */
export interface PactEntryRef {
    pactUuid: string;
    kind: PactEntryKind;
    entry: string;
}

/** The ActiveEffect a taken entry gives the actor, or `null` when its mechanics are not modifiers. */
export function pactEntryEffectData(
    ref: PactEntryRef,
    entry: DarkPactEntry,
    img: string,
): { name: string; img: string; origin: string; changes: EffectChange[]; flags: Record<string, Record<string, PactEntryRef>> } | null {
    const changes = modifiersToEffectChanges(entry.modifiers);
    if (changes.length === 0) return null;
    return { name: entry.name, img, origin: ref.pactUuid, changes, flags: { [SYSTEM_ID]: { [DARK_PACT_FLAG]: ref } } };
}

/** The pact entry an effect's or item's flags record, or `null`. */
export function pactEntryRefOf(flags: object | null | undefined): PactEntryRef | null {
    if (flags === null || flags === undefined || !(SYSTEM_ID in flags)) return null;
    const scope = flags[SYSTEM_ID];
    if (typeof scope !== 'object' || scope === null || !(DARK_PACT_FLAG in scope)) return null;
    const ref = scope[DARK_PACT_FLAG];
    if (typeof ref !== 'object' || ref === null || !('pactUuid' in ref) || !('kind' in ref) || !('entry' in ref)) return null;
    const { pactUuid, kind, entry } = ref;
    if (typeof pactUuid !== 'string' || typeof entry !== 'string' || (kind !== 'boons' && kind !== 'banes')) return null;
    return { pactUuid, kind, entry };
}

/** Whether flags mark something as coming from the given pact (and, when given, the given entry). */
export function isFromPact(flags: object | null | undefined, pactUuid: string, kind?: PactEntryKind, entry?: string): boolean {
    const ref = pactEntryRefOf(flags);
    if (ref?.pactUuid !== pactUuid) return false;
    if (kind !== undefined && ref.kind !== kind) return false;
    return entry === undefined || ref.entry === entry;
}
