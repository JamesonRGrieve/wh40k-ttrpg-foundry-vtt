/**
 * Tests for the Profane Object registry (#96).
 *
 * Validates the shape of every canonical entry and the
 * `getProfaneObjectDefinition` accessor's handling of present /
 * missing / empty / null inputs.
 */

import { describe, expect, it } from 'vitest';
import { PROFANE_OBJECT_REGISTRY, getProfaneObjectDefinition, type ProfaneObjectDefinition } from './profane-objects.ts';

function assertWellFormed(definition: ProfaneObjectDefinition): void {
    expect(typeof definition.id).toBe('string');
    expect(definition.id.length).toBeGreaterThan(0);
    expect(typeof definition.label).toBe('string');
    expect(definition.label.length).toBeGreaterThan(0);

    if (definition.aura !== undefined) {
        expect(typeof definition.aura.radiusMetres).toBe('number');
        expect(definition.aura.radiusMetres).toBeGreaterThan(0);
        expect(typeof definition.aura.label).toBe('string');
        expect(Array.isArray(definition.aura.effects)).toBe(true);
        for (const effect of definition.aura.effects) {
            expect(typeof effect.key).toBe('string');
            expect(typeof effect.mode).toBe('number');
            expect(typeof effect.value).toBe('number');
        }
    }

    if (definition.hook !== undefined) {
        expect(typeof definition.hook.trigger).toBe('string');
        expect(typeof definition.hook.corruptionPerTrigger).toBe('number');
        expect(typeof definition.hook.insanityPerTrigger).toBe('number');
    }
}

describe('PROFANE_OBJECT_REGISTRY', () => {
    it('contains the four canonical sample objects', () => {
        expect(Object.keys(PROFANE_OBJECT_REGISTRY).sort()).toEqual([
            'eye-of-tzeentch',
            'foundation-stone-of-house-dane',
            'hammer-of-saint-lucillius',
            'libris-maleficarum',
        ]);
    });

    it('each entry has its slug matching its key', () => {
        for (const [key, def] of Object.entries(PROFANE_OBJECT_REGISTRY)) {
            expect(def.id).toBe(key);
        }
    });

    it('each entry is well-formed', () => {
        for (const def of Object.values(PROFANE_OBJECT_REGISTRY)) {
            assertWellFormed(def);
        }
    });

    it('Eye of Tzeentch is a psy-amplifier aura with a manifestPower hook', () => {
        const eye = PROFANE_OBJECT_REGISTRY['eye-of-tzeentch'];
        expect(eye).toBeDefined();
        expect(eye?.aura?.radiusMetres).toBe(10); // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard; eye could be undefined at runtime
        expect(eye?.hook?.trigger).toBe('manifestPower'); // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard
    });

    it('Libris Maleficarum has the highest corruption-per-trigger of the set', () => {
        const corruptions = Object.values(PROFANE_OBJECT_REGISTRY).map((def) => def.hook?.corruptionPerTrigger ?? 0);
        const libris = PROFANE_OBJECT_REGISTRY['libris-maleficarum'];
        expect(libris?.hook?.corruptionPerTrigger).toBe(Math.max(...corruptions)); // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard
    });
});

describe('getProfaneObjectDefinition', () => {
    it('returns the canonical definition for a known slug', () => {
        const def = getProfaneObjectDefinition('hammer-of-saint-lucillius');
        expect(def?.id).toBe('hammer-of-saint-lucillius');
        expect(def?.label).toBe('Hammer of Saint Lucillius');
    });

    it('returns undefined for an unknown slug', () => {
        expect(getProfaneObjectDefinition('not-a-real-object')).toBeUndefined();
    });

    it('returns undefined for an empty string', () => {
        expect(getProfaneObjectDefinition('')).toBeUndefined();
    });

    it('returns undefined for null or undefined input', () => {
        expect(getProfaneObjectDefinition(null)).toBeUndefined();
        expect(getProfaneObjectDefinition(undefined)).toBeUndefined();
    });
});
