import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShipEffectData, ShipEffectView, ShipModifierInput } from '../../rules/ship-action-effects.ts';
import type { PriorTurnPool } from '../../rules/ship-crew-morale.ts';
import { echoLocalize, formValues, queueRolls } from '../../testing/ship-assault.ts';
import { ShipAssaultInputError } from '../ship-assault/ship-assault-flow.ts';
import {
    isRollableShipAction,
    rollShipAction,
    shipActionInputGroups,
    shipActionModifierRows,
    type ShipActionContext,
    type ShipActionOrder,
    type ShipActionShip,
} from './ship-action-flow.ts';

/**
 * Rolling an RT ship action from the voidcraft sheet (#186, #189): the test is
 * composed with provenance, and on a success the order's authored effect is
 * applied to the ship — Hold Fast! / Triage through `reducePriorTurnDamage`,
 * the timed modifiers through `applyShipActionModifier`.
 */

afterEach(() => {
    vi.unstubAllGlobals();
});

interface RecordingActionShip extends ShipActionShip {
    reductions: [PriorTurnPool, number][];
    modifiers: ShipModifierInput[];
}

function ship(options: { restored?: number; weapons?: { id: string; name: string }[]; effects?: ShipEffectView[] } = {}): RecordingActionShip {
    const recording: RecordingActionShip = {
        name: 'Errant Vector',
        system: { gameSystem: 'rt', crew: { crewRating: 40 } },
        manoeuvrability: 20,
        detection: 25,
        shipActionEffects: options.effects ?? [],
        shipWeaponChoices: options.weapons ?? [],
        reductions: [],
        modifiers: [],
        reducePriorTurnDamage: async (pool, amount) => {
            recording.reductions.push([pool, amount]);
            return Promise.resolve(Math.min(amount, options.restored ?? amount));
        },
        applyShipActionModifier: async (input) => {
            recording.modifiers.push(input);
            return Promise.resolve();
        },
    };
    return recording;
}

const NONE: ShipEffectData = { kind: '', targets: [], base: 0, step: 0, per: 1, rounds: 0, expiry: '' };

function order(name: string, test: Partial<ShipActionOrder['test']>, shipEffect: ShipEffectData): ShipActionOrder {
    return { uuid: `Compendium.x.${name}`, name, img: 'i.png', test: { skill: '', characteristic: '', modifier: 0, shipStat: '', ...test }, shipEffect };
}

const HOLD_FAST = order(
    'Hold Fast!',
    { characteristic: 'Willpower' },
    { kind: 'reducePriorTurnDamage', targets: ['morale'], base: 1, step: 1, per: 1, rounds: 0, expiry: '' },
);
const TRIAGE = order(
    'Triage',
    { skill: 'Medicae', modifier: -10 },
    { kind: 'reducePriorTurnDamage', targets: ['crewPopulation'], base: 1, step: 1, per: 1, rounds: 0, expiry: '' },
);
const LOCK = order(
    'Lock on Target',
    { skill: 'Scrutiny', shipStat: 'detection' },
    { kind: 'shipModifier', targets: ['weaponBallisticSkill'], base: 5, step: 5, per: 2, rounds: 0, expiry: 'turnEnd' },
);
const AID = order(
    'Aid the Machine Spirit',
    { skill: 'Tech-Use' },
    { kind: 'shipModifier', targets: ['manoeuvrability', 'detection'], base: 5, step: 5, per: 2, rounds: 0, expiry: 'turnEnd' },
);
const EVASIVE = order(
    'Evasive Manoeuvres',
    { skill: 'Pilot (Spacecraft)', modifier: -10, shipStat: 'manoeuvrability' },
    { kind: 'shipModifier', targets: ['ballisticSkill'], base: -10, step: -10, per: 1, rounds: 1, expiry: 'turnStart' },
);

function context(target: RecordingActionShip, action: ShipActionOrder): ShipActionContext {
    return { ship: target, order: action, localize: echoLocalize, degreesMethod: 'gen1' };
}

describe('isRollableShipAction', () => {
    it('rolls only actions with an authored effect', () => {
        expect(isRollableShipAction(HOLD_FAST)).toBe(true);
        expect(isRollableShipAction(order('Active Augury', { skill: 'Scrutiny' }, NONE))).toBe(false);
    });
});

describe('Hold Fast! (RT Core p.218, #189)', () => {
    it('on a success reduces last turn’s Morale damage by 1 plus each degree of success', async () => {
        const target = ship();
        queueRolls(15);
        const { card } = await rollShipAction(context(target, HOLD_FAST), formValues({ skill: 40 }));
        // 40 − 15 = 25 margin → 2 RT degrees → 1 + 2 = 3.
        expect(target.reductions).toEqual([['morale', 3]]);
        expect(card.data.success).toBe(true);
        expect(card.data.magnitude?.total).toBe(3);
        expect(card.data.outcome).toContain('Outcome.Restored.morale');
    });

    it('applies nothing on a failure', async () => {
        const target = ship();
        queueRolls(85);
        const { card } = await rollShipAction(context(target, HOLD_FAST), formValues({ skill: 40 }));
        expect(target.reductions).toEqual([]);
        expect(card.data.magnitude).toBeNull();
        expect(card.data.outcome).toBe('WH40K.Voidcraft.ShipAction.Outcome.Failed');
    });

    it('says so when last turn left no Morale damage to cancel', async () => {
        const target = ship({ restored: 0 });
        queueRolls(30);
        const { card } = await rollShipAction(context(target, HOLD_FAST), formValues({ skill: 40 }));
        expect(card.data.outcome).toBe('WH40K.Voidcraft.ShipAction.Outcome.NothingToRestore.morale');
    });
});

describe('Triage (RT Core p.218, #189)', () => {
    it('tests Medicae at −10 with full provenance and reduces Crew Population only', async () => {
        const target = ship();
        queueRolls(10);
        const { card } = await rollShipAction(context(target, TRIAGE), formValues({ skill: 50 }));
        expect(card.data.test.baseTarget).toBe(50);
        expect(card.data.test.modifierSources.map((row) => row.value)).toEqual([-10]);
        expect(card.data.test.target).toBe(40);
        // 40 − 10 = 30 margin → 3 degrees → 4.
        expect(target.reductions).toEqual([['crewPopulation', 4]]);
    });
});

describe('Lock on Target (RT Core p.218, #186)', () => {
    it('adds the ship’s Detection to Scrutiny and locks the chosen weapon on a success', async () => {
        const target = ship({
            weapons: [
                { id: 'macro', name: 'Macrobattery' },
                { id: 'lance', name: 'Lance' },
            ],
        });
        queueRolls(40);
        const { card } = await rollShipAction(context(target, LOCK), formValues({ skill: 40, weapon: 'lance' }));
        // 40 + 25 Detection = 65; 65 − 40 = 25 → 2 degrees → +5 + 5.
        expect(card.data.test.target).toBe(65);
        expect(target.modifiers).toEqual([
            {
                name: 'Lock on Target',
                img: 'i.png',
                origin: 'Compendium.x.Lock on Target',
                target: 'weaponBallisticSkill',
                value: 10,
                weaponId: 'lance',
                rounds: 0,
                expiry: 'turnEnd',
            },
        ]);
    });

    it('refuses with a player-facing message when the ship has no Weapon Component', async () => {
        queueRolls(40);
        await expect(rollShipAction(context(ship(), LOCK), formValues({ skill: 40 }))).rejects.toBeInstanceOf(ShipAssaultInputError);
    });

    it('offers a weapon select in the dialog', () => {
        const groups = shipActionInputGroups(context(ship({ weapons: [{ id: 'lance', name: 'Lance' }] }), LOCK));
        expect(groups.flatMap((group) => group.fields).find((field) => field.name === 'weapon')?.options).toEqual([{ value: 'lance', label: 'Lance' }]);
    });
});

describe('Aid the Machine Spirit (RT Core p.217, #186)', () => {
    it('lets the character choose Manoeuvrability or Detection', async () => {
        const target = ship();
        const choice = shipActionInputGroups(context(target, AID))
            .flatMap((group) => group.fields)
            .find((field) => field.name === 'target');
        expect(choice?.options?.map((option) => option.value)).toEqual(['manoeuvrability', 'detection']);
        queueRolls(39);
        await rollShipAction(context(target, AID), formValues({ skill: 40, target: 'detection' }));
        expect(target.modifiers.map((input) => [input.target, input.value])).toEqual([['detection', 5]]);
    });
});

describe('Evasive Manoeuvres (RT Core p.215, #186)', () => {
    it('penalises the ship’s own fire −10 per success and degree until its next turn', async () => {
        const target = ship({ effects: [{ name: 'Aid the Machine Spirit', active: true, modifier: { target: 'manoeuvrability', value: 5, weaponId: '' } }] });
        queueRolls(20);
        const { card } = await rollShipAction(context(target, EVASIVE), formValues({ skill: 40 }));
        // Pilot 40 + Manoeuvrability 15 (+5 Aid the Machine Spirit, shown apart) − 10 = 50.
        expect(card.data.test.modifierSources.map((row) => row.value)).toEqual([15, 5, -10]);
        expect(card.data.test.target).toBe(50);
        // 50 − 20 = 30 → 3 degrees → −10 × 4.
        expect(target.modifiers.map((input) => [input.target, input.value, input.rounds, input.expiry])).toEqual([['ballisticSkill', -40, 1, 'turnStart']]);
    });
});

describe('shipActionModifierRows (the sheet’s "Ship Actions in Effect" list, #186)', () => {
    it('lists each live modifier signed, naming the Weapon Component a Lock on Target aims', () => {
        const target = ship({
            weapons: [{ id: 'lance', name: 'Titanforge Lance' }],
            effects: [
                { name: 'Lock on Target', active: true, modifier: { target: 'weaponBallisticSkill', value: 15, weaponId: 'lance' } },
                { name: 'Come to New Heading', active: true, modifier: { target: 'ballisticSkill', value: -20, weaponId: '' } },
                { name: 'Flank Speed', active: false, modifier: { target: 'speed', value: 3, weaponId: '' } },
            ],
        });
        expect(shipActionModifierRows(target, echoLocalize)).toEqual([
            { name: 'Lock on Target', target: 'WH40K.Voidcraft.ShipAction.Target.weaponBallisticSkill{"weapon":"Titanforge Lance"}', value: '+15' },
            { name: 'Come to New Heading', target: 'WH40K.Voidcraft.ShipAction.Target.ballisticSkill{"weapon":""}', value: '-20' },
        ]);
    });

    it('is empty when nothing is in effect', () => {
        expect(shipActionModifierRows(ship(), echoLocalize)).toEqual([]);
    });
});
