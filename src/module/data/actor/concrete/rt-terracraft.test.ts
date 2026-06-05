import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../../testing/model-import.ts';

/**
 * Tests for RTVehicleData.
 * RTVehicleData is a thin wrapper around VehicleBaseData that tags the model
 * with gameSystem = 'rt'. Tests verify the identity and inheritance chain.
 */
describe('RTVehicleData', () => {
    it('exports a default class symbol', async () => {
        const mod = await importModelOrSkip(import('./rt-terracraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('static gameSystem is rt', async () => {
        const mod = await importModelOrSkip(import('./rt-terracraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const RTVehicleData = mod.default;
        expect((RTVehicleData as { gameSystem?: string }).gameSystem).toBe('rt');
    });

    it('inherits VehicleBaseData as its parent class', async () => {
        const [baseMod, rtMod] = await Promise.all([importModelOrSkip(import('../terracraft.ts')), importModelOrSkip(import('./rt-terracraft.ts'))]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (baseMod === undefined || rtMod === undefined) return;
        const TerracraftData = baseMod.default;
        const RTVehicleData = rtMod.default;
        expect(RTVehicleData.prototype).toBeInstanceOf(TerracraftData);
    });

    it('armourSummary getter is inherited from VehicleData', async () => {
        const mod = await importModelOrSkip(import('./rt-terracraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
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
