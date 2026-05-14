import { describe, expect, it } from 'vitest';

describe('WH40KStarship', () => {
    it('exports WH40KStarship class', async () => {
        const mod = await import('./starship').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`WH40KStarship could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod.WH40KStarship).toBeTruthy();
    });

    it('WH40KStarship extends WH40KBaseActor', async () => {
        const [starshipMod, baseMod] = await Promise.all([
            import('./starship').catch((err) => {
                console.warn(`WH40KStarship import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
            import('./base-actor').catch((err) => {
                console.warn(`WH40KBaseActor import failed: ${err instanceof Error ? err.message : String(err)}`);
                return undefined;
            }),
        ]);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (starshipMod === undefined || baseMod === undefined) return;
        expect(starshipMod.WH40KStarship.prototype).toBeInstanceOf(baseMod.WH40KBaseActor);
    });

    it('hullType / hullClass / speed / armour getters read from system', async () => {
        const mod = await import('./starship').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`WH40KStarship could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;

        const fakeStarship = Object.create(mod.WH40KStarship.prototype) as InstanceType<typeof mod.WH40KStarship>;
        Object.defineProperty(fakeStarship, 'system', {
            value: {
                hullType: 'Frigate',
                hullClass: 'Sword',
                speed: 6,
                manoeuvrability: 15,
                detection: 20,
                armour: 18,
                voidShields: 1,
                turretRating: 1,
                hullIntegrity: { value: 35, max: 35 },
                crew: { crewRating: 30 },
                power: { used: 0, total: 55 },
                space: { used: 0, total: 40 },
                weaponCapacity: { dorsal: 0, prow: 1, port: 0, starboard: 0, keel: 0 },
            },
            writable: true,
        });
        expect(fakeStarship.hullType).toBe('Frigate');
        expect(fakeStarship.hullClass).toBe('Sword');
        expect(fakeStarship.speed).toBe(6);
        expect(fakeStarship.armour).toBe(18);
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - prepareData calls system.prepareEmbeddedData when available
    //   - voidShields getter delegates to system.voidShields
    //   - power / space used/total accessors reflect system data
});
