import { describe, expect, it } from 'vitest';
import WH40K from '../config.ts';
import { lineResourceRows } from './acquisition-resources.ts';

/**
 * The Resources panel once showed DH2's Influence / Requisition / Throne Gelt on
 * every line. Rows now come from each line's own acquisition currency in
 * `WH40K.currencies`, plus the shared throne-gelt baseline.
 */
const NONE = new Set<string>();

describe('lineResourceRows', () => {
    it("shows a line's own currency followed by the throne-gelt baseline", () => {
        expect(lineResourceRows('bc', WH40K.currencies, NONE)).toEqual([
            { field: 'system.infamy', labelKey: 'WH40K.Currency.Infamy' },
            { field: 'system.throneGelt', labelKey: 'WH40K.Currency.ThroneGelt' },
        ]);
        expect(lineResourceRows('dw', WH40K.currencies, NONE).map((r) => r.field)).toEqual(['system.requisition', 'system.throneGelt']);
    });

    it('does not repeat the baseline when it is the line currency (DH1)', () => {
        expect(lineResourceRows('dh1', WH40K.currencies, NONE)).toEqual([{ field: 'system.throneGelt', labelKey: 'WH40K.Currency.ThroneGelt' }]);
    });

    it('falls back to the baseline alone for a line with no currency of its own', () => {
        expect(lineResourceRows('im', WH40K.currencies, NONE).map((r) => r.field)).toEqual(['system.throneGelt']);
    });

    it('skips wallets that already have an editor elsewhere on the sheet', () => {
        const elsewhere = new Set(['system.rogueTrader.profitFactor.current']);
        expect(lineResourceRows('rt', WH40K.currencies, elsewhere).map((r) => r.field)).toEqual(['system.throneGelt']);
    });
});
