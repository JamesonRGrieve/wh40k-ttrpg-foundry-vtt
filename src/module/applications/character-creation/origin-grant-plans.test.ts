import { describe, expect, it } from 'vitest';
import { collectItemGrantPlans, type GrantSourceSystem, resolveCreationOverrides } from './origin-grant-plans.ts';

const TALENT = 'Compendium.wh40k-rpg.bc-core-items-talents.Item.U43HnUrxpnfMQ0A1';
const UNNATURAL = 'Compendium.wh40k-rpg.bc-core-items-traits.Item.aJsI80r35DGRtJBD';
const AMPHIBIOUS = 'Compendium.wh40k-rpg.bc-core-items-traits.Item.Kx4mT9vRb2WqLn7P';

/** The BC Chaos Space Marine race as the builder sees it after the UUID migration (#727). */
const CHAOS_SPACE_MARINE: GrantSourceSystem = {
    characterCreation: { characteristicBase: 30, startingXP: 500 },
    grants: {
        talents: [
            { name: 'Heightened Senses (Hearing)', specialization: 'Hearing', uuid: TALENT },
            { name: 'Bulging Biceps', specialization: '' },
        ],
        traits: [
            { name: 'Amphibious', uuid: AMPHIBIOUS },
            { name: 'Unnatural Strength (+4)', specialization: 'Strength', level: 4, uuid: UNNATURAL },
            { name: 'Unnatural Toughness (+4)', specialization: 'Toughness', level: 4, uuid: UNNATURAL },
        ],
    },
};

describe('collectItemGrantPlans (#727)', () => {
    it('plans each trait grant with its specialisation and level, so the CSM gets its traits', () => {
        const { plans, unresolved } = collectItemGrantPlans([CHAOS_SPACE_MARINE], 'trait');
        expect(plans).toEqual([
            { uuid: AMPHIBIOUS },
            { uuid: UNNATURAL, specialization: 'Strength', level: 4 },
            { uuid: UNNATURAL, specialization: 'Toughness', level: 4 },
        ]);
        expect(unresolved).toEqual([]);
    });

    it('plans talents with their specialisation and lists a grant with no UUID instead of dropping it', () => {
        const { plans, unresolved } = collectItemGrantPlans([CHAOS_SPACE_MARINE], 'talent');
        expect(plans).toEqual([{ uuid: TALENT, specialization: 'Hearing' }]);
        expect(unresolved).toEqual(['Bulging Biceps']);
    });

    it('never gives a talent a level, and ignores a skill-style rank word as a trait level', () => {
        const system: GrantSourceSystem = {
            grants: { talents: [{ name: 'Jaded', uuid: TALENT, level: 3 }], traits: [{ name: 'Fear', uuid: AMPHIBIOUS, level: 'trained' }] },
        };
        expect(collectItemGrantPlans([system], 'talent').plans).toEqual([{ uuid: TALENT }]);
        expect(collectItemGrantPlans([system], 'trait').plans).toEqual([{ uuid: AMPHIBIOUS }]);
    });

    it('adds choice-resolved grants of the kind, with the picked specialisation, and reports unlinked picks', () => {
        const system: GrantSourceSystem = {
            activeModifiers: [
                { type: 'talent', key: 'Weapon Training', specialization: 'Chain', itemUuid: TALENT },
                { type: 'talent', key: 'Weapon Training', specialization: 'Las', itemUuid: null },
                { type: 'trait', key: 'Unnatural Characteristic', specialization: 'Agility', value: 2, itemUuid: UNNATURAL },
                { type: 'skill', key: 'Dodge', itemUuid: null },
            ],
        };
        expect(collectItemGrantPlans([system], 'talent')).toEqual({
            plans: [{ uuid: TALENT, specialization: 'Chain' }],
            unresolved: ['Weapon Training (Las)'],
        });
        expect(collectItemGrantPlans([system], 'trait')).toEqual({ plans: [{ uuid: UNNATURAL, specialization: 'Agility', level: 2 }], unresolved: [] });
    });
});

describe('resolveCreationOverrides (#727)', () => {
    it("takes the race's characteristic base and starting XP", () => {
        expect(resolveCreationOverrides([CHAOS_SPACE_MARINE])).toEqual({ characteristicBase: 30, startingXP: 500 });
    });

    it('is null where no chosen origin sets a value, so the line default applies', () => {
        expect(resolveCreationOverrides([{ grants: {} }, { characterCreation: { characteristicBase: null, startingXP: null } }])).toEqual({
            characteristicBase: null,
            startingXP: null,
        });
        expect(resolveCreationOverrides([])).toEqual({ characteristicBase: null, startingXP: null });
    });

    it('takes the first value each field gets, in origin order, field by field', () => {
        const archetype: GrantSourceSystem = { characterCreation: { characteristicBase: null, startingXP: 750 } };
        expect(resolveCreationOverrides([archetype, CHAOS_SPACE_MARINE])).toEqual({ characteristicBase: 30, startingXP: 750 });
    });
});
