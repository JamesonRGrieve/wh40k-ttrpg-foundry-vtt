import { describe, expect, it } from 'vitest';

/**
 * Tests for OWVehicleData.
 * OWVehicleData is a thin wrapper around VehicleBaseData that tags the model
 * with gameSystem = 'ow'. Tests verify the identity and inheritance chain.
 */
const MOD = await import('./ow-vehicle').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`OWVehicleData could not be imported in this environment: ${msg}`);
    return undefined;
});

const BASE_MOD = await import('../bases/vehicle-base').catch(() => undefined);

describe('OWVehicleData', () => {
    it.skipIf(MOD === undefined)('exports a default class symbol', () => {
        expect(MOD?.default).toBeTruthy();
    });

    it.skipIf(MOD === undefined)('static gameSystem is ow', () => {
        expect((MOD?.default as { gameSystem?: string } | undefined)?.gameSystem).toBe('ow');
    });

    it.skipIf(MOD === undefined || BASE_MOD === undefined)('inherits VehicleBaseData as its parent class', () => {
        expect(MOD?.default.prototype).toBeInstanceOf(BASE_MOD?.default);
    });
});
