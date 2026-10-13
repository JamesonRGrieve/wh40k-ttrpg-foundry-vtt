import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShipEffectView } from '../rules/ship-action-effects.ts';
import { importModelOrSkip } from '../testing/model-import.ts';

/**
 * Issue #196 — ship initiative must resolve through Foundry's combat tracker
 * (which is also the RT strategic-round counter, read as
 * `game.combats.active.round`), not as a standalone chat card. These tests pin
 * the delegation contract: `WH40KVoidcraft.rollInitiative` forwards to
 * `Actor#rollInitiative` with combatant creation on, and attaches a flavour
 * that carries the Detection Bonus provenance.
 */
describe('WH40KVoidcraft · initiative → combat tracker (issue #196)', () => {
    /** Args captured from the delegated `super.rollInitiative` call. */
    interface CapturedOptions {
        createCombatants?: boolean;
        rerollInitiative?: boolean;
        initiativeOptions?: { messageOptions?: { flavor?: string } };
    }

    /** Stand-in for the Combat the real `Actor#rollInitiative` resolves to. */
    interface CombatStub {
        readonly id: string;
    }
    const COMBAT_SENTINEL: CombatStub = { id: 'combat' };

    /** Structural surface `rollInitiative` reaches into on `this`. */
    interface FakeVoidcraft {
        detectionBonus: number;
        rollInitiative: (options?: CapturedOptions) => Promise<CombatStub>;
    }

    /**
     * The single super-prototype method the tests swap out. The member is
     * explicitly `| undefined` so restoring an absent original satisfies
     * `exactOptionalPropertyTypes`.
     */
    interface SuperPrototype {
        rollInitiative?: ((options?: CapturedOptions) => Promise<CombatStub>) | undefined;
    }

    let restoreSuper: (() => void) | undefined;

    afterEach(() => {
        restoreSuper?.();
        restoreSuper = undefined;
        vi.unstubAllGlobals();
    });

    async function setup(): Promise<{ fake: FakeVoidcraft; captured: () => CapturedOptions | undefined } | undefined> {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return undefined;

        vi.stubGlobal('game', {
            i18n: {
                // `t()` stringifies params before delegating to game.i18n.format.
                format: (key: string, data: { bonus: string }) => `${key}:${data.bonus}`,
            },
        });

        // `super.rollInitiative` resolves off the class's [[HomeObject]]
        // prototype — WH40KBaseActor.prototype — so the stub goes there.
        const superProto = Object.getPrototypeOf(mod.WH40KVoidcraft.prototype) as SuperPrototype;
        const had = Object.prototype.hasOwnProperty.call(superProto, 'rollInitiative');
        const previous = superProto.rollInitiative;
        let seen: CapturedOptions | undefined;
        superProto.rollInitiative = async function stub(options?: CapturedOptions): Promise<CombatStub> {
            seen = options;
            await Promise.resolve();
            return COMBAT_SENTINEL;
        };
        restoreSuper = () => {
            if (had) superProto.rollInitiative = previous;
            else delete superProto.rollInitiative;
        };

        const fake = Object.create(mod.WH40KVoidcraft.prototype) as FakeVoidcraft;
        fake.detectionBonus = 4;
        return { fake, captured: () => seen };
    }

    it('delegates to Actor#rollInitiative and creates the combatant', async () => {
        const ctx = await setup();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (ctx === undefined) return;

        const result = await ctx.fake.rollInitiative();
        expect(result).toBe(COMBAT_SENTINEL);
        expect(ctx.captured()?.createCombatants).toBe(true);
    });

    it('attaches a flavour carrying the Detection Bonus provenance', async () => {
        const ctx = await setup();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (ctx === undefined) return;

        await ctx.fake.rollInitiative();
        expect(ctx.captured()?.initiativeOptions?.messageOptions?.flavor).toBe('WH40K.Voidcraft.Combat.InitiativeFlavor:4');
    });

    it('does not pass an explicit formula — the Combatant resolves it', async () => {
        const ctx = await setup();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (ctx === undefined) return;

        await ctx.fake.rollInitiative();
        // A hard-coded formula here would bypass WH40KCombatant, so tracker-driven
        // "roll all" would silently use the wrong (characteristic) formula.
        expect(ctx.captured()?.initiativeOptions).not.toHaveProperty('formula');
    });

    it('lets callers override createCombatants and rerollInitiative', async () => {
        const ctx = await setup();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (ctx === undefined) return;

        await ctx.fake.rollInitiative({ createCombatants: false, rerollInitiative: true });
        expect(ctx.captured()?.createCombatants).toBe(false);
        expect(ctx.captured()?.rerollInitiative).toBe(true);
        // The flavour survives a caller-supplied options bag.
        expect(ctx.captured()?.initiativeOptions?.messageOptions?.flavor).toBeTruthy();
    });
});

describe('WH40KStarship', () => {
    it('exports WH40KStarship class', async () => {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod.WH40KVoidcraft).toBeTruthy();
    });

    it('WH40KStarship extends WH40KBaseActor', async () => {
        const [starshipMod, baseMod] = await Promise.all([
            import('./voidcraft').catch((err) => {
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
        expect(starshipMod.WH40KVoidcraft.prototype).toBeInstanceOf(baseMod.WH40KBaseActor);
    });

    it('hullType / hullClass / speed / armour getters read from system', async () => {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        const fakeStarship = Object.create(mod.WH40KVoidcraft.prototype) as InstanceType<typeof mod.WH40KVoidcraft>;
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
 * the document's `applyHullDamage` / `reducePriorTurnDamage` /
 * `replenishBetweenCombat` methods route through the rules helpers and
 * write the expected dotted-path updates. Per-system gating: non-RT
 * hulls must not have crew/morale touched.
 */
describe('WH40KStarship · RT Crew/Morale economy (issue #189)', () => {
    type PriorTurnDamage = { hullLoss: number; crewLoss: number; moraleLoss: number; turn: number };
    type HullDamageDelta = { hullLoss: number; crewLoss: number; moraleLoss: number };
    type UpdatePayload = Record<string, number | PriorTurnDamage>;

    interface FakeStarship {
        system: {
            gameSystem: string;
            hullIntegrity: { value: number; max: number };
            crew: { population: number; crewRating: number; morale: { value: number; max: number } };
            priorTurnDamage?: PriorTurnDamage;
        };
        hullIntegrity: { value: number; max: number };
        crew: { population: number; crewRating: number; morale: { value: number; max: number } };
        update: (data: UpdatePayload) => Promise<void>;
        _lastUpdate?: UpdatePayload;
    }

    interface StarshipMethods {
        applyHullDamage: (this: FakeStarship, n: number) => Promise<HullDamageDelta>;
        reducePriorTurnDamage: (this: FakeStarship, pool: 'morale' | 'crewPopulation', amount: number) => Promise<number>;
        replenishBetweenCombat: (this: FakeStarship) => Promise<void>;
    }

    /** The document's private state readers the public methods call on `this`. */
    interface StarshipStateReaders {
        _readShipCombatState: (this: FakeStarship) => {
            hullIntegrity: { value: number; max: number };
            crew: { population: number; morale: { value: number; max: number } };
        };
        _readPriorTurnSnapshot: (this: FakeStarship) => PriorTurnDamage;
        _currentStrategicTurn: (this: FakeStarship) => number;
    }

    async function makeFakeStarship(opts: { gameSystem?: string; priorTurnDamage?: PriorTurnDamage } = {}): Promise<
        | {
              fake: FakeStarship;
              methods: StarshipMethods & { usesRTCrewEconomy: PropertyDescriptor };
          }
        | undefined
    > {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return undefined;
        // eslint-disable-next-line no-restricted-syntax -- boundary: reading the document's prototype methods through a structural test interface (the class type and StarshipMethods do not overlap)
        const proto = mod.WH40KVoidcraft.prototype as unknown as StarshipMethods & StarshipStateReaders;
        const desc = Object.getOwnPropertyDescriptor(mod.WH40KVoidcraft.prototype, 'usesRTCrewEconomy');
        if (desc === undefined) throw new Error('usesRTCrewEconomy descriptor missing on WH40KStarship prototype');

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
        // The document's private state readers, so the public methods run against the fake.
        Object.assign(fake, {
            _readShipCombatState: proto._readShipCombatState,
            _readPriorTurnSnapshot: proto._readPriorTurnSnapshot,
            _currentStrategicTurn: proto._currentStrategicTurn,
        });
        return {
            fake,
            methods: {
                applyHullDamage: proto.applyHullDamage,
                reducePriorTurnDamage: proto.reducePriorTurnDamage,
                replenishBetweenCombat: proto.replenishBetweenCombat,
                usesRTCrewEconomy: desc,
            },
        };
    }

    it('applyHullDamage decrements hull, crew, and morale on RT hulls', async () => {
        const setup = await makeFakeStarship({ gameSystem: 'rt' });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when runtime unavailable
        if (setup === undefined) return;
        const { fake, methods } = setup;
        Object.defineProperty(fake, 'usesRTCrewEconomy', methods.usesRTCrewEconomy);
        const delta = await methods.applyHullDamage.call(fake, 5);
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

    // Regression (#189): Hold Fast! used to restore ALL of last turn's hull,
    // crew and morale with no test. RAW it reduces only Morale, by 1 + DoS.
    it('reducePriorTurnDamage("morale") restores only Morale, capped by the amount, next turn', async () => {
        const setup = await makeFakeStarship({
            gameSystem: 'rt',
            priorTurnDamage: { hullLoss: 5, crewLoss: 5, moraleLoss: 5, turn: 1 },
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when runtime unavailable
        if (setup === undefined) return;
        const { fake, methods } = setup;
        Object.defineProperty(fake, 'usesRTCrewEconomy', methods.usesRTCrewEconomy);
        fake.system.hullIntegrity.value = 30;
        fake.system.crew.population = 95;
        fake.system.crew.morale.value = 95;

        vi.stubGlobal('game', { combats: { active: { round: 2 } } });
        try {
            const restored = await methods.reducePriorTurnDamage.call(fake, 'morale', 2);
            expect(restored).toBe(2);
            expect(fake.system.crew.morale.value).toBe(97);
            expect(fake.system.hullIntegrity.value).toBe(30);
            expect(fake.system.crew.population).toBe(95);
            expect(fake.system.priorTurnDamage?.moraleLoss).toBe(3);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('reducePriorTurnDamage is a no-op on non-RT hulls', async () => {
        const setup = await makeFakeStarship({
            gameSystem: 'dh2',
            priorTurnDamage: { hullLoss: 5, crewLoss: 5, moraleLoss: 5, turn: 1 },
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when runtime unavailable
        if (setup === undefined) return;
        const { fake, methods } = setup;
        Object.defineProperty(fake, 'usesRTCrewEconomy', methods.usesRTCrewEconomy);
        const restored = await methods.reducePriorTurnDamage.call(fake, 'crewPopulation', 3);
        expect(restored).toBe(0);
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

/**
 * Issue #186 — timed ship-action modifiers live on the ship as ActiveEffects
 * carrying a structured `shipActionModifier` flag, which `shipActionEffects`
 * reads back for the central collector.
 */
describe('WH40KVoidcraft · ship-action modifiers (issue #186)', () => {
    interface EffectStub {
        name: string;
        active: boolean;
        flags: { 'wh40k-rpg'?: { shipActionModifier: { target: string; value: number; weaponId: string } } };
    }
    interface FakeShip {
        system: { gameSystem: string };
        effects: EffectStub[];
        created: object[];
        createEmbeddedDocuments: (name: string, data: object[]) => Promise<void>;
    }
    interface ShipActionMethods {
        applyShipActionModifier: (this: FakeShip, input: object) => Promise<void>;
    }

    async function setup(gameSystem: string): Promise<{ fake: FakeShip; methods: ShipActionMethods; effectsView: () => ShipEffectView[] } | undefined> {
        const mod = await importModelOrSkip(import('./voidcraft.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return undefined;
        vi.stubGlobal('CONST', { ACTIVE_EFFECT_MODES: { ADD: 2 } });
        const proto = mod.WH40KVoidcraft.prototype;
        const fake: FakeShip = {
            system: { gameSystem },
            effects: [
                {
                    name: 'Lock on Target',
                    active: true,
                    flags: { 'wh40k-rpg': { shipActionModifier: { target: 'weaponBallisticSkill', value: 10, weaponId: 'lance' } } },
                },
                { name: 'Stunned', active: true, flags: {} },
            ],
            created: [],
            async createEmbeddedDocuments(_name, data) {
                this.created.push(...data);
                await Promise.resolve();
            },
        };
        const economy = Object.getOwnPropertyDescriptor(proto, 'usesRTCrewEconomy');
        if (economy === undefined) throw new Error('usesRTCrewEconomy descriptor missing');
        Object.defineProperty(fake, 'usesRTCrewEconomy', economy);
        // eslint-disable-next-line no-restricted-syntax -- boundary: reading the document's prototype method through a structural test interface (the class type and ShipActionMethods do not overlap)
        const methods = proto as unknown as ShipActionMethods;
        // Run the real `shipActionEffects` getter with the fake as its receiver.
        return { fake, methods, effectsView: () => Reflect.get(proto, 'shipActionEffects', fake) };
    }

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reads each effect’s ship-action payload, null for any other effect', async () => {
        const ctx = await setup('rt');
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when runtime unavailable
        if (ctx === undefined) return;
        expect(ctx.effectsView()).toEqual([
            { name: 'Lock on Target', active: true, modifier: { target: 'weaponBallisticSkill', value: 10, weaponId: 'lance' } },
            { name: 'Stunned', active: true, modifier: null },
        ]);
    });

    it('creates a timed ActiveEffect on an RT ship, and nothing on another line’s', async () => {
        const input = { name: 'Flank Speed', img: 'i.png', origin: 'o', target: 'speed', value: 3, weaponId: '', rounds: 0, expiry: 'turnEnd' };
        const rt = await setup('rt');
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when runtime unavailable
        if (rt === undefined) return;
        await rt.methods.applyShipActionModifier.call(rt.fake, input);
        expect(rt.fake.created).toEqual([
            expect.objectContaining({
                name: 'Flank Speed',
                changes: [{ key: 'system.speed', mode: 2, value: '3' }],
                duration: { value: 0, units: 'rounds', expiry: 'turnEnd' },
            }),
        ]);
        const dh2 = await setup('dh2');
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when runtime unavailable
        if (dh2 === undefined) return;
        await dh2.methods.applyShipActionModifier.call(dh2.fake, input);
        expect(dh2.fake.created).toEqual([]);
    });
});
