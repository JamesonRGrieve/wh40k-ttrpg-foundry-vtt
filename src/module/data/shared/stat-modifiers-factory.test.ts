/**
 * Unit tests for the shared stat-modifier factory (#346).
 *
 * `hasModifiers` / `modifiersList` are pure functions over a keyed numeric map,
 * so they are exercised directly with a stubbed `game.i18n`. `schema()`
 * constructs `foundry.data.fields.*` instances, so it is exercised against a
 * recording stub of those globals (installed for that test only) — no live
 * Foundry runtime.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStatModifiers } from './stat-modifiers-factory.ts';

const KEYS = ['speed', 'armour', 'integrity'] as const;

describe('makeStatModifiers (#346)', () => {
    beforeEach(() => {
        vi.stubGlobal('game', { i18n: { localize: (k: string) => k } });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('hasModifiers is false when every stat is zero, true when any is non-zero', () => {
        const { hasModifiers } = makeStatModifiers(KEYS, 'WH40K.Test');
        expect(hasModifiers({ speed: 0, armour: 0, integrity: 0 })).toBe(false);
        expect(hasModifiers({ speed: 0, armour: 0, integrity: -1 })).toBe(true);
    });

    it('modifiersList emits only non-zero stats with capitalized localized labels (no formatted by default)', () => {
        const { modifiersList } = makeStatModifiers(KEYS, 'WH40K.Test');
        expect(modifiersList({ speed: 2, armour: 0, integrity: -1 })).toEqual([
            { key: 'speed', label: 'WH40K.Test.Speed', value: 2 },
            { key: 'integrity', label: 'WH40K.Test.Integrity', value: -1 },
        ]);
    });

    it('modifiersList adds a signed formatted string when includeFormatted is set (vehicle path)', () => {
        const { modifiersList } = makeStatModifiers(KEYS, 'WH40K.Test', { includeFormatted: true });
        expect(modifiersList({ speed: 2, armour: 0, integrity: -1 })).toEqual([
            { key: 'speed', label: 'WH40K.Test.Speed', value: 2, formatted: '+2' },
            { key: 'integrity', label: 'WH40K.Test.Integrity', value: -1, formatted: '-1' },
        ]);
    });

    it('schema builds one integer NumberField per key inside a SchemaField', () => {
        // Recording stand-ins for the two field ctors schema() constructs.
        class RecNumberField {
            constructor(readonly options: unknown) {}
        }
        class RecSchemaField {
            constructor(readonly block: Record<string, RecNumberField>) {}
        }
        const G = globalThis as { foundry?: unknown };
        const originalFoundry = G.foundry;
        G.foundry = { data: { fields: { NumberField: RecNumberField, SchemaField: RecSchemaField } } };
        try {
            const result = makeStatModifiers(KEYS, 'WH40K.Test').schema() as unknown as RecSchemaField;
            expect(Object.keys(result.block)).toEqual([...KEYS]);
            for (const [, field] of Object.entries(result.block)) {
                expect(field.options).toEqual({ required: true, initial: 0, integer: true });
            }
        } finally {
            G.foundry = originalFoundry;
        }
    });
});
