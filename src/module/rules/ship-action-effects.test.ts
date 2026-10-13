import { describe, expect, it } from 'vitest';
import {
    collectShipModifierComponents,
    composeShipActionTest,
    effectTargets,
    extraDegreesOfSuccess,
    hasShipEffect,
    readShipModifierFlag,
    SHIP_MODIFIER_COMPONENT_KEY,
    shipEffectMagnitude,
    shipEffectMagnitudeComponents,
    shipModifierEffectSource,
    type ShipEffectData,
    type ShipEffectView,
} from './ship-action-effects.ts';

/** RT starship action effects (RT Core pp.212–218, #186, #189). */

const ADD = 2;

function effect(overrides: Partial<ShipEffectData>): ShipEffectData {
    return { kind: 'shipModifier', targets: ['speed'], base: 1, step: 1, per: 1, rounds: 0, expiry: 'turnEnd', ...overrides };
}

describe('extraDegreesOfSuccess', () => {
    it('counts RT degrees as each full 10 of margin, a bare success scoring 0 (p.231)', () => {
        expect(extraDegreesOfSuccess('gen1', 40, 45, true)).toBe(0);
        expect(extraDegreesOfSuccess('gen1', 25, 45, true)).toBe(2);
        expect(extraDegreesOfSuccess('gen1', 5, 45, true)).toBe(4);
    });

    it('uses the tens-digit difference under the gen2 override', () => {
        expect(extraDegreesOfSuccess('gen2', 39, 41, true)).toBe(1);
        expect(extraDegreesOfSuccess('gen1', 39, 41, true)).toBe(0);
    });

    it('is 0 on a failure', () => {
        expect(extraDegreesOfSuccess('gen1', 90, 45, false)).toBe(0);
    });
});

describe('shipEffectMagnitude', () => {
    it('Hold Fast! / Triage: 1 plus 1 per degree', () => {
        const holdFast = effect({ kind: 'reducePriorTurnDamage', targets: ['morale'] });
        expect(shipEffectMagnitude(holdFast, 0)).toBe(1);
        expect(shipEffectMagnitude(holdFast, 3)).toBe(4);
    });

    it('Lock on Target: +5, and +5 per two additional degrees', () => {
        const lock = effect({ targets: ['weaponBallisticSkill'], base: 5, step: 5, per: 2 });
        expect(shipEffectMagnitude(lock, 1)).toBe(5);
        expect(shipEffectMagnitude(lock, 2)).toBe(10);
        expect(shipEffectMagnitude(lock, 5)).toBe(15);
    });

    it('Evasive Manoeuvres: −10 for the success and each degree', () => {
        expect(shipEffectMagnitude(effect({ targets: ['ballisticSkill'], base: -10, step: -10 }), 2)).toBe(-30);
    });

    it('Come to New Heading: a flat −20 whatever the degrees', () => {
        expect(shipEffectMagnitude(effect({ targets: ['ballisticSkill'], base: -20, step: 0 }), 4)).toBe(-20);
    });

    it('omits the degree term when it adds nothing, so the card shows only real terms', () => {
        expect(shipEffectMagnitudeComponents(effect({ base: 5, step: 5, per: 2 }), 1)).toHaveLength(1);
        expect(shipEffectMagnitudeComponents(effect({ base: 5, step: 5, per: 2 }), 2)[1]).toMatchObject({ value: 5, data: { degrees: 2, per: 2, step: 5 } });
    });
});

describe('hasShipEffect / effectTargets', () => {
    it('treats an empty kind or no targets as a rules-card-only action', () => {
        expect(hasShipEffect(effect({ kind: '' }))).toBe(false);
        expect(hasShipEffect(effect({ targets: [] }))).toBe(false);
        expect(hasShipEffect(effect({}))).toBe(true);
    });

    it('keeps only the targets the kind accepts', () => {
        expect(effectTargets(effect({ kind: 'reducePriorTurnDamage', targets: ['morale', 'speed'] }))).toEqual(['morale']);
        expect(effectTargets(effect({ targets: ['manoeuvrability', 'detection', 'morale'] }))).toEqual(['manoeuvrability', 'detection']);
    });
});

describe('shipModifierEffectSource', () => {
    const base = { name: 'Aid the Machine Spirit', img: 'i.png', origin: 'Compendium.x', value: 10, weaponId: '', rounds: 0, expiry: 'turnEnd' as const };

    it('changes a stat target directly, lasting this turn', () => {
        const source = shipModifierEffectSource({ ...base, target: 'manoeuvrability' }, ADD);
        expect(source.changes).toEqual([{ key: 'system.manoeuvrability', mode: ADD, value: '10' }]);
        expect(source.duration).toEqual({ value: 0, units: 'rounds', expiry: 'turnEnd' });
        expect(source.flags['wh40k-rpg'].shipActionModifier).toEqual({ target: 'manoeuvrability', value: 10, weaponId: '' });
    });

    it('leaves a Ballistic Skill target to the collector (no changes)', () => {
        const source = shipModifierEffectSource({ ...base, target: 'weaponBallisticSkill', weaponId: 'w1', rounds: 1, expiry: 'turnStart' }, ADD);
        expect(source.changes).toEqual([]);
        expect(source.duration).toEqual({ value: 1, units: 'rounds', expiry: 'turnStart' });
    });
});

describe('readShipModifierFlag', () => {
    it('accepts a valid payload and rejects anything else', () => {
        expect(readShipModifierFlag({ target: 'ballisticSkill', value: -20, weaponId: '' })).toEqual({ target: 'ballisticSkill', value: -20, weaponId: '' });
        expect(readShipModifierFlag({ target: 'morale', value: 1 })).toBeNull();
        expect(readShipModifierFlag({ target: 'speed', value: 'x' })).toBeNull();
        expect(readShipModifierFlag(undefined)).toBeNull();
    });
});

describe('collectShipModifierComponents', () => {
    const effects: ShipEffectView[] = [
        { name: 'Lock on Target', active: true, modifier: { target: 'weaponBallisticSkill', value: 10, weaponId: 'lance' } },
        { name: 'Evasive Manoeuvres', active: true, modifier: { target: 'ballisticSkill', value: -10, weaponId: '' } },
        { name: 'Come to New Heading', active: false, modifier: { target: 'ballisticSkill', value: -20, weaponId: '' } },
        { name: 'Aid the Machine Spirit', active: true, modifier: { target: 'detection', value: 5, weaponId: '' } },
        { name: 'Stunned', active: true, modifier: null },
    ];

    it('gives the chosen weapon its Lock on Target bonus plus every all-weapon modifier', () => {
        expect(collectShipModifierComponents(effects, { target: 'ballisticSkill', weaponId: 'lance' })).toEqual([
            { labelKey: SHIP_MODIFIER_COMPONENT_KEY, value: 10, data: { name: 'Lock on Target' } },
            { labelKey: SHIP_MODIFIER_COMPONENT_KEY, value: -10, data: { name: 'Evasive Manoeuvres' } },
        ]);
    });

    it('does not give another weapon the Lock on Target bonus, and skips expired effects', () => {
        expect(collectShipModifierComponents(effects, { target: 'ballisticSkill', weaponId: 'macro' }).map((row) => row.value)).toEqual([-10]);
    });

    it('collects the stat modifiers for a combined test', () => {
        expect(collectShipModifierComponents(effects, { target: 'detection' }).map((row) => row.value)).toEqual([5]);
        expect(collectShipModifierComponents(effects, { target: 'manoeuvrability' })).toEqual([]);
    });
});

describe('composeShipActionTest', () => {
    it('adds the ship stat to the skill and splits out the live modifiers inside it (p.212)', () => {
        const aid = { labelKey: SHIP_MODIFIER_COMPONENT_KEY, value: 5, data: { name: 'Aid the Machine Spirit' } };
        const derivation = composeShipActionTest({
            skillLabel: 'Scrutiny',
            skill: 40,
            ship: 'Errant Vector',
            difficulty: 0,
            shipStat: { stat: 'detection', value: 25, modifiers: [aid] },
            situational: { value: 10, label: 'Auspex' },
        });
        expect(derivation.base).toMatchObject({ value: 40, data: { skill: 'Scrutiny' } });
        expect(derivation.modifiers.map((row) => row.value)).toEqual([20, 5, 10]);
        expect(derivation.target).toBe(75);
    });

    it('adds the printed difficulty and no ship stat for a plain test', () => {
        const derivation = composeShipActionTest({ skillLabel: 'Medicae', skill: 40, ship: 'S', difficulty: -10, shipStat: null });
        expect(derivation.modifiers.map((row) => row.value)).toEqual([-10]);
        expect(derivation.target).toBe(30);
    });
});
