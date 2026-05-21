import { describe, expect, it } from 'vitest';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import { computeArmour } from './armour-calculator';

/**
 * Regression tests for the DH2 errata stacking rules (errata.md L69-73):
 *
 *   "Machine Trait: This armour stacks with worn armour, but not with
 *    the Natural Armour trait..."
 *
 * `computeArmour()` already implements this — Machine and Natural Armour
 * are taken as the higher of the two for `traitBonus`, and equipped
 * armour AP is summed on top. These tests pin both pathways so a refactor
 * of the trait-bonus accumulator cannot silently regress the errata fix.
 */

// eslint-disable-next-line no-restricted-syntax -- boundary: test mock type; system fields are structurally unknown outside the test helper
type ItemLike = { type: string; name: string; system: Record<string, unknown> };

interface MockActorOpts {
    toughnessBonus?: number;
    items?: ItemLike[];
}

function makeTraitItem(name: string, level: number): ItemLike {
    return { type: 'trait', name, system: { level } };
}

function makeWornArmourItem(name: string, ap: number): ItemLike {
    // Match the path computeArmour uses: equipped armour with an
    // `armourPoints` map keyed by location.
    return {
        type: 'armour',
        name,
        system: {
            equipped: true,
            craftsmanship: 'common',
            armourPoints: {
                body: ap,
                head: ap,
                leftArm: ap,
                rightArm: ap,
                leftLeg: ap,
                rightLeg: ap,
            },
        },
    };
}

function mockActor(opts: MockActorOpts): WH40KBaseActor {
    const items = opts.items ?? [];
    // Minimal actor surface that computeArmour reaches into:
    //  - characteristics.toughness.bonus
    //  - items (iterable + .filter)
    //  - getFlag('wh40k-rpg', 'hitThisRound')
    const actor = {
        characteristics: {
            toughness: { bonus: opts.toughnessBonus ?? 0 },
        },
        items: Object.assign([...items], {
            filter: (predicate: (i: ItemLike) => boolean) => items.filter(predicate),
        }),
        getFlag: (_scope: string, _key: string) => false,
    };
    // eslint-disable-next-line no-restricted-syntax -- boundary: mockActor satisfies the structural surface that computeArmour reaches into; full WH40KBaseActor type has fields irrelevant to this unit test
    return actor as unknown as WH40KBaseActor;
}

describe('computeArmour (#144 errata: Machine + worn-armour stacking)', () => {
    it('Machine 4 + flak armour (AP 4) STACKS — body total = TB 3 + Machine 4 + AP 4 = 11', () => {
        const actor = mockActor({
            toughnessBonus: 3,
            items: [makeTraitItem('Machine', 4), makeWornArmourItem('Flak Cloak', 4)],
        });
        const armour = computeArmour(actor);
        expect(armour['body']?.total).toBe(11);
        expect(armour['body']?.traitBonus).toBe(4);
        expect(armour['body']?.value).toBe(4); // worn armour AP at body
        expect(armour['body']?.toughnessBonus).toBe(3);
    });

    it('Natural Armour 5 alone — body total = TB 3 + Natural 5 = 8', () => {
        const actor = mockActor({
            toughnessBonus: 3,
            items: [makeTraitItem('Natural Armour', 5)],
        });
        const armour = computeArmour(actor);
        expect(armour['body']?.total).toBe(8);
        expect(armour['body']?.traitBonus).toBe(5);
        expect(armour['body']?.value).toBe(0);
    });

    it('Machine 4 + Natural Armour 5 DOES NOT STACK — picks higher (5), body total = TB 3 + 5 = 8', () => {
        const actor = mockActor({
            toughnessBonus: 3,
            items: [makeTraitItem('Machine', 4), makeTraitItem('Natural Armour', 5)],
        });
        const armour = computeArmour(actor);
        expect(armour['body']?.total).toBe(8);
        expect(armour['body']?.traitBonus).toBe(5);
    });

    it('Machine 6 + Natural Armour 3 — picks higher Machine (6), body total = TB 3 + 6 = 9', () => {
        const actor = mockActor({
            toughnessBonus: 3,
            items: [makeTraitItem('Machine', 6), makeTraitItem('Natural Armour', 3)],
        });
        const armour = computeArmour(actor);
        expect(armour['body']?.total).toBe(9);
        expect(armour['body']?.traitBonus).toBe(6);
    });

    it('Machine 4 + Natural Armour 5 + worn flak 4 — Natural wins trait slot, worn stacks: TB 3 + Natural 5 + AP 4 = 12', () => {
        const actor = mockActor({
            toughnessBonus: 3,
            items: [makeTraitItem('Machine', 4), makeTraitItem('Natural Armour', 5), makeWornArmourItem('Flak', 4)],
        });
        const armour = computeArmour(actor);
        expect(armour['body']?.total).toBe(12);
        expect(armour['body']?.traitBonus).toBe(5);
        expect(armour['body']?.value).toBe(4);
    });

    it('no traits, no armour — body total = TB only', () => {
        const actor = mockActor({ toughnessBonus: 4 });
        const armour = computeArmour(actor);
        expect(armour['body']?.total).toBe(4);
        expect(armour['body']?.traitBonus).toBe(0);
    });

    it('both `Natural Armor` (US spelling) and `Natural Armour` are recognised', () => {
        const actor = mockActor({
            toughnessBonus: 3,
            items: [makeTraitItem('Natural Armor', 4)],
        });
        const armour = computeArmour(actor);
        expect(armour['body']?.traitBonus).toBe(4);
    });
});
