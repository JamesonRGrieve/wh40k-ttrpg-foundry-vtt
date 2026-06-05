import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../../testing/model-import.ts';

/**
 * Tests for CharacterBaseData.
 * CharacterBaseData is a re-export alias of CharacterData (backward-compat).
 * The inheritance chain is CharacterBaseData → CharacterData → CreatureTemplate.
 */
describe('CharacterBaseData', () => {
    it('exports a default class symbol', async () => {
        const mod = await importModelOrSkip(import('./character-base.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('inherits CharacterData as its parent class', async () => {
        const [charMod, baseMod] = await Promise.all([importModelOrSkip(import('../character.ts')), importModelOrSkip(import('./character-base.ts'))]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (charMod === undefined || baseMod === undefined) return;
        const CharacterData = charMod.default;
        const CharacterBaseData = baseMod.default;
        expect(CharacterBaseData.prototype).toBeInstanceOf(CharacterData);
    });

    it('_migrateData with empty source does not throw', async () => {
        const mod = await importModelOrSkip(import('./character-base.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const CharacterBaseData = mod.default;
        expect(() => CharacterBaseData._migrateData({})).not.toThrow();
    });

    it('mergeSchema is available as a static method via inheritance', async () => {
        const mod = await importModelOrSkip(import('./character-base.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const CharacterBaseData = mod.default;
        expect(typeof CharacterBaseData.mergeSchema).toBe('function');
    });
});
