import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../../testing/model-import.ts';

/**
 * Tests for NPCBaseData.
 * NPCBaseData is a re-export alias of NPCData with no additional fields.
 */
describe('NPCBaseData', () => {
    it('exports a default class symbol', async () => {
        const mod = await importModelOrSkip(import('./npc-base.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('inherits NPCData as its parent class', async () => {
        const [npcMod, baseMod] = await Promise.all([importModelOrSkip(import('../npc.ts')), importModelOrSkip(import('./npc-base.ts'))]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (npcMod === undefined || baseMod === undefined) return;
        const NPCData = npcMod.default;
        const NPCBaseData = baseMod.default;
        expect(NPCBaseData.prototype).toBeInstanceOf(NPCData);
    });

    it('_toInt is inherited from NPCData', async () => {
        const mod = await importModelOrSkip(import('./npc-base.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const NPCBaseData = mod.default;
        // eslint-disable-next-line no-restricted-syntax -- boundary: test-only cast to inspect static property existence on class; read-only and test-scoped
        const cls = NPCBaseData as { _toInt?: (v: unknown, fallback?: number) => number };
        expect(typeof cls._toInt).toBe('function');
    });

    it('CHARACTERISTIC_MAP is inherited from NPCData', async () => {
        const mod = await importModelOrSkip(import('./npc-base.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const NPCBaseData = mod.default;
        const cls = NPCBaseData as { CHARACTERISTIC_MAP?: Record<string, string> };
        expect(typeof cls.CHARACTERISTIC_MAP).toBe('object');
    });

    it('_migrateData with empty source does not throw', async () => {
        const mod = await importModelOrSkip(import('./npc-base.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const NPCBaseData = mod.default;
        expect(() => NPCBaseData._migrateData({})).not.toThrow();
    });
});
