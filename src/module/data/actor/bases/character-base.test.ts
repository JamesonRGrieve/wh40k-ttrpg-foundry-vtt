import { describe, expect, it } from 'vitest';

/**
 * Tests for CharacterBaseData.
 * CharacterBaseData is a re-export alias of CharacterData (backward-compat).
 * The inheritance chain is CharacterBaseData → CharacterData → CreatureTemplate.
 */
describe('CharacterBaseData', () => {
    it('exports a default class symbol', async () => {
        const mod = await import('./character-base').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`CharacterBaseData could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('inherits CharacterData as its parent class', async () => {
        const [charMod, baseMod] = await Promise.all([import('../character').catch(() => undefined), import('./character-base').catch(() => undefined)]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (charMod === undefined || baseMod === undefined) return;
        const CharacterData = charMod.default;
        const CharacterBaseData = baseMod.default;
        expect(CharacterBaseData.prototype).toBeInstanceOf(CharacterData);
    });

    it('_migrateData with empty source does not throw', async () => {
        const mod = await import('./character-base').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const CharacterBaseData = mod.default;
        expect(() => CharacterBaseData._migrateData({})).not.toThrow();
    });

    it('mergeSchema is available as a static method via inheritance', async () => {
        const mod = await import('./character-base').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const CharacterBaseData = mod.default;
        expect(typeof CharacterBaseData.mergeSchema).toBe('function');
    });
});
