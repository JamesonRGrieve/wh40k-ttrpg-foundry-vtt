/**
 * @file Display models for Dark Pacts (Enemies Beyond pp. 72–76, #84): the pact
 * item sheet and the actor's Dark Pacts panel. Pure, so both are unit-tested
 * without Foundry; the sheet and the panel only hand the result to Handlebars.
 */

import { type DarkPactEntry, type DarkPactTerms, type PactEntryKind, type PactRecord, pactEntryChoices } from '../../rules/dark-pact.ts';
import { capitalize } from '../../utils/format.ts';

/** One mechanical line of an entry: a characteristic change, or a granted item. */
export interface PactEntryMechanicView {
    /** Langpack key of the changed characteristic (absent for a grant). */
    labelKey?: string;
    /** The signed change, e.g. `+5` (absent for a grant). */
    value?: string;
    /** UUID of a granted item, rendered through `uuid-name` (absent for a modifier). */
    grantUuid?: string;
    /** The grant's specialization and level, e.g. `Toughness (2)`. */
    grantDetail?: string;
}

/** A Boon or Bane as displayed. */
export interface PactEntryView {
    identifier: string;
    name: string;
    description: string;
    mechanics: PactEntryMechanicView[];
    /** No mechanics the system applies: the GM adjudicates it from the text. */
    narrative: boolean;
}

function signed(value: number): string {
    return value > 0 ? `+${value}` : String(value);
}

/** The display lines of an entry's mechanics. */
export function pactEntryMechanics(entry: DarkPactEntry): PactEntryMechanicView[] {
    const lines: PactEntryMechanicView[] = [];
    for (const [key, value] of Object.entries(entry.modifiers.characteristics ?? {})) {
        if (value !== 0) lines.push({ labelKey: `WH40K.Characteristic.${capitalize(key)}`, value: signed(value) });
    }
    for (const grant of entry.grants) {
        const level = grant.level === null ? '' : ` (${grant.level})`;
        const detail = `${grant.specialization}${level}`.trim();
        lines.push(detail === '' ? { grantUuid: grant.uuid } : { grantUuid: grant.uuid, grantDetail: detail });
    }
    return lines;
}

/** An entry as displayed. */
export function pactEntryView(entry: DarkPactEntry): PactEntryView {
    const mechanics = pactEntryMechanics(entry);
    return { identifier: entry.identifier, name: entry.name, description: entry.description, mechanics, narrative: mechanics.length === 0 };
}

/** The terms of striking a pact, as displayed. */
interface PactTermsView {
    corruptionFormula: string;
    dispositionBase: number;
    addsCorruption: boolean;
    testModifier: string;
}

/** A pact item's content, as the item sheet shows it. */
export interface DarkPactSheetView {
    terms: PactTermsView;
    boons: PactEntryView[];
    banes: PactEntryView[];
}

/** The pact item sheet's view of a pact. */
export function darkPactSheetView(system: {
    corruptionFormula: string;
    negotiation: DarkPactTerms;
    boons: DarkPactEntry[];
    banes: DarkPactEntry[];
}): DarkPactSheetView {
    return {
        terms: {
            corruptionFormula: system.corruptionFormula,
            dispositionBase: system.negotiation.dispositionBase,
            addsCorruption: system.negotiation.addsCorruption,
            testModifier: signed(system.negotiation.testModifier),
        },
        boons: system.boons.map(pactEntryView),
        banes: system.banes.map(pactEntryView),
    };
}

/** The pact content the panel reads for a struck pact (its compendium item's system), or `null` when it does not resolve. */
export interface PactDefinitionView {
    boons: DarkPactEntry[];
    banes: DarkPactEntry[];
}

/** One struck pact's row on the panel. */
interface DarkPactRowView {
    index: number;
    pactUuid: string;
    disposition: number;
    discovered: boolean;
    paymentCurrent: boolean;
    /** False when the pact item no longer resolves (its row still shows, to be removed). */
    resolved: boolean;
    /** The Boons column, then the Banes column. */
    columns: [DarkPactColumnView, DarkPactColumnView];
}

/** One column of a row: the Boons or Banes this bargain carries, and those still on offer. */
interface DarkPactColumnView {
    kind: PactEntryKind;
    labelKey: string;
    taken: PactEntryView[];
    /** Entries still on offer, for the GM's add controls. */
    available: Array<{ identifier: string; name: string }>;
}

const COLUMN_LABEL_KEYS: Readonly<Record<PactEntryKind, string>> = { boons: 'WH40K.DarkPact.Boons', banes: 'WH40K.DarkPact.Banes' };

/** The Dark Pacts panel. */
export interface DarkPactPanelView {
    /** The panel shows to the GM always (to add a pact), and to anyone once a pact is struck. */
    visible: boolean;
    /** The GM's controls: add / remove pacts, choose Boons and Banes, track Disposition. */
    canEdit: boolean;
    rows: DarkPactRowView[];
}

function column(definition: PactDefinitionView | null, record: PactRecord, kind: PactEntryKind): DarkPactColumnView {
    const labelKey = COLUMN_LABEL_KEYS[kind];
    if (definition === null) return { kind, labelKey, taken: [], available: [] };
    const { taken, available } = pactEntryChoices(definition[kind], record[kind]);
    return { kind, labelKey, taken: taken.map(pactEntryView), available: available.map(({ identifier, name }) => ({ identifier, name })) };
}

/**
 * Build the panel from the actor's struck pacts and their resolved pact items.
 * @param records  `system.pacts`.
 * @param definitions  Each pact item's content by UUID (`null` when it no longer resolves).
 * @param isGM  Whether the viewer is the GM.
 */
export function darkPactPanelView(
    records: readonly PactRecord[],
    definitions: ReadonlyMap<string, PactDefinitionView | null>,
    isGM: boolean,
): DarkPactPanelView {
    const rows = records.map((record, index): DarkPactRowView => {
        const definition = definitions.get(record.pactUuid) ?? null;
        return {
            index,
            pactUuid: record.pactUuid,
            disposition: record.disposition,
            discovered: record.discovered,
            paymentCurrent: record.paymentCurrent,
            resolved: definition !== null,
            columns: [column(definition, record, 'boons'), column(definition, record, 'banes')],
        };
    });
    return { visible: isGM || rows.length > 0, canEdit: isGM, rows };
}
