/**
 * Tests for the skill test-variant compendium index (#440).
 *
 * The bug this guards: a character's skills live in `system.skills` (a SchemaField
 * built from SKILL_DEFINITIONS), not as embedded Items, so the roll dialog's
 * owned-Item lookup found nothing and the sense-channel selector never rendered
 * even with `awarenessSenseSplit` on and the Awareness variants correctly authored
 * in the pack. Variants now come from the compendium, keyed by the actor's skill key.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { getSkillVariantsForKey, normalizeSkillKey, setSkillVariantsForTesting } from './skill-variant-index.ts';
import type { SkillVariant } from './skill-variants.ts';

const AWARENESS: SkillVariant[] = [
    { name: 'Visual', description: 'sight', blockedBy: 'blinded' },
    { name: 'Auditory', description: 'hearing', blockedBy: 'deafened' },
    { name: 'Olfactory', description: 'smell', blockedBy: '' },
];

describe('normalizeSkillKey', () => {
    it('collapses every spelling of a skill to one comparison key', () => {
        // The actor key is camelCase, the pack doc's name is spaced Title Case, and
        // Foundry derives a kebab identifier in Item#_preCreate. All must collide.
        expect(normalizeSkillKey('sleightOfHand')).toBe('sleightofhand');
        expect(normalizeSkillKey('Sleight of Hand')).toBe('sleightofhand');
        expect(normalizeSkillKey('sleight-of-hand')).toBe('sleightofhand');
        expect(normalizeSkillKey('Awareness')).toBe('awareness');
    });

    it('returns an empty key for input with no alphanumerics', () => {
        expect(normalizeSkillKey('  -- ')).toBe('');
    });
});

describe('getSkillVariantsForKey', () => {
    beforeEach(() => {
        setSkillVariantsForTesting({ Awareness: AWARENESS });
    });

    it('resolves the actor camelCase skill key against the pack document name', () => {
        // This is the exact lookup the dialog performs: rollKey 'awareness' must
        // find the variants authored on the pack doc named 'Awareness'.
        expect(getSkillVariantsForKey('awareness')).toEqual(AWARENESS);
    });

    it('resolves regardless of separator or case', () => {
        setSkillVariantsForTesting({ 'Sleight of Hand': AWARENESS });
        expect(getSkillVariantsForKey('sleightOfHand')).toEqual(AWARENESS);
        expect(getSkillVariantsForKey('sleight-of-hand')).toEqual(AWARENESS);
    });

    it('returns [] for a skill that declares no variants', () => {
        expect(getSkillVariantsForKey('carouse')).toEqual([]);
    });

    it('returns [] for an empty or punctuation-only key rather than matching everything', () => {
        expect(getSkillVariantsForKey('')).toEqual([]);
        expect(getSkillVariantsForKey('---')).toEqual([]);
    });

    it('prefers the system-scoped entry and falls back cross-system', () => {
        const dh2Only: SkillVariant[] = [{ name: 'Visual', description: 'dh2', blockedBy: 'blinded' }];
        setSkillVariantsForTesting({ Awareness: dh2Only }, 'dh2');
        expect(getSkillVariantsForKey('awareness', 'dh2')).toEqual(dh2Only);
        // rt authors none; the flat fallback still resolves so the selector works
        // on lines that share the FFG skill list.
        expect(getSkillVariantsForKey('awareness', 'rt')).toEqual(dh2Only);
    });
});
