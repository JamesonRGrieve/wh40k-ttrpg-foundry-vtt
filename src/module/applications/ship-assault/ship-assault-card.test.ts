import { describe, expect, it } from 'vitest';
import { deriveTarget, resolveShipTest } from '../../rules/ship-assault.ts';
import { echoLocalize } from '../../testing/ship-assault.ts';
import { buildDamageView, buildTestView, componentRow } from './ship-assault-card.ts';

/**
 * Card view builders (#188): every test and damage term reaches the card as a
 * hoverable row whose tooltip payload names its provenance.
 */
describe('ship-assault-card', () => {
    it('localizes a component and carries a parseable "modifier" tooltip payload', () => {
        const row = componentRow({ labelKey: 'WH40K.X', value: -20, data: { rating: 2 } }, 'RT Core p.220', echoLocalize);
        expect(row.label).toBe('WH40K.X{"rating":2}');
        expect(JSON.parse(row.tooltipData)).toEqual({ title: row.label, sources: [{ name: 'RT Core p.220', value: -20 }] });
    });

    it('builds a test view with the full derivation and the roll outcome', () => {
        const result = resolveShipTest(
            deriveTarget({ labelKey: 'base', value: 40 }, [
                { labelKey: 'a', value: 15 },
                { labelKey: 'b', value: -20 },
            ]),
            12,
        );
        const view = buildTestView('Lock', result, 'src', echoLocalize);
        expect(view).toMatchObject({ title: 'Lock', baseLabel: 'base', baseTarget: 40, target: 35, roll: 12, success: true, dos: 3, dof: 0 });
        expect(view.modifierSources.map((row) => row.value)).toEqual([15, -20]);
    });

    it('totals a damage view from its rows', () => {
        const view = buildDamageView(
            'Hull',
            [
                { labelKey: 'die', value: 7 },
                { labelKey: 'armour', value: 18 },
            ],
            'src',
            echoLocalize,
        );
        expect(view.total).toBe(25);
        expect(view.rows).toHaveLength(2);
    });
});
