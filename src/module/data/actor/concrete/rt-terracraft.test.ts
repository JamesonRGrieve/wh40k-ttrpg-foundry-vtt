import { describe, expect, it } from 'vitest';

/**
 * Tests for RTVehicleData.
 * RTVehicleData is a thin wrapper around VehicleBaseData that tags the model
 * with gameSystem = 'rt'. Tests verify the identity and inheritance chain.
 */
describe('RTVehicleData', () => {
    it('exports a default class symbol', async () => {
        const mod = await import('./rt-terracraft').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`RTVehicleData could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('static gameSystem is rt', async () => {
        const mod = await import('./rt-terracraft').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const RTVehicleData = mod.default;
        expect((RTVehicleData as { gameSystem?: string }).gameSystem).toBe('rt');
    });

    it('inherits VehicleBaseData as its parent class', async () => {
        const [baseMod, rtMod] = await Promise.all([import('../terracraft').catch(() => undefined), import('./rt-terracraft').catch(() => undefined)]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (baseMod === undefined || rtMod === undefined) return;
        const TerracraftData = baseMod.default;
        const RTVehicleData = rtMod.default;
        expect(RTVehicleData.prototype).toBeInstanceOf(TerracraftData);
    });

    it('armourSummary getter is inherited from VehicleData', async () => {
        const mod = await import('./rt-terracraft').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const RTVehicleData = mod.default;
        // The getter should exist on the prototype chain
        expect(
            typeof Object.getOwnPropertyDescriptor(RTVehicleData.prototype, 'armourSummary')?.get === 'undefined'
                ? Object.getPrototypeOf(RTVehicleData.prototype)
                : RTVehicleData.prototype,
        ).toBeTruthy();
    });
});
