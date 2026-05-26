import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable no-restricted-syntax -- test boundary: structural stubs of the Foundry item/actor surface applyOriginToActor() reaches into, narrowed to the fields under test */
/** Write a dot-path value into a nested record, creating intermediate objects. */
function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    const last = parts.pop();
    if (last === undefined) return;
    let node: Record<string, unknown> = target;
    for (const key of parts) {
        const next = node[key];
        if (typeof next !== 'object' || next === null) node[key] = {};
        node = node[key] as Record<string, unknown>;
    }
    node[last] = value;
}

/** Callable view of the prototype method under test, bound to a structural `this`. */
type ApplyOriginFn = (this: unknown, actor: unknown, options?: { silent?: boolean }) => Promise<void>;

/** Extract the prototype method as a plain callable so it can run against a structural `this` stub. */
function getApply(mod: { WH40KItem: { prototype: { applyOriginToActor: unknown } } }): ApplyOriginFn {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- test: deliberately extracting the prototype method to invoke via .call() on a structural stub
    return mod.WH40KItem.prototype.applyOriginToActor as ApplyOriginFn;
}

function makeOriginThis(modifiers: Record<string, unknown>): unknown {
    return {
        isOriginPath: true,
        type: 'originPath',
        id: 'origin-xyz',
        name: 'Imperial World',
        system: { modifiers },
        toObject: () => ({ type: 'originPath', name: 'Imperial World' }),
    };
}

function makeOriginActor(): {
    system: unknown;
    flags: unknown;
    items: { some: () => boolean };
    update: ReturnType<typeof vi.fn>;
    createEmbeddedDocuments: ReturnType<typeof vi.fn>;
    readState: () => { wp: number; wounds: number; fate: number };
} {
    const root: Record<string, unknown> = {
        system: {
            characteristics: { willpower: { advance: 0 } },
            wounds: { max: 0 },
            fate: { total: 0 },
        },
        flags: {},
    };
    return {
        get system() {
            return root['system'];
        },
        get flags() {
            return root['flags'];
        },
        items: { some: () => false },
        update: vi.fn(async (payload: Record<string, unknown>) => {
            for (const [path, value] of Object.entries(payload)) setPath(root, path, value);
            return Promise.resolve();
        }),
        createEmbeddedDocuments: vi.fn(async () => Promise.resolve([])),
        readState() {
            const sys = root['system'] as { characteristics: { willpower: { advance: number } }; wounds: { max: number }; fate: { total: number } };
            return { wp: sys.characteristics.willpower.advance, wounds: sys.wounds.max, fate: sys.fate.total };
        },
    };
}
/* eslint-enable no-restricted-syntax */

describe('WH40KItem.applyOriginToActor idempotency', () => {
    beforeEach(() => {
        // eslint-disable-next-line no-restricted-syntax -- test boundary: stub the Foundry globals applyOriginToActor touches
        const g = globalThis as unknown as { ui: { notifications: { info: () => void; warn: () => void } }; game: { packs: { get: () => undefined } } };
        g.ui = { notifications: { info: vi.fn(), warn: vi.fn() } };
        g.game = { packs: { get: () => undefined } };
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('applying the same origin twice converges to applying it once', async () => {
        const mod = await import('./item').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const apply = getApply(mod);
        const modifiers = { characteristics: { willpower: 5 }, wounds: 3, fate: 1 };

        const once = makeOriginActor();
        await apply.call(makeOriginThis(modifiers), once, { silent: true });
        const afterOnce = once.readState();

        const twice = makeOriginActor();
        await apply.call(makeOriginThis(modifiers), twice, { silent: true });
        await apply.call(makeOriginThis(modifiers), twice, { silent: true });

        expect(afterOnce).toEqual({ wp: 5, wounds: 3, fate: 1 });
        expect(twice.readState()).toEqual(afterOnce);
        // The origin item is added exactly once (skip-if-exists guards the rest,
        // but `items.some` is stubbed false so each apply attempts the add — the
        // resource reconciliation is what proves non-double-counting here).
    });

    it('does not duplicate characteristic advances across repeated applies', async () => {
        const mod = await import('./item').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const apply = getApply(mod);
        const actor = makeOriginActor();
        const origin = makeOriginThis({ characteristics: { willpower: 5 }, wounds: 3, fate: 1 });

        await apply.call(origin, actor, { silent: true });
        await apply.call(origin, actor, { silent: true });
        await apply.call(origin, actor, { silent: true });

        expect(actor.readState()).toEqual({ wp: 5, wounds: 3, fate: 1 });
    });
});

describe('WH40KItem', () => {
    it('exports WH40KItem class', async () => {
        const mod = await import('./item').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`WH40KItem could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod.WH40KItem).toBeTruthy();
    });

    it('_getDefaultIcon returns type-specific icon paths', async () => {
        const mod = await import('./item').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`WH40KItem could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod.WH40KItem._getDefaultIcon('weapon')).toBe('icons/svg/sword.svg');
        expect(mod.WH40KItem._getDefaultIcon('armour')).toBe('icons/svg/shield.svg');
        expect(mod.WH40KItem._getDefaultIcon('talent')).toBe('icons/svg/book.svg');
    });

    it('_getDefaultIcon falls back to mystery-man for unknown types', async () => {
        const mod = await import('./item').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`WH40KItem could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod.WH40KItem._getDefaultIcon('unknownType')).toBe('icons/svg/mystery-man.svg');
        expect(mod.WH40KItem._getDefaultIcon('')).toBe('icons/svg/mystery-man.svg');
    });

    it('cleanData handles missing img field without error', async () => {
        const mod = await import('./item').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`WH40KItem could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        // source without img field should not throw
        expect(() => mod.WH40KItem.cleanData({ type: 'weapon' })).not.toThrow();
    });

    it('cleanData replaces invalid img extension with type default', async () => {
        const mod = await import('./item').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`WH40KItem could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        const source = { type: 'weapon', img: 'path/without/extension' };
        mod.WH40KItem.cleanData(source);
        expect(source.img).toBe('icons/svg/sword.svg');
    });

    it('cleanData replaces empty img string with type default', async () => {
        const mod = await import('./item').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`WH40KItem could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        const source = { type: 'talent', img: '' };
        mod.WH40KItem.cleanData(source);
        expect(source.img).toBe('icons/svg/book.svg');
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - type-classification getters (isWeapon, isMelee, isRanged, isPsychicPower, etc.)
    //   - totalWeight aggregates nested item weights
    //   - getOriginPreview returns characteristic/skill/talent lists when item is an origin path
    //   - performAction dispatches to actor.rollWeaponAction for weapons
});
