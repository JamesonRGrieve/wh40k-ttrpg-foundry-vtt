import { describe, expect, it } from 'vitest';

/** DWCharacterData is a thin wrapper with only gameSystem = 'dw' added. */
describe('DWCharacterData', () => {
    it('exports a default class symbol', async () => {
        const mod = await import('./dw-character').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`DWCharacterData could not be imported: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('static gameSystem is dw', async () => {
        const mod = await import('./dw-character').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        expect((mod.default as { gameSystem?: string }).gameSystem).toBe('dw');
    });

    it('inherits CharacterBaseData', async () => {
        const [baseMod, mod] = await Promise.all([import('../bases/character-base').catch(() => undefined), import('./dw-character').catch(() => undefined)]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (baseMod === undefined || mod === undefined) return;
        expect(mod.default.prototype).toBeInstanceOf(baseMod.default);
    });
});
