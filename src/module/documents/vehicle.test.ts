import { afterEach, describe, expect, it, vi } from 'vitest';
import { importModelOrSkip } from '../testing/model-import.ts';

describe('WH40KVehicle', () => {
    it('exports WH40KVehicle class', async () => {
        const mod = await importModelOrSkip(import('./vehicle.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
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
        const mod = await importModelOrSkip(import('./vehicle.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
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
});

describe('WH40KVehicle.rollItem — weapon attacker selection (item.roll TypeError fix)', () => {
    const weapon = { type: 'weapon', name: 'Assault Cannon (Dreadnought)' };

    /**
     * Load the model + the SAME action-manager singleton `rollItem` dispatches to,
     * build a prototype-only vehicle, and spy on `performWeaponAttack`. Imports are
     * dynamic (and skip-guarded) because these modules evaluate `foundry.*` globals
     * at load, which happy-dom lacks — the assertions run under the Tier A boot.
     */
    async function setup(
        characteristics: object | null,
        character: object | null,
    ): Promise<{ vehicle: { rollItem: (id: string) => Promise<void> }; spy: ReturnType<typeof vi.fn> } | undefined> {
        const mod = await importModelOrSkip(import('./vehicle.ts'));
        if (mod === undefined) return undefined;
        const actions = await importModelOrSkip(import('../actions/targeted-action-manager.ts'));
        if (actions === undefined) return undefined;

        const vehicle = Object.create(mod.WH40KVehicle.prototype) as { rollItem: (id: string) => Promise<void> };
        Object.defineProperty(vehicle, 'system', { value: { characteristics }, writable: true });
        Object.defineProperty(vehicle, 'items', { value: { get: (): typeof weapon => weapon }, writable: true });
        Object.defineProperty(vehicle, 'name', { value: 'Adeptus Astartes Dreadnought', writable: true });

        vi.stubGlobal('game', { user: { character }, wh40k: { log: (): void => undefined }, i18n: { format: (k: string): string => k } });
        vi.stubGlobal('ui', { notifications: { warn: (): void => undefined } });
        const spy = vi.spyOn(actions.DHTargetedActionManager, 'performWeaponAttack').mockImplementation(() => undefined);
        return { vehicle, spy };
    }

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('an animate craft (has characteristics) attacks as ITSELF, not the player character', async () => {
        const ctx = await setup({ weaponSkill: { base: 40 } }, { name: 'Some Player PC' });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom
        if (ctx === undefined) return;
        await ctx.vehicle.rollItem('w1');
        expect(ctx.spy).toHaveBeenCalledTimes(1);
        expect(ctx.spy.mock.calls[0]?.[0]).toBe(ctx.vehicle); // attacker is the craft itself
        expect(ctx.spy.mock.calls[0]?.[2]).toBe(weapon);
    });

    it('an ordinary vehicle (no characteristics) fires with the operating character', async () => {
        const character = { name: 'Gunner' };
        const ctx = await setup(null, character);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom
        if (ctx === undefined) return;
        await ctx.vehicle.rollItem('w1');
        expect(ctx.spy).toHaveBeenCalledTimes(1);
        expect(ctx.spy.mock.calls[0]?.[0]).toBe(character);
    });

    it('an ordinary vehicle with no assigned character does not attack', async () => {
        const ctx = await setup(null, null);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom
        if (ctx === undefined) return;
        await ctx.vehicle.rollItem('w1');
        expect(ctx.spy).not.toHaveBeenCalled();
    });
});
