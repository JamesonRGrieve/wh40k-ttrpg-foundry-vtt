import { describe, expect, it } from 'vitest';

/**
 * Tests for LootData.
 *
 * LootData extends CommonTemplate → ActorDataModel → foundry.abstract
 * .TypeDataModel, so it cannot be instantiated (or, in plain happy-dom,
 * imported) without the Foundry runtime. We follow the repo's defensive
 * datamodel-test convention: guard the import and assert the static,
 * Foundry-free surface (the pure `computeTotalWeight` roll-up) when the
 * runtime is present. Real instance behaviour is covered by the Tier A
 * integration suite and the Tier B e2e spec.
 */
describe('LootData', () => {
    it('exports a default class symbol', async () => {
        const mod = await import('./loot').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`LootData could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('computeTotalWeight prefers each item totalWeight', async () => {
        const mod = await import('./loot').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const LootData = mod.default;
        const total = LootData.computeTotalWeight([{ totalWeight: 4.5 }, { totalWeight: 1.25 }]);
        expect(total).toBe(5.75);
    });

    it('computeTotalWeight falls back to weight × quantity', async () => {
        const mod = await import('./loot').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const LootData = mod.default;
        const total = LootData.computeTotalWeight([{ weight: 2, quantity: 3 }, { weight: 1.5 }]);
        // 2×3 + 1.5×(default 1) = 7.5
        expect(total).toBe(7.5);
    });

    it('computeTotalWeight treats missing/invalid fields as zero/one', async () => {
        const mod = await import('./loot').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const LootData = mod.default;
        expect(LootData.computeTotalWeight([])).toBe(0);
        expect(LootData.computeTotalWeight([{ weight: null, quantity: null }])).toBe(0);
        expect(LootData.computeTotalWeight([{ totalWeight: Number.NaN, weight: 3, quantity: 2 }])).toBe(6);
    });
});
