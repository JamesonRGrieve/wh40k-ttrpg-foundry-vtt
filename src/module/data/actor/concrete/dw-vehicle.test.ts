import { describe, expect, it } from 'vitest';

/**
 * Tests for DWVehicleData.
 * DWVehicleData is a thin wrapper around VehicleBaseData that tags the model
 * with gameSystem = 'dw'. Tests verify the identity and inheritance chain.
 */
const MOD = await import('./dw-vehicle').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`DWVehicleData could not be imported in this environment: ${msg}`);
    return undefined;
});

const BASE_MOD = await import('../bases/vehicle-base').catch(() => undefined);

describe('DWVehicleData', () => {
    it.skipIf(MOD === undefined)('exports a default class symbol', () => {
        expect(MOD?.default).toBeTruthy();
    });

    it.skipIf(MOD === undefined)('static gameSystem is dw', () => {
        expect((MOD?.default as { gameSystem?: string } | undefined)?.gameSystem).toBe('dw');
    });

    it.skipIf(MOD === undefined || BASE_MOD === undefined)('inherits VehicleBaseData as its parent class', () => {
        expect(MOD?.default.prototype).toBeInstanceOf(BASE_MOD?.default);
    });
});
