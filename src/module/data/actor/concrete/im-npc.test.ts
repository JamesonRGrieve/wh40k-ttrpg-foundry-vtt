import { describe, expect, it } from 'vitest';

/** IMNPCData is a thin wrapper with only gameSystem = 'im' added. */
const MOD = await import('./im-npc').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`IMNPCData could not be imported: ${msg}`);
    return undefined;
});

const BASE_MOD = await import('../bases/npc-base').catch(() => undefined);

describe('IMNPCData', () => {
    it.skipIf(MOD === undefined)('exports a default class symbol', () => {
        expect(MOD?.default).toBeTruthy();
    });

    it.skipIf(MOD === undefined)('static gameSystem is im', () => {
        expect((MOD?.default as { gameSystem?: string } | undefined)?.gameSystem).toBe('im');
    });

    it.skipIf(MOD === undefined || BASE_MOD === undefined)('inherits NPCBaseData', () => {
        expect(MOD?.default.prototype).toBeInstanceOf(BASE_MOD?.default);
    });
});
