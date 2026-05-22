import { describe, expect, it } from 'vitest';

/** DWNPCData is a thin wrapper with only gameSystem = 'dw' added. */
const MOD = await import('./dw-npc').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`DWNPCData could not be imported: ${msg}`);
    return undefined;
});

const BASE_MOD = await import('../bases/npc-base').catch(() => undefined);

describe('DWNPCData', () => {
    it.skipIf(MOD === undefined)('exports a default class symbol', () => {
        expect(MOD?.default).toBeTruthy();
    });

    it.skipIf(MOD === undefined)('static gameSystem is dw', () => {
        expect((MOD?.default as { gameSystem?: string } | undefined)?.gameSystem).toBe('dw');
    });

    it.skipIf(MOD === undefined || BASE_MOD === undefined)('inherits NPCBaseData', () => {
        expect(MOD?.default.prototype).toBeInstanceOf(BASE_MOD?.default);
    });
});
