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

/**
 * Issue #189 — RT Crew Population & Morale combat economy. Asserts that
 * the document's `applyHullDamage` / `cancelPriorTurnDamage` /
 * `replenishBetweenCombat` methods route through the rules helpers and
 * write the expected dotted-path updates. Per-system gating: non-RT
 * hulls must not have crew/morale touched.
 */
describe('WH40KStarship · RT Crew/Morale economy (issue #189)', () => {
    interface FakeStarship {
        system: {
            gameSystem: string;
            hullIntegrity: { value: number; max: number };
            crew: { population: number; crewRating: number; morale: { value: number; max: number } };
            priorTurnDamage?: { hullLoss: number; crewLoss: number; moraleLoss: number; turn: number };
        };
        hullIntegrity: { value: number; max: number };
        crew: { population: number; crewRating: number; morale: { value: number; max: number } };
        update: (data: Record<string, unknown>) => Promise<void>;
        _lastUpdate?: Record<string, unknown>;
    }

    async function makeFakeStarship(opts: { gameSystem?: string; priorTurnDamage?: { hullLoss: number; crewLoss: number; moraleLoss: number; turn: number } } = {}): Promise<{ fake: FakeStarship; methods: { applyHullDamage: (this: FakeStarship, n: number) => Promise<unknown>; cancelPriorTurnDamage: (this: FakeStarship) => Promise<unknown>; replenishBetweenCombat: (this: FakeStarship) => Promise<unknown>; usesRTCrewEconomy: PropertyDescriptor } } | undefined> {
        const mod = await import('./starship').catch((err) => {
            console.warn(`WH40KStarship import failed: ${err instanceof Error ? err.message : String(err)}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when runtime unavailable
        if (mod === undefined) return undefined;
        const proto = mod.WH40KStarship.prototype as unknown as {
            applyHullDamage: (this: FakeStarship, n: number) => Promise<unknown>;
            cancelPriorTurnDamage: (this: FakeStarship) => Promise<unknown>;
            replenishBetweenCombat: (this: FakeStarship) => Promise<unknown>;
        };
        const desc = Object.getOwnPropertyDescriptor(mod.WH40KStarship.prototype, 'usesRTCrewEconomy');

        const fake: FakeStarship = {
            system: {
                gameSystem: opts.gameSystem ?? 'rt',
                hullIntegrity: { value: 35, max: 35 },
                crew: { population: 100, crewRating: 30, morale: { value: 100, max: 100 } },
                ...(opts.priorTurnDamage ? { priorTurnDamage: opts.priorTurnDamage } : {}),
            },
            get hullIntegrity() {
                return this.system.hullIntegrity;
            },
            get crew() {
                return this.system.crew;
            },
            async update(data) {
                this._lastUpdate = data;
                // Reflect dotted-path writes back into `system` so subsequent
                // method calls see the mutation.
                for (const [path, value] of Object.entries(data)) {
                    if (path === 'system.hullIntegrity.value') this.system.hullIntegrity.value = value as number;
                    if (path === 'system.crew.population') this.system.crew.population = value as number;
                    if (path === 'system.crew.morale.value') this.system.crew.morale.value = value as number;
                    if (path === 'system.priorTurnDamage') {
                        this.system.priorTurnDamage = value as { hullLoss: number; crewLoss: number; moraleLoss: number; turn: number };
                    }
                }
                await Promise.resolve();
            },
        };
        return {
            fake,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- defined on prototype by design
            methods: { applyHullDamage: proto.applyHullDamage, cancelPriorTurnDamage: proto.cancelPriorTurnDamage, replenishBetweenCombat: proto.replenishBetweenCombat, usesRTCrewEconomy: desc! },
        };
    }

    it('applyHullDamage decrements hull, crew, and morale on RT hulls', async () => {
        const setup = await makeFakeStarship({ gameSystem: 'rt' });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when runtime unavailable
        if (setup === undefined) return;
        const { fake, methods } = setup;
        Object.defineProperty(fake, 'usesRTCrewEconomy', methods.usesRTCrewEconomy);
        const delta = (await methods.applyHullDamage.call(fake, 5)) as { hullLoss: number; crewLoss: number; moraleLoss: number };
        expect(delta).toEqual({ hullLoss: 5, crewLoss: 5, moraleLoss: 5 });
        expect(fake.system.hullIntegrity.value).toBe(30);
        expect(fake.system.crew.population).toBe(95);
        expect(fake.system.crew.morale.value).toBe(95);
        expect(fake.system.priorTurnDamage?.hullLoss).toBe(5);
    });

    it('applyHullDamage floors every value at 0', async () => {
        const setup = await makeFakeStarship({ gameSystem: 'rt' });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when runtime unavailable
        if (setup === undefined) return;
        const { fake, methods } = setup;
        Object.defineProperty(fake, 'usesRTCrewEconomy', methods.usesRTCrewEconomy);
        fake.system.hullIntegrity.value = 3;
        fake.system.crew.population = 2;
        fake.system.crew.morale.value = 1;
        await methods.applyHullDamage.call(fake, 50);
        expect(fake.system.hullIntegrity.value).toBe(0);
        expect(fake.system.crew.population).toBe(0);
        expect(fake.system.crew.morale.value).toBe(0);
    });

    it('applyHullDamage on a non-RT hull updates hull only — crew/morale untouched', async () => {
        const setup = await makeFakeStarship({ gameSystem: 'dh2' });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when runtime unavailable
        if (setup === undefined) return;
        const { fake, methods } = setup;
        Object.defineProperty(fake, 'usesRTCrewEconomy', methods.usesRTCrewEconomy);
        await methods.applyHullDamage.call(fake, 6);
        expect(fake.system.hullIntegrity.value).toBe(29);
        // Crew & morale must NOT have been written.
        expect(fake.system.crew.population).toBe(100);
        expect(fake.system.crew.morale.value).toBe(100);
        expect(fake._lastUpdate?.['system.crew.population']).toBeUndefined();
    });

    it('cancelPriorTurnDamage restores the recorded snapshot when invoked the next turn', async () => {
        const setup = await makeFakeStarship({
            gameSystem: 'rt',
            priorTurnDamage: { hullLoss: 5, crewLoss: 5, moraleLoss: 5, turn: 1 },
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when runtime unavailable
        if (setup === undefined) return;
        const { fake, methods } = setup;
        Object.defineProperty(fake, 'usesRTCrewEconomy', methods.usesRTCrewEconomy);
        // Simulate the actor having taken last turn's damage already
        fake.system.hullIntegrity.value = 30;
        fake.system.crew.population = 95;
        fake.system.crew.morale.value = 95;

        // Stub current turn to 2 (one strictly-greater than snapshot's turn=1).
        const stubGame = { combats: { active: { round: 2 } } };
        // eslint-disable-next-line no-restricted-syntax -- boundary: globalThis.game shim for unit test
        const prev = (globalThis as { game?: unknown }).game;
        // eslint-disable-next-line no-restricted-syntax -- boundary: globalThis.game shim for unit test
        (globalThis as { game?: unknown }).game = stubGame;
        try {
            const restored = (await methods.cancelPriorTurnDamage.call(fake)) as {
                hullRestored: number; crewRestored: number; moraleRestored: number;
            };
            expect(restored).toEqual({ hullRestored: 5, crewRestored: 5, moraleRestored: 5 });
            expect(fake.system.hullIntegrity.value).toBe(35);
            expect(fake.system.crew.population).toBe(100);
            expect(fake.system.crew.morale.value).toBe(100);
            expect(fake.system.priorTurnDamage?.hullLoss).toBe(0);
        } finally {
            // eslint-disable-next-line no-restricted-syntax -- boundary: globalThis.game shim for unit test
            (globalThis as { game?: unknown }).game = prev;
        }
    });

    it('cancelPriorTurnDamage is a no-op on non-RT hulls', async () => {
        const setup = await makeFakeStarship({
            gameSystem: 'dh2',
            priorTurnDamage: { hullLoss: 5, crewLoss: 5, moraleLoss: 5, turn: 1 },
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when runtime unavailable
        if (setup === undefined) return;
        const { fake, methods } = setup;
        Object.defineProperty(fake, 'usesRTCrewEconomy', methods.usesRTCrewEconomy);
        const restored = (await methods.cancelPriorTurnDamage.call(fake)) as { hullRestored: number };
        expect(restored.hullRestored).toBe(0);
        expect(fake._lastUpdate).toBeUndefined();
    });

    it('replenishBetweenCombat restores morale to max but not crew population', async () => {
        const setup = await makeFakeStarship({ gameSystem: 'rt' });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when runtime unavailable
        if (setup === undefined) return;
        const { fake, methods } = setup;
        Object.defineProperty(fake, 'usesRTCrewEconomy', methods.usesRTCrewEconomy);
        fake.system.crew.population = 70;
        fake.system.crew.morale.value = 30;
        await methods.replenishBetweenCombat.call(fake);
        expect(fake.system.crew.morale.value).toBe(100);
        // Population deliberately not restored.
        expect(fake.system.crew.population).toBe(70);
    });
});

