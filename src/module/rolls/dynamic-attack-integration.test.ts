import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DynamicModifierEntry } from '../data/shared/modifiers-template.ts';
import type { DynamicModifierItemLike } from '../rules/dynamic-modifiers.ts';
import { RollData, WeaponRollData } from './roll-data.ts';

// The assembler runs three unrelated attack-bonus calculators before merging, each
// of which walks a fully-populated weapon. They are neutralised so this exercises
// the merge itself rather than becoming a weapon-construction fixture — the merge
// is the step that was missing, so it needs a guard that fails without it.
vi.mock('../rules/ammo.ts', async (orig) => ({ ...(await orig<object>()), calculateAmmoAttackBonuses: vi.fn() }));
vi.mock('../rules/attack-specials.ts', async (orig) => ({ ...(await orig<object>()), calculateAttackSpecialAttackBonuses: vi.fn() }));
vi.mock('../rules/weapon-modifiers.ts', async (orig) => ({ ...(await orig<object>()), calculateWeaponModifiersAttackBonuses: vi.fn() }));

/**
 * The to-hit half of the dynamic-modifier channel (#519).
 *
 * #518 made the `vsType` / `vsFaction` / `vsAlignment` conditions reachable, but
 * the resulting components were still discarded: the only two collectors filtered
 * to damage/penetration and critReduction, so a hook targeting `attack` evaluated
 * its trigger correctly and then vanished. These tests cover the consumption side.
 *
 * Every assertion is on a modifier that MUST BE PRESENT with a specific value.
 * That is deliberate: the defect being guarded here is silent non-application, and
 * an assertion like `expect(mods['X']).toBeUndefined()` would have passed both
 * before and after the fix. A test that cannot fail when the wiring is removed is
 * how this class of bug survived in the first place (#514, #516, #517).
 */

/** Value a firing hook contributes, distinctive enough to be unmistakable in a total. */
const HOOK_VALUE = 17;

/** Build a complete `scale` descriptor with overrides. */
function scale(o: Partial<DynamicModifierEntry['scale']> = {}): DynamicModifierEntry['scale'] {
    return { source: '', field: 'bonus', factor: 1, round: 'up', multiplier: '', min: null, max: null, ...o };
}

/** Build a complete {@link DynamicModifierEntry}, defaulting to an attacker-side additive `attack` hook. */
function makeHook(overrides: Partial<DynamicModifierEntry> = {}): DynamicModifierEntry {
    return {
        target: 'attack',
        targetKey: '',
        side: 'attacker',
        mode: 'add',
        value: HOOK_VALUE,
        valueFormula: '',
        scale: scale(),
        when: 'always',
        condition: '',
        conditionValue: '',
        duration: {
            unit: 'instant',
            value: 0,
            valueFormula: '',
            sustained: false,
            upkeep: '',
            stacking: 'none',
            save: { characteristic: '', difficulty: 0 },
            aftereffect: { target: 'characteristic', targetKey: '', value: 0, valueFormula: '', durationUnit: 'instant', durationValue: 0 },
        },
        formula: '',
        label: '',
        ...overrides,
    };
}

/** An owned item exposing the given hooks. */
function item(name: string, hooks: DynamicModifierEntry[]): DynamicModifierItemLike {
    return { name, system: { modifiers: { dynamicModifiers: hooks } } };
}

/** An owned item with a per-character `(X)` pick, as a specialist talent carries. */
function specialistItem(name: string, specialization: string, hooks: DynamicModifierEntry[]): DynamicModifierItemLike {
    return { name, system: { modifiers: { dynamicModifiers: hooks }, specialization } };
}

/** A target actor carrying the given creature traits, as `collectTargetTags` reads them. */
function target(traits: string[]): object {
    return { type: 'dh2-npc', system: { nature: 'none' }, items: traits.map((name) => ({ type: 'trait', name })) };
}

/**
 * A RollData with only the fields the attack collector reads.
 *
 * Bypasses the WH40K-config constructor via `Object.create`, the same seam
 * `roll-data.test.ts` uses to unit-test a single method.
 * @param {DynamicModifierItemLike[]} items  The attacker's owned items.
 * @param {object | null} targetActor  The declared target, or null for none.
 * @returns {RollData}  A minimally-populated roll.
 */
function makeRoll(items: DynamicModifierItemLike[], targetActor: object | null): RollData {
    // eslint-disable-next-line no-restricted-syntax -- test: bypass the config-heavy constructor to exercise one method
    const rd = Object.create(RollData.prototype) as RollData;
    // eslint-disable-next-line no-restricted-syntax -- test: minimal structural stand-in for the acting actor
    rd.sourceActor = { items, getCharacteristicFuzzy: () => ({ bonus: 4 }) } as unknown as RollData['sourceActor'];
    // eslint-disable-next-line no-restricted-syntax -- test: minimal structural stand-in for the target actor
    rd.targetActor = targetActor as unknown as RollData['targetActor'];
    rd.modifiers = {};
    rd.specialModifiers = {};
    rd.dynamicAttackModifiers = {};
    rd.action = 'Standard Attack';
    rd.rangeBracket = '';
    rd.rangeBonus = 0;
    return rd;
}

describe('dynamic to-hit modifiers reach the roll (#519)', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('applies an unconditional attacker-side attack hook', async () => {
        const rd = makeRoll([item('Deadeye Shot', [makeHook()])], null);
        await rd.applyDynamicAttackModifiers();
        // Present with its value — not merely "no error".
        expect(rd.dynamicAttackModifiers).toEqual({ 'Deadeye Shot': HOOK_VALUE });
    });

    it('applies a vsType hook when the target carries the trait — the case #518 could evaluate but not deliver', async () => {
        const rd = makeRoll([item('Daemonbane', [makeHook({ condition: 'vsType', conditionValue: 'daemonic' })])], target(['Daemonic']));
        await rd.applyDynamicAttackModifiers();
        expect(rd.dynamicAttackModifiers).toEqual({ Daemonbane: HOOK_VALUE });
    });

    it('does not apply a vsType hook against a target lacking the trait', async () => {
        const rd = makeRoll([item('Daemonbane', [makeHook({ condition: 'vsType', conditionValue: 'daemonic' })])], target(['Machine']));
        await rd.applyDynamicAttackModifiers();
        expect(rd.dynamicAttackModifiers).toEqual({});
    });

    it('ignores hooks aimed at other targets, so damage hooks do not leak onto the to-hit test', async () => {
        const rd = makeRoll([item('Crushing Blow', [makeHook({ target: 'damage' })])], null);
        await rd.applyDynamicAttackModifiers();
        expect(rd.dynamicAttackModifiers).toEqual({});
    });

    it('ignores defender-side hooks', async () => {
        const rd = makeRoll([item('Hard to Hit', [makeHook({ side: 'defender' })])], null);
        await rd.applyDynamicAttackModifiers();
        expect(rd.dynamicAttackModifiers).toEqual({});
    });

    it('sums two hooks sharing a label rather than letting one overwrite the other', async () => {
        const rd = makeRoll([item('Twin Blessing', [makeHook(), makeHook()])], null);
        await rd.applyDynamicAttackModifiers();
        expect(rd.dynamicAttackModifiers).toEqual({ 'Twin Blessing': HOOK_VALUE * 2 });
    });

    it('keys by the hook label when one is authored, so the card names the effect not the item', async () => {
        const rd = makeRoll([item('Sanctified Bolt Shells', [makeHook({ label: 'Blessed Ammunition' })])], null);
        await rd.applyDynamicAttackModifiers();
        expect(rd.dynamicAttackModifiers).toEqual({ 'Blessed Ammunition': HOOK_VALUE });
    });

    it('merges the collected modifiers into the assembled weapon-roll target', async () => {
        // eslint-disable-next-line no-restricted-syntax -- test: bypass the config-heavy constructor to exercise one method
        const rd = Object.create(WeaponRollData.prototype) as WeaponRollData;
        Object.assign(rd, makeRoll([item('Deadeye Shot', [makeHook()])], null));
        // The assembler runs the ammo / special / weapon-mod calculators first, and
        // each dereferences the weapon, so it needs a stand-in with empty slots.
        // eslint-disable-next-line no-restricted-syntax -- test: minimal structural stand-in for the weapon those calculators read
        rd.weapon = { system: {}, isRanged: true, isMelee: false } as unknown as WeaponRollData['weapon'];
        rd.attackSpecials = [];
        rd.weaponModifiers = {};
        await rd.applyDynamicAttackModifiers();
        // The merge is the actual delivery: collecting without merging would leave
        // the roll unchanged, which is exactly the pre-fix behaviour.
        expect(rd.assembleFinalModifiers()['Deadeye Shot']).toBe(HOOK_VALUE);
    });

    it('applies to psychic rolls too, not only weapon rolls', async () => {
        // Scoping the collector to the weapon subclass would leave a hook working on
        // a bolter and silently inert on a smite — the same invisible gap as #518.
        const rd = makeRoll([item('Daemonbane', [makeHook({ condition: 'vsType', conditionValue: 'daemonic' })])], target(['Daemonic']));
        await rd.applyDynamicAttackModifiers();
        expect(rd.dynamicAttackModifiers).toEqual({ Daemonbane: HOOK_VALUE });
    });

    it('is a no-op for an actor with no items, rather than throwing', async () => {
        const rd = makeRoll([], null);
        await rd.applyDynamicAttackModifiers();
        expect(rd.dynamicAttackModifiers).toEqual({});
    });
});

/**
 * `vsSpecialization` — the condition that made Hatred authorable (#514).
 *
 * A specialist talent is ONE compendium document whose `(X)` is chosen per
 * character, so a hook cannot carry a static `conditionValue`. This condition
 * tests the target against the owned item's own specialisation instead, which is
 * what let `rules/hatred.ts` — a name-matcher in `src/` — be deleted rather than
 * wired.
 */
describe('vsSpecialization condition (#514, replaces rules/hatred.ts)', () => {
    /** The hook exactly as authored on the Hatred talents in `src/packs`. */
    const hatredHook = makeHook({ target: 'attack', condition: 'vsSpecialization', value: 10 });

    it('fires when the target carries a trait matching the character’s pick', async () => {
        const rd = makeRoll([specialistItem('Hatred', 'Daemons', [hatredHook])], target(['Daemonic']));
        await rd.applyDynamicAttackModifiers();
        // The printed specialisation is plural ("Daemons") and the trait is
        // adjectival ("Daemonic"); matching on the stem is what bridges them.
        expect(rd.dynamicAttackModifiers).toEqual({ Hatred: 10 });
    });

    it('does not fire against a target outside the pick', async () => {
        const rd = makeRoll([specialistItem('Hatred', 'Daemons', [hatredHook])], target(['Machine']));
        await rd.applyDynamicAttackModifiers();
        expect(rd.dynamicAttackModifiers).toEqual({});
    });

    it('distinguishes two characters with different picks of the same talent', async () => {
        const orkHater = makeRoll([specialistItem('Hatred', 'Orks', [hatredHook])], target(['Daemonic']));
        await orkHater.applyDynamicAttackModifiers();
        expect(orkHater.dynamicAttackModifiers).toEqual({});

        const daemonHater = makeRoll([specialistItem('Hatred', 'Daemons', [hatredHook])], target(['Daemonic']));
        await daemonHater.applyDynamicAttackModifiers();
        expect(daemonHater.dynamicAttackModifiers).toEqual({ Hatred: 10 });
    });

    it('matches the other canonical specialisations from the printed list', async () => {
        for (const [pick, trait] of [
            ['Mutants', 'Mutant'],
            ['Psykers', 'Psyker'],
            ['Xenos', 'Xenos'],
        ] as const) {
            const rd = makeRoll([specialistItem('Hatred', pick, [hatredHook])], target([trait]));
            // eslint-disable-next-line no-await-in-loop -- sequential: each pick is asserted independently
            await rd.applyDynamicAttackModifiers();
            expect(rd.dynamicAttackModifiers, `${pick} vs ${trait}`).toEqual({ Hatred: 10 });
        }
    });

    it('does not fire when the character never chose a specialisation', async () => {
        const rd = makeRoll([specialistItem('Hatred', '', [hatredHook])], target(['Daemonic']));
        await rd.applyDynamicAttackModifiers();
        expect(rd.dynamicAttackModifiers).toEqual({});
    });
});
