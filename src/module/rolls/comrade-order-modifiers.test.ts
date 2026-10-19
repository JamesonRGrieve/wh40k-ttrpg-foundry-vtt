import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { comradeOrderModifiersFor } from './comrade-order-modifiers.ts';

/**
 * The Path B rows a PC's Comrade Orders add to its tests (#152): Ranged Volley's
 * "+5 to all Ballistics Skill Tests this Turn" (OW Core p. 270), one sourced row,
 * only this Round, only on Ballistic Skill, only in a line that prints Comrades.
 */

const COMBAT = { id: 'c1', started: true, round: 4 };

function pc(line: string, activeOrders: object[]): { system: object } {
    return { system: { gameSystem: line, comrade: { name: 'Comrade Voss', state: 'unharmed' }, activeOrders } };
}

describe('comradeOrderModifiersFor', () => {
    beforeEach(() => {
        vi.stubGlobal('game', {
            combat: COMBAT,
            i18n: {
                localize: (key: string) => key,
                format: (key: string, data: Record<string, string>) => `${key}|${data['order'] ?? ''}|${data['comrade'] ?? ''}`,
            },
        });
    });
    afterEach(() => vi.unstubAllGlobals());

    const volleyThisRound = { orderId: 'ranged-volley', combatId: 'c1', round: 4 };

    it('Ranged Volley given this Turn: a +5 row on Ballistic Skill, sourced to the Order and the Comrade', () => {
        expect(comradeOrderModifiersFor(pc('ow', [volleyThisRound]), 'ballisticSkill')).toEqual([
            {
                key: 'comrade-order-ranged-volley',
                label: 'WH40K.OW.Orders.Generic.RangedVolley',
                value: 5,
                source: 'WH40K.OW.Orders.Source|WH40K.OW.Orders.Generic.RangedVolley|Comrade Voss',
            },
        ]);
    });

    it('nothing on Weapon Skill, from an earlier Round, out of combat, or in a line without Comrades', () => {
        expect(comradeOrderModifiersFor(pc('ow', [volleyThisRound]), 'weaponSkill')).toEqual([]);
        expect(comradeOrderModifiersFor(pc('ow', [{ ...volleyThisRound, round: 3 }]), 'ballisticSkill')).toEqual([]);
        expect(comradeOrderModifiersFor(pc('dh2', [volleyThisRound]), 'ballisticSkill')).toEqual([]);
        expect(comradeOrderModifiersFor(null, 'ballisticSkill')).toEqual([]);
        vi.stubGlobal('game', { combat: null, i18n: { localize: (key: string) => key, format: (key: string) => key } });
        expect(comradeOrderModifiersFor(pc('ow', [volleyThisRound]), 'ballisticSkill')).toEqual([]);
    });
});
