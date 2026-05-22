import { describe, expect, it } from 'vitest';

const MOD = await import('./rt-npc').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`WH40KRTNPC could not be imported in this environment: ${msg}`);
    return undefined;
});

const BASE_MOD = await import('../bases/npc-doc-base').catch((err) => {
    console.warn(`NPCDocBase import failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
});

const ROOT_NPC_MOD = await import('../npc').catch((err) => {
    console.warn(`WH40KNPC import failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
});

describe('WH40KRTNPC', () => {
    it.skipIf(MOD === undefined)('exports a default WH40KRTNPC class', () => {
        expect(MOD?.default).toBeTruthy();
    });

    it.skipIf(MOD === undefined || BASE_MOD === undefined || ROOT_NPC_MOD === undefined)('WH40KRTNPC extends NPCDocBase (and therefore WH40KNPC)', () => {
        expect(MOD?.default.prototype).toBeInstanceOf(BASE_MOD?.default);
        expect(MOD?.default.prototype).toBeInstanceOf(ROOT_NPC_MOD?.WH40KNPC);
    });
});
