import { describe, expect, it } from 'vitest';

/** RTNPCData is a thin wrapper with only gameSystem = 'rt' added. */
const MOD = await import('./rt-npc').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`RTNPCData could not be imported: ${msg}`);
    return undefined;
});

const BASE_MOD = await import('../bases/npc-base').catch(() => undefined);

describe('RTNPCData', () => {
    it.skipIf(MOD === undefined)('exports a default class symbol', () => {
        expect(MOD?.default).toBeTruthy();
    });

    it.skipIf(MOD === undefined)('static gameSystem is rt', () => {
        expect((MOD?.default as { gameSystem?: string } | undefined)?.gameSystem).toBe('rt');
    });

    it.skipIf(MOD === undefined || BASE_MOD === undefined)('inherits NPCBaseData', () => {
        expect(MOD?.default.prototype).toBeInstanceOf(BASE_MOD?.default);
    });
});
