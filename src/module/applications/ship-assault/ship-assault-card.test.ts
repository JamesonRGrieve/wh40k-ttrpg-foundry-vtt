import { describe, expect, it } from 'vitest';
import { deriveTarget, resolveShipTest } from '../../rules/ship-assault.ts';
import { echoLocalize } from '../../testing/ship-assault.ts';
import { buildDamageView, buildTestView, componentRow, shipDegreesFormula } from './ship-assault-card.ts';

/**
 * Card view builders (#188): every test and damage term reaches the card as a
 * hoverable row whose tooltip payload names its provenance.
 */
describe('ship-assault-card', () => {
    it('localizes a component and carries a parseable "modifier" tooltip payload', () => {
        const row = componentRow({ labelKey: 'WH40K.X', value: -20, data: { rating: 2 } }, 'Turret rating', echoLocalize);
        expect(row.label).toBe('WH40K.X{"rating":2}');
        expect(JSON.parse(row.tooltipData)).toEqual({ title: row.label, sources: [{ name: 'Turret rating', value: -20 }] });
    });

    it('builds a test view with the full derivation and the roll outcome', () => {
        const result = resolveShipTest(
            deriveTarget({ labelKey: 'base', value: 40 }, [
                { labelKey: 'a', value: 15 },
                { labelKey: 'b', value: -20 },
            ]),
            12,
            'gen1',
        );
        const view = buildTestView('Lock', result, 'src', echoLocalize);
        expect(view).toMatchObject({ title: 'Lock', baseLabel: 'base', baseTarget: 40, target: 35, roll: 12, success: true, dos: 2, dof: 0 });
        expect(view.modifierSources.map((row) => row.value)).toEqual([15, -20]);
    });

    it('prints the degrees derivation under the line’s method', () => {
        const at = (roll: number, method: 'gen1' | 'gen2'): string =>
            shipDegreesFormula(resolveShipTest(deriveTarget({ labelKey: 'base', value: 53 }, []), roll, method), echoLocalize);
        // RT: target 53, roll 29 → ⌊24 ÷ 10⌋ = 2 DoS; a 65 fails by ⌊12 ÷ 10⌋ = 1.
        expect(at(29, 'gen1')).toBe('WH40K.Roll.ResultFormula.SuccessGen1{"roll":"29","target":"53","dos":"2","margin":"24"}');
        expect(at(65, 'gen1')).toBe('WH40K.Roll.ResultFormula.FailureGen1{"roll":"65","target":"53","dof":"1","margin":"12"}');
        expect(at(29, 'gen2')).toBe('WH40K.Roll.ResultFormula.Success{"roll":"29","target":"53","dos":"4","degree":"3"}');
        // A bare RT pass prints 0 degrees, not the clamped engine count.
        expect(at(53, 'gen1')).toBe('WH40K.Roll.ResultFormula.SuccessGen1{"roll":"53","target":"53","dos":"0","margin":"0"}');
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
