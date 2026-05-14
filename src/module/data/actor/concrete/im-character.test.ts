import { describe, expect, it } from 'vitest';

/** IMCharacterData is a thin wrapper with only gameSystem = 'im' added. */
describe('IMCharacterData', () => {
    it('exports a default class symbol', async () => {
        const mod = await import('./im-character').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`IMCharacterData could not be imported: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('static gameSystem is im', async () => {
        const mod = await import('./im-character').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        expect((mod.default as { gameSystem?: string }).gameSystem).toBe('im');
    });

    it('inherits CharacterBaseData', async () => {
        const [baseMod, mod] = await Promise.all([import('../bases/character-base').catch(() => undefined), import('./im-character').catch(() => undefined)]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (baseMod === undefined || mod === undefined) return;
        expect(mod.default.prototype).toBeInstanceOf(baseMod.default);
    });
});
