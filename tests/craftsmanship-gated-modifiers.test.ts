/**
 * Unit coverage for craftsmanship-gated equipment bonuses (#432 follow-up).
 *
 * Some equipment grants a skill / characteristic test bonus ONLY at (or above) a
 * given craftsmanship tier — a Bionic Arm grants +10 Agility at Good and +10
 * Strength at Best; a Common arm grants neither. The gate lives in data as
 * `modifiers.craftsmanshipGated` entries and is resolved by the pure predicate in
 * `ow-craftsmanship.ts`; the creature aggregator (`_applyItemModifiers` →
 * `#collectCraftsmanshipGatedModifiers`) pushes each qualifying entry into the same
 * characteristic / skill modifier bucket a flat modifier would use, with the same
 * provenance.
 *
 * The gate DECISION is unit-tested here against the pure resolver rather than a
 * live actor, because instantiating the creature DataModel needs Foundry's field
 * runtime, which the unit environment does not provide (see
 * `item-modifier-templates.test.ts`). The resolver's output IS the exact set of
 * modifiers the aggregator applies, so "the creature gains +10 Strength at Good /
 * Best and 0 at Common / Poor" is precisely what these assertions prove.
 */

import { describe, expect, it } from 'vitest';
import { craftsmanshipMeetsGate, resolveCraftsmanshipGatedModifiers } from '../src/module/rules/ow-craftsmanship.ts';
import { readRepoFile } from './lib/repo-file.ts';

/** The spec's canonical entry: +10 Strength unlocked at Good craftsmanship. */
const STRENGTH_AT_GOOD = { target: 'characteristic', key: 'strength', value: 10, minCraftsmanship: 'good' } as const;

/** The modifier value the aggregator would apply for one key across the resolved entries. */
function appliedValue(entries: readonly { key?: string; value?: number }[], key: string): number {
    return entries.filter((entry) => entry.key === key).reduce((sum, entry) => sum + (entry.value ?? 0), 0);
}

describe('craftsmanship-gated modifiers (#432)', () => {
    describe('a creature owning a +10-Strength-at-Good item', () => {
        it.each(['good', 'best'] as const)('gains +10 Strength when the item is %s craftsmanship', (tier) => {
            expect(appliedValue(resolveCraftsmanshipGatedModifiers([STRENGTH_AT_GOOD], tier), 'strength')).toBe(10);
        });

        it.each(['common', 'poor'] as const)('gains 0 Strength when the item is %s craftsmanship', (tier) => {
            expect(appliedValue(resolveCraftsmanshipGatedModifiers([STRENGTH_AT_GOOD], tier), 'strength')).toBe(0);
        });

        it('gains 0 Strength when the item carries no craftsmanship (non-physical item)', () => {
            expect(appliedValue(resolveCraftsmanshipGatedModifiers([STRENGTH_AT_GOOD], undefined), 'strength')).toBe(0);
        });
    });

    describe('the tier-order gate predicate', () => {
        it('opens only at or above the gate tier (Poor < Common < Good < Best)', () => {
            expect(craftsmanshipMeetsGate('poor', 'good')).toBe(false);
            expect(craftsmanshipMeetsGate('common', 'good')).toBe(false);
            expect(craftsmanshipMeetsGate('good', 'good')).toBe(true);
            expect(craftsmanshipMeetsGate('best', 'good')).toBe(true);
            expect(craftsmanshipMeetsGate('best', 'best')).toBe(true);
            expect(craftsmanshipMeetsGate('good', 'best')).toBe(false);
        });

        it('never opens for an unresolvable tier (undefined item, non-canonical / blank gate)', () => {
            expect(craftsmanshipMeetsGate(undefined, 'good')).toBe(false);
            expect(craftsmanshipMeetsGate('exceptional', 'good')).toBe(false);
            expect(craftsmanshipMeetsGate('good', 'legendary')).toBe(false);
            expect(craftsmanshipMeetsGate('good', '')).toBe(false);
        });
    });

    describe('a single item with entries at different tiers (Bionic Arm)', () => {
        // +10 Agility at Good, +10 Strength at Best.
        const bionicArm = [
            { target: 'characteristic', key: 'agility', value: 10, minCraftsmanship: 'good' },
            { target: 'characteristic', key: 'strength', value: 10, minCraftsmanship: 'best' },
        ] as const;

        it('at Good: applies Agility only', () => {
            const applied = resolveCraftsmanshipGatedModifiers(bionicArm, 'good');
            expect(appliedValue(applied, 'agility')).toBe(10);
            expect(appliedValue(applied, 'strength')).toBe(0);
        });

        it('at Best: applies both Agility and Strength', () => {
            const applied = resolveCraftsmanshipGatedModifiers(bionicArm, 'best');
            expect(appliedValue(applied, 'agility')).toBe(10);
            expect(appliedValue(applied, 'strength')).toBe(10);
        });

        it('at Common: applies neither', () => {
            const applied = resolveCraftsmanshipGatedModifiers(bionicArm, 'common');
            expect(appliedValue(applied, 'agility')).toBe(0);
            expect(appliedValue(applied, 'strength')).toBe(0);
        });
    });

    it('a skill-target entry resolves the same way (Bionic Leg: +20 Athletics at Good)', () => {
        const bionicLeg = [{ target: 'skill', key: 'athletics', value: 20, minCraftsmanship: 'good' }] as const;
        expect(appliedValue(resolveCraftsmanshipGatedModifiers(bionicLeg, 'good'), 'athletics')).toBe(20);
        expect(appliedValue(resolveCraftsmanshipGatedModifiers(bionicLeg, 'common'), 'athletics')).toBe(0);
    });

    it('the creature aggregator wires the resolver into the characteristic/skill buckets', () => {
        // Guard the invisible wiring: the aggregator must both resolve the gate and
        // route qualifying entries through #collectCraftsmanshipGatedModifiers, the
        // same shape item-modifier-templates.test.ts guards for situational modifiers.
        const src = readRepoFile('src/module/data/actor/templates/creature.ts');
        expect(src, 'creature aggregator calls the pure gate resolver').toContain('resolveCraftsmanshipGatedModifiers');
        expect(src, 'creature aggregator declares the gated collector').toContain('#collectCraftsmanshipGatedModifiers');
    });
});
