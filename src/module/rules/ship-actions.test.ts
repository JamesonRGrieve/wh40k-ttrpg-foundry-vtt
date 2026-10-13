import { describe, expect, it } from 'vitest';
import { isLineOrHomebrewPack } from '../utils/compendium-query.ts';
import type { ShipEffectData } from './ship-action-effects.ts';
import { shipActionRows, shipActionTestLabel, toShipActionRow, type ShipActionOrderView } from './ship-actions.ts';

/** Voidcraft Extended / Manoeuvre Action rows (#185, #186). */

/** A rules-card-only action: no automated effect. */
const NO_EFFECT: ShipEffectData = { kind: '', targets: [], base: 0, step: 0, per: 1, rounds: 0, expiry: '' };

function order(name: string, actionType: string, uuid = `uuid-${name}`, shipEffect: ShipEffectData = NO_EFFECT): ShipActionOrderView {
    return {
        uuid,
        id: name.toLowerCase(),
        name,
        img: 'icon.png',
        system: {
            actionType,
            test: { skill: 'Tech-Use', characteristic: '', modifier: -10, shipStat: '' },
            duration: '1d5 Turns',
            requirements: '',
            typeAndAction: 'Extended Action',
            description: { value: '<p>Repairs.</p>' },
            shipEffect,
        },
    };
}

describe('shipActionRows', () => {
    it('splits orders by actionType between the two tabs', () => {
        const orders = [order('Triage', 'extended-action'), order('Standard Move', 'maneuver-action'), order('Overwatch', 'reaction')];
        expect(shipActionRows(orders, 'extended').map((row) => row.name)).toEqual(['Triage']);
        expect(shipActionRows(orders, 'manoeuvre').map((row) => row.name)).toEqual(['Standard Move']);
    });

    it('sorts by name and lists each uuid once', () => {
        const orders = [order('Triage', 'extended-action'), order('Flank Speed', 'extended-action'), order('Triage', 'extended-action')];
        expect(shipActionRows(orders, 'extended').map((row) => row.name)).toEqual(['Flank Speed', 'Triage']);
    });

    it('skips an order with no uuid', () => {
        expect(shipActionRows([order('Triage', 'extended-action', '')], 'extended')).toEqual([]);
    });
});

describe('toShipActionRow', () => {
    it('reads the test block, duration and rules text', () => {
        expect(toShipActionRow(order('Emergency Repairs', 'extended-action'))).toEqual({
            uuid: 'uuid-Emergency Repairs',
            id: 'emergency repairs',
            name: 'Emergency Repairs',
            img: 'icon.png',
            skill: 'Tech-Use',
            modifier: -10,
            duration: '1d5 Turns',
            description: '<p>Repairs.</p>',
            requirements: '',
            typeAndAction: 'Extended Action',
            rollable: false,
        });
    });

    it('marks an action with an authored effect as rollable (#186)', () => {
        const effect: ShipEffectData = { kind: 'reducePriorTurnDamage', targets: ['morale'], base: 1, step: 1, per: 1, rounds: 0, expiry: '' };
        expect(toShipActionRow(order('Hold Fast!', 'extended-action', 'uuid-hf', effect)).rollable).toBe(true);
    });
});

describe('shipActionTestLabel', () => {
    it('names the characteristic when the action tests one directly', () => {
        expect(shipActionTestLabel({ skill: '', characteristic: 'Willpower', modifier: 0, shipStat: '' })).toBe('Willpower');
        expect(shipActionTestLabel({ skill: 'Command', characteristic: '', modifier: 0, shipStat: '' })).toBe('Command');
    });
});

describe('isLineOrHomebrewPack', () => {
    it("admits the line's own and homebrew packs, never another line's", () => {
        expect(isLineOrHomebrewPack('wh40k-rpg.rt-core-items-ship-orders', 'rt')).toBe(true);
        expect(isLineOrHomebrewPack('wh40k-rpg.hb-rt-items-ship-orders', 'rt')).toBe(true);
        expect(isLineOrHomebrewPack('wh40k-rpg.ow-core-items-orders', 'rt')).toBe(false);
        expect(isLineOrHomebrewPack('wh40k-rpg.hb-dh2-items-weapons', 'rt')).toBe(false);
    });
});
