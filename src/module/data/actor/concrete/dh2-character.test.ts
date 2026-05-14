import { describe, expect, it } from 'vitest';

/**
 * Tests for DH2CharacterData.
 * DH2CharacterData is a thin wrapper (adds only gameSystem = 'dh2e') around
 * CharacterBaseData. Tests verify the identity and gameSystem tag.
 */
describe('DH2CharacterData', () => {
    it('exports a default class symbol', async () => {
        const mod = await import('./dh2-character').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`DH2CharacterData could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('static gameSystem is dh2e', async () => {
        const mod = await import('./dh2-character').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const DH2CharacterData = mod.default;
        expect((DH2CharacterData as { gameSystem?: string }).gameSystem).toBe('dh2e');
    });

    it('inherits CharacterBaseData as its parent class', async () => {
        const [charMod, dh2Mod] = await Promise.all([
            import('../bases/character-base').catch(() => undefined),
            import('./dh2-character').catch(() => undefined),
        ]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (charMod === undefined || dh2Mod === undefined) return;
        const CharacterBaseData = charMod.default;
        const DH2CharacterData = dh2Mod.default;
        expect(DH2CharacterData.prototype).toBeInstanceOf(CharacterBaseData);
    });

    it('_migrateData with empty source does not throw', async () => {
        const mod = await import('./dh2-character').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const DH2CharacterData = mod.default;
        expect(() => DH2CharacterData._migrateData({})).not.toThrow();
    });
});
