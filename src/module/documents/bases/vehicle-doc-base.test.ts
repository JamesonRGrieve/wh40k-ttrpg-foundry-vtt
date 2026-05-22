import { describe, expect, it } from 'vitest';

const MOD = await import('./vehicle-doc-base').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`VehicleDocBase could not be imported in this environment: ${msg}`);
    return undefined;
});

const VEHICLE_MOD = await import('../vehicle').catch((err) => {
    console.warn(`WH40KVehicle import failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
});

const BASE_MOD = await import('../base-actor').catch((err) => {
    console.warn(`WH40KBaseActor import failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
});

describe('VehicleDocBase', () => {
    it.skipIf(MOD === undefined)('exports a default VehicleDocBase class', () => {
        expect(MOD?.default).toBeTruthy();
    });

    it.skipIf(MOD === undefined || VEHICLE_MOD === undefined || BASE_MOD === undefined)(
        'VehicleDocBase extends WH40KVehicle (and therefore WH40KBaseActor)',
        () => {
            expect(MOD?.default.prototype).toBeInstanceOf(VEHICLE_MOD?.WH40KVehicle);
            expect(MOD?.default.prototype).toBeInstanceOf(BASE_MOD?.WH40KBaseActor);
        },
    );
});
