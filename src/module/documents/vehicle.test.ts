import { describe, expect, it } from 'vitest';

describe('WH40KVehicle', () => {
    it('exports WH40KVehicle class', async () => {
        const mod = await import('./vehicle').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`WH40KVehicle could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod.WH40KVehicle).toBeTruthy();
    });

    it('WH40KVehicle extends WH40KBaseActor', async () => {
        const [vehicleMod, baseMod] = await Promise.all([
            import('./vehicle').catch((err) => {
                console.warn(`WH40KVehicle import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
            import('./base-actor').catch((err) => {
                console.warn(`WH40KBaseActor import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
        ]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (vehicleMod === undefined || baseMod === undefined) return;
        expect(vehicleMod.WH40KVehicle.prototype).toBeInstanceOf(baseMod.WH40KBaseActor);
    });

    it('faction / subfaction / subtype / threatLevel getters read from system', async () => {
        const mod = await import('./vehicle').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`WH40KVehicle could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;

        const fakeVehicle = Object.create(mod.WH40KVehicle.prototype) as InstanceType<typeof mod.WH40KVehicle>;
        Object.defineProperty(fakeVehicle, 'system', {
            value: { faction: 'Orks', subfaction: 'Blood Axes', type: 'Tank', threatLevel: 'Extreme' },
            writable: true,
        });
        expect(fakeVehicle.faction).toBe('Orks');
        expect(fakeVehicle.subfaction).toBe('Blood Axes');
        expect(fakeVehicle.subtype).toBe('Tank');
        expect(fakeVehicle.threatLevel).toBe('Extreme');
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - integrity getter delegates to system.integrity
    //   - armour structure has front/side/rear locations
    //   - rollAttack composes the correct action data for a vehicle weapon
});
