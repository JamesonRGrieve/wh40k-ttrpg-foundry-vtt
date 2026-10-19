import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChaosAlignment } from '../../../config/game-systems/types.ts';
import type { GiftData, GiftRider } from '../../../rules/bc-gifts.ts';
import { installFoundryDataStub } from '../../../testing/foundry-data-stub.ts';

/**
 * Black Crusade Gifts of the Gods (#180) through the central modifier path: an
 * owned Gift (a `mutation` with category `gift`) → `CreatureTemplate`
 * `_computeItemModifiers` → characteristic / skill totals, with the Gift as the
 * provenance source. The base `modifiers` always apply; the rider applies only
 * for the matching Chaos Alignment.
 *
 * Same harness as `creature-item-modifiers.test.ts`: `creature.ts` needs only
 * `foundry.abstract` + `foundry.data.fields` at module evaluation, so a stub is
 * installed BEFORE the dynamic import (the shared Foundry data stub) and the
 * preparation methods are driven on hand-set data, in `prepareEmbeddedData` order.
 */
afterAll(installFoundryDataStub());

const { default: CreatureTemplate } = await import('./creature.ts');

/** The structural slice of an owned mutation the aggregator reads. */
interface FakeMutation {
    name: string;
    type: 'mutation';
    id: string;
    uuid: string;
    isOriginPath: false;
    isTalent: false;
    isTrait: false;
    isCondition: false;
    isSpecialAbility: false;
    isMutation: true;
    system: {
        category: string;
        effect: string;
        modifiers: { characteristics: Record<string, number>; skills: Record<string, number> };
        gift: GiftData;
    };
}

function rider(alignment: GiftRider['alignment'], characteristics: Record<string, number>, skills: Record<string, number> = {}): GiftRider {
    return { alignment, description: '', characteristics, skills, grants: [], activeEffect: '' };
}

function mutation(name: string, category: string, modifiers: FakeMutation['system']['modifiers'], riders: GiftRider[] = []): FakeMutation {
    return {
        name,
        type: 'mutation',
        id: `${name}-id`,
        uuid: `Actor.a.Item.${name}-id`,
        isOriginPath: false,
        isTalent: false,
        isTrait: false,
        isCondition: false,
        isSpecialAbility: false,
        isMutation: true,
        system: { category, effect: '', modifiers, gift: { grants: [], riders, subTable: '', characteristicRolls: [] } },
    };
}

type Creature = InstanceType<typeof CreatureTemplate>;

const BASES: Record<string, [number, string]> = {
    weaponSkill: [40, 'WS'],
    ballisticSkill: [35, 'BS'],
    strength: [30, 'S'],
    toughness: [30, 'T'],
    agility: [30, 'Ag'],
    intelligence: [40, 'Int'],
    perception: [30, 'Per'],
    willpower: [30, 'WP'],
    fellowship: [30, 'Fel'],
};

function prepare(chaosAlignment: ChaosAlignment | undefined, items: FakeMutation[]): Creature {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's TypeDataModel constructor demands (data, options), which the stubbed base ignores; the instance is populated by hand below
    const creature = new (CreatureTemplate as unknown as new () => Creature)();
    Object.assign(creature, {
        gameSystem: 'bc',
        ...(chaosAlignment === undefined ? {} : { chaosAlignment }),
        characteristics: Object.fromEntries(
            Object.entries(BASES).map(([key, [base, short]]) => [
                key,
                { label: short, short, base, advance: 0, modifier: 0, unnatural: 0, damage: 0, total: base, bonus: Math.floor(base / 10) },
            ]),
        ),
        skills: { awareness: { label: 'Per', characteristic: 'Per', advanced: false, basic: true, advance: 1, bonus: 0, current: 0 } },
        initiative: { characteristic: 'agility', base: 0, bonus: 0 },
        fatigue: { value: 0, max: 0 },
    });
    Object.defineProperty(creature, 'parent', { value: { items: { filter: (fn: (i: FakeMutation) => boolean) => items.filter(fn) } } });
    creature._initializeModifierTracking();
    creature._computeItemModifiers();
    creature._applyModifiersToCharacteristics();
    creature._applyModifiersToSkills();
    return creature;
}

beforeEach(() => {
    vi.stubGlobal('game', { settings: { get: () => 'auto' } });
});

describe('Gifts of the Gods fold into the central modifier path (#180)', () => {
    const gift = mutation('Fixture Gift', 'gift', { characteristics: { intelligence: -12 }, skills: { awareness: 10 } }, [
        rider('khorne', { strength: 5 }),
        rider('tzeentch', {}, { awareness: 10 }),
    ]);

    it('applies the base modifiers with the Gift as their source for an unaligned bearer', () => {
        const { characteristics, skills, modifierSources } = prepare('unaligned', [gift]);

        expect(characteristics.intelligence.total).toBe(28);
        expect(characteristics.strength.total).toBe(30);
        expect(skills.awareness.current).toBe(40);
        expect(modifierSources.characteristics['intelligence']).toEqual([expect.objectContaining({ name: 'Fixture Gift', type: 'mutation', value: -12 })]);
    });

    it('adds the matching rider for an aligned bearer, in the same provenance row', () => {
        const khorne = prepare('khorne', [gift]);
        expect(khorne.characteristics.strength.total).toBe(35);
        expect(khorne.modifierSources.characteristics['strength']).toEqual([expect.objectContaining({ name: 'Fixture Gift', value: 5 })]);

        const tzeentch = prepare('tzeentch', [gift]);
        expect(tzeentch.characteristics.strength.total).toBe(30);
        expect(tzeentch.skills.awareness.current).toBe(50);
    });

    it('treats an actor with no alignment field (an NPC) as unaligned', () => {
        expect(prepare(undefined, [gift]).characteristics.strength.total).toBe(30);
    });

    it('leaves a non-Gift mutation out of the totals, as before', () => {
        const dhMutation = mutation('Minor Mutation', 'minor', { characteristics: { toughness: 10 }, skills: {} });
        const { characteristics, modifierSources } = prepare('khorne', [dhMutation]);

        expect(characteristics.toughness.total).toBe(30);
        expect(modifierSources.characteristics).toEqual({});
    });
});
