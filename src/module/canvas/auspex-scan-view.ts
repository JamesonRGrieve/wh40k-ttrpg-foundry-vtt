/**
 * @file The GM card's view of an auspex scan (#759): who scanned with what, and each contact.
 *
 * Pure: the translate function is passed in, so the card's context is built the same
 * way in Foundry (`t`) and in stories and tests (the langpack lookup).
 */
import type { ContactKind, ScanContact } from '../rules/auspex-scan.ts';
import type { I18nKey } from '../types/i18n-keys';

/** A translate function: a langpack key and its placeholders to text. */
export type Translate = (key: I18nKey, params?: Record<string, string | number | boolean>) => string;

/** One contact row on the card. */
export type ScanCardRow = {
    name: string;
    kind: ContactKind;
    kindLabel: string;
    distanceLabel: string;
};

/** The card's context. */
export type ScanCardContext = {
    scanLine: string;
    contacts: ScanCardRow[];
};

/** Build the GM card's context: who scanned with what, and each contact, nearest first. */
export function scanCardContext(scannerName: string, itemName: string, contacts: readonly ScanContact[], tr: Translate): ScanCardContext {
    return {
        scanLine: tr('WH40K.Auspex.ScanLine', { actor: scannerName, item: itemName, count: contacts.length }),
        contacts: contacts.map((contact) => ({
            name: contact.name,
            kind: contact.kind,
            kindLabel: tr(contact.kind === 'machine' ? 'WH40K.Auspex.Kind.Machine' : 'WH40K.Auspex.Kind.Life'),
            distanceLabel: tr('WH40K.Auspex.Distance', { metres: contact.distance, bearing: contact.bearing }),
        })),
    };
}
