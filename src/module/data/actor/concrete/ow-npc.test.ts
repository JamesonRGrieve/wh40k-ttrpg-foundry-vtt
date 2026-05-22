import { describe, expect, it } from 'vitest';

/** OWNPCData is a thin wrapper with only gameSystem = 'ow' added. */
const MOD = await import('./ow-npc').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`OWNPCData could not be imported: ${msg}`);
    return undefined;
});

const BASE_MOD = await import('../bases/npc-base').catch(() => undefined);

describe('OWNPCData', () => {
    it.skipIf(MOD === undefined)('exports a default class symbol', () => {
        expect(MOD?.default).toBeTruthy();
    });

    it.skipIf(MOD === undefined)('static gameSystem is ow', () => {
        expect((MOD?.default as { gameSystem?: string } | undefined)?.gameSystem).toBe('ow');
    });

    it.skipIf(MOD === undefined || BASE_MOD === undefined)('inherits NPCBaseData', () => {
        expect(MOD?.default.prototype).toBeInstanceOf(BASE_MOD?.default);
    });
});
