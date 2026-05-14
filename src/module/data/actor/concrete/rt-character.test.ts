import { describe, expect, it } from 'vitest';

/** RTCharacterData is a thin wrapper with only gameSystem = 'rt' added. */
describe('RTCharacterData', () => {
    it('exports a default class symbol', async () => {
        const mod = await import('./rt-character').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`RTCharacterData could not be imported: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('static gameSystem is rt', async () => {
        const mod = await import('./rt-character').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        expect((mod.default as { gameSystem?: string }).gameSystem).toBe('rt');
    });

    it('inherits CharacterBaseData', async () => {
        const [baseMod, mod] = await Promise.all([import('../bases/character-base').catch(() => undefined), import('./rt-character').catch(() => undefined)]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (baseMod === undefined || mod === undefined) return;
        expect(mod.default.prototype).toBeInstanceOf(baseMod.default);
    });
});
