/**
 * Unit tests for the in-memory compendium hydration join.
 *
 * Covers the pure merge (`buildHydratedSystem`, persisted-wins) and the
 * resilience contract of `buildHydrationPatches`: it runs on a hot
 * prep/render path, so a compendium ref that can't resolve (a `fromUuid`
 * throw — e.g. a not-yet-ready `documentClass` surfacing as
 * "...reading 'database'") must be SKIPPED, never propagated. An
 * unguarded throw here became an unhandled rejection via the `void`ed
 * `createActor` hook / a crashed sheet render.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildActorVariantJoin, buildHydratedSystem, buildHydrationPatches } from './compendium-hydrate.ts';

/** Minimal structural shape matching the slice of an owned item `buildHydrationPatches` reads. */
interface MockItem {
    id: string | null;
    name: string | null;
    img: string | null;
    type: string;
    system: Record<string, number | string>;
    _stats?: { compendiumSource?: string | null };
}
const actorWith = (...items: MockItem[]): { items: { contents: MockItem[] } } => ({ items: { contents: items } });

const leanWeapon: MockItem = {
    id: 'i1',
    name: 'Bolt Pistol',
    img: null,
    type: 'weapon',
    system: { cost: 7 },
    _stats: { compendiumSource: 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item.abc' },
};

describe('buildHydratedSystem (persisted-wins merge)', () => {
    it('overlays the actor-persisted fields on the canonical source body', () => {
        const merged = buildHydratedSystem({ damage: '1d10', nested: { x: 1, y: 2 }, cost: 0 }, { cost: 5, nested: { y: 9 } });
        expect(merged).toEqual({ damage: '1d10', nested: { x: 1, y: 9 }, cost: 5 });
    });
});

describe('buildHydrationPatches — resilience on the hot prep/render path', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('SKIPS an item whose fromUuid throws — never propagates (resolves to [])', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.stubGlobal('fromUuid', vi.fn().mockRejectedValue(new Error("Cannot read properties of undefined (reading 'database')")));
        await expect(buildHydrationPatches(actorWith(leanWeapon))).resolves.toEqual([]);
    });

    it('skips an item whose ref resolves to null', async () => {
        vi.stubGlobal('fromUuid', vi.fn().mockResolvedValue(null));
        await expect(buildHydrationPatches(actorWith(leanWeapon))).resolves.toEqual([]);
    });

    it('leaves a self-contained item (no compendiumSource / variantOf) untouched without calling fromUuid', async () => {
        const fromUuidSpy = vi.fn();
        vi.stubGlobal('fromUuid', fromUuidSpy);
        const selfContained: MockItem = { id: 'i2', name: 'Natural Claws', img: null, type: 'weapon', system: {} };
        await expect(buildHydrationPatches(actorWith(selfContained))).resolves.toEqual([]);
        expect(fromUuidSpy).not.toHaveBeenCalled();
    });

    it('produces a patch (canonical body, persisted fields winning) when the ref resolves', async () => {
        vi.stubGlobal('fromUuid', vi.fn().mockResolvedValue({ img: 'icons/bolt.webp', system: { damage: '1d10+5', cost: 0 } }));
        const patches = await buildHydrationPatches(actorWith(leanWeapon));
        expect(patches).toHaveLength(1);
        expect(patches[0]).toMatchObject({ _id: 'i1', system: { damage: '1d10+5', cost: 7 } });
    });

    /**
     * #574: a LEAN embed (no `system` on disk) lost its canonical description on
     * hydration. Two mechanisms, both exercised here against the exact shapes of
     * the Adeptus Astartes Dreadnought's Walker trait:
     *   - the canonical `description` is a per-line variant container
     *     (`{ rt: { value } }`). `updateSource` re-cleans WITHOUT `_migrateData`,
     *     so the container must be materialized to the owning line here or the
     *     schema strips the unknown `rt` key → empty description.
     *   - the lean overlay's schema-default empty strings (`description.value`,
     *     `descriptionText`) must not clobber the canonical's real text.
     */
    it('resolves a canonical per-line description and keeps flat text through the lean overlay (#574)', async () => {
        vi.stubGlobal(
            'fromUuid',
            vi.fn().mockResolvedValue({
                img: null,
                system: {
                    description: { rt: { value: '<p>Walker rules</p>' } },
                    descriptionText: 'Walker rules',
                    gameSystems: ['rt'],
                },
            }),
        );
        const patches = await buildHydrationPatches({
            system: { gameSystem: 'dw' },
            items: {
                contents: [
                    {
                        id: 't1',
                        name: 'Walker',
                        img: null,
                        type: 'vehicleTrait',
                        // The derived defaults a lean embed presents: empty description text.
                        system: { description: { value: '', chat: '', summary: '' }, descriptionText: '' },
                        _stats: { compendiumSource: 'Compendium.wh40k-rpg.hb-generic-items-vehicle-traits.Item.fLE0SYIIfp7Ecx09' },
                    },
                ],
            },
        });
        expect(patches).toHaveLength(1);
        const sys = patches[0]?.['system'] as { description?: { value?: string }; descriptionText?: string };
        // The per-line container is collapsed to its branch — never left as `{ rt: … }`.
        expect(sys.description).not.toHaveProperty('rt');
        expect(sys.description?.value).toBe('<p>Walker rules</p>');
        // The flat canonical text is NOT clobbered by the overlay's empty default.
        expect(sys.descriptionText).toBe('Walker rules');
    });

    it('still lets a genuinely customised (non-empty) persisted description win — no over-correction (#574)', async () => {
        // Canonical carries an extra field (`weight`) the lean overlay lacks, so a
        // patch is produced (the join is not a no-op) and we can assert the
        // authored, non-empty description still wins over the canonical body.
        vi.stubGlobal(
            'fromUuid',
            vi.fn().mockResolvedValue({ img: null, system: { description: { value: 'Canonical text', chat: '', summary: '' }, weight: 5 } }),
        );
        const patches = await buildHydrationPatches({
            system: { gameSystem: 'dh2' },
            items: {
                contents: [
                    {
                        id: 'c1',
                        name: 'Custom',
                        img: null,
                        type: 'trait',
                        system: { description: { value: 'Actor override', chat: '', summary: '' } },
                        _stats: { compendiumSource: 'Compendium.wh40k-rpg.dh2-core-items-traits.Item.c' },
                    },
                ],
            },
        });
        expect(patches).toHaveLength(1);
        const sys = patches[0]?.['system'] as { description?: { value?: string }; weight?: number };
        expect(sys.description?.value).toBe('Actor override');
        expect(sys.weight).toBe(5);
    });
});

/**
 * The actor-level join: a named individual authored as a `variantOf` an unnamed
 * class (the *Excrucian* → the Devastation-class Cruiser) stores only what makes
 * it that individual and inherits the class's stats at load.
 *
 * Same contract as the item join it mirrors — persisted wins, in memory only,
 * best-effort on a hot render path — plus a bound on the chain walk, because
 * authored data can contain a cycle and this must not hang.
 */
describe('buildActorVariantJoin — a named individual inherits its class', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    /** A named individual: no inventory, just its own system payload and a name. */
    // eslint-disable-next-line no-restricted-syntax -- boundary: an untyped Foundry actor system payload is the input under test
    const named = (system: Record<string, unknown>): { items: { contents: [] }; name: string; system: Record<string, unknown> } => ({
        items: { contents: [] },
        name: 'Excrucian',
        system,
    });

    it('returns null for an actor that is its own base, without calling fromUuid', async () => {
        const fromUuidSpy = vi.fn();
        vi.stubGlobal('fromUuid', fromUuidSpy);
        await expect(buildActorVariantJoin(named({ variantOf: '', armour: 20 }))).resolves.toBeNull();
        expect(fromUuidSpy).not.toHaveBeenCalled();
    });

    it('inherits the class stats the individual does not state', async () => {
        vi.stubGlobal('fromUuid', vi.fn().mockResolvedValue({ img: null, system: { armour: 20, hullIntegrity: { max: 70 }, turretRating: 2 } }));
        const joined = await buildActorVariantJoin(named({ variantOf: 'Compendium.x.Actor.base', notes: { rt: 'Karrad Vall honour guard' } }));
        expect(joined).toMatchObject({ armour: 20, hullIntegrity: { max: 70 }, turretRating: 2, notes: { rt: 'Karrad Vall honour guard' } });
    });

    it('lets the individual OVERRIDE a class stat it does state', async () => {
        vi.stubGlobal('fromUuid', vi.fn().mockResolvedValue({ img: null, system: { armour: 20, turretRating: 2 } }));
        const joined = await buildActorVariantJoin(named({ variantOf: 'Compendium.x.Actor.base', turretRating: 5 }));
        expect(joined).toMatchObject({ armour: 20, turretRating: 5 });
    });

    it('walks a chain, nearer base overriding the further one', async () => {
        const chainedResolve = vi
            .fn()
            .mockResolvedValueOnce({ img: null, system: { variantOf: 'Compendium.x.Actor.root', armour: 22, speed: 5 } })
            .mockResolvedValueOnce({ img: null, system: { armour: 20, speed: 4, detection: 10 } });
        vi.stubGlobal('fromUuid', chainedResolve);
        const joined = await buildActorVariantJoin(named({ variantOf: 'Compendium.x.Actor.mid', speed: 9 }));
        expect(joined).toMatchObject({ armour: 22, speed: 9, detection: 10 });
    });

    it('stops on a variantOf cycle instead of hanging', async () => {
        vi.stubGlobal('fromUuid', vi.fn().mockResolvedValue({ img: null, system: { variantOf: 'Compendium.x.Actor.self', armour: 20 } }));
        const joined = await buildActorVariantJoin(named({ variantOf: 'Compendium.x.Actor.self', speed: 5 }));
        expect(joined).toMatchObject({ armour: 20, speed: 5 });
    });

    it('returns null — never throws — when the base cannot be resolved', async () => {
        vi.stubGlobal('fromUuid', vi.fn().mockRejectedValue(new Error("Cannot read properties of undefined (reading 'database')")));
        await expect(buildActorVariantJoin(named({ variantOf: 'Compendium.x.Actor.base', speed: 5 }))).resolves.toBeNull();
    });

    it('returns null when the join would be a no-op, so the actor is not reset needlessly', async () => {
        vi.stubGlobal('fromUuid', vi.fn().mockResolvedValue({ img: null, system: { armour: 20 } }));
        await expect(buildActorVariantJoin(named({ variantOf: 'Compendium.x.Actor.base', armour: 20 }))).resolves.toBeNull();
    });
});
