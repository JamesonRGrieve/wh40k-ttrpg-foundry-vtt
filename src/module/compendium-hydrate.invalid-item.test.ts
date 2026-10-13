/**
 * Regression tests for 6499b134f: one owned item whose canonical body fails
 * validation must not abort the join, and one actor whose join throws must not
 * abort the system's `ready`.
 *
 * Live: a weapon whose compendium damage formula is "-" made `updateSource`
 * throw. The ready hook awaits every actor's join, so the throw stopped `ready`
 * before condition status effects, the name caches, the skill indexes and the
 * event graph loaded.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { hydrateActorInMemory } from './compendium-hydrate.ts';

type SystemPayload = Record<string, string | number>;

/** An owned lean item whose `updateSource` either commits or throws as Foundry's validation would. */
interface JoinItem {
    id: string;
    name: string;
    img: null;
    type: string;
    system: SystemPayload;
    _stats: { compendiumSource: string };
    updateSource: Mock<(changes: object, options?: object) => void>;
}

/** A lean weapon joined from `uuid`; `invalid` makes its commit throw a validation error. */
function leanItem(id: string, uuid: string, invalid: boolean): JoinItem {
    return {
        id,
        name: id,
        img: null,
        type: 'weapon',
        system: { cost: 1 },
        _stats: { compendiumSource: uuid },
        updateSource: vi.fn((_changes: object, _options?: object): void => {
            if (invalid) throw new Error('WeaponData validation errors: damage: "-" is not a valid roll formula');
        }),
    };
}

/** The canonical bodies the stubbed `fromUuid` returns, by uuid. */
const CANONICAL: Record<string, { img: null; system: SystemPayload }> = {
    'Compendium.x.Item.bad': { img: null, system: { damage: '-', cost: 0 } },
    'Compendium.x.Item.good': { img: null, system: { damage: '1d10+2', cost: 0 } },
};

function stubCompendium(): void {
    vi.stubGlobal(
        'fromUuid',
        vi.fn(async (uuid: string) => Promise.resolve(CANONICAL[uuid] ?? null)),
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('hydrateActorInMemory: one invalid item does not abort the join (6499b134f)', () => {
    it('skips the item that fails validation, still joins the rest, and logs the skip', async () => {
        stubCompendium();
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const bad = leanItem('bad', 'Compendium.x.Item.bad', true);
        const good = leanItem('good', 'Compendium.x.Item.good', false);
        const actor = { name: 'Hive Ganger', items: { contents: [bad, good] }, reset: vi.fn() };

        await expect(hydrateActorInMemory(actor)).resolves.toBe(1);

        expect(bad.updateSource).toHaveBeenCalledOnce();
        expect(good.updateSource).toHaveBeenCalledOnce();
        expect(good.updateSource.mock.calls[0]?.[0]).toMatchObject({ system: { damage: '1d10+2', cost: 1 } });
        expect(actor.reset).toHaveBeenCalledOnce();
        const logged = error.mock.calls.map((c) => String(c[0]));
        expect(logged.some((m) => m.includes('skipped item bad on Hive Ganger'))).toBe(true);
    });

    it('when every patched item fails, reports 0 patched and does not re-prepare the actor', async () => {
        stubCompendium();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const bad = leanItem('bad', 'Compendium.x.Item.bad', true);
        const actor = { name: 'Hive Ganger', items: { contents: [bad] }, reset: vi.fn() };

        await expect(hydrateActorInMemory(actor)).resolves.toBe(0);
        expect(actor.reset).not.toHaveBeenCalled();
    });

    it('the bad item comes first or last: the order of the items does not matter', async () => {
        stubCompendium();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const good = leanItem('good', 'Compendium.x.Item.good', false);
        const bad = leanItem('bad', 'Compendium.x.Item.bad', true);
        const actor = { name: 'Hive Ganger', items: { contents: [good, bad] }, reset: vi.fn() };

        await expect(hydrateActorInMemory(actor)).resolves.toBe(1);
        expect(actor.reset).toHaveBeenCalledOnce();
    });
});

describe('ready: one actor whose join throws does not abort the boot (6499b134f)', () => {
    const hooks = readFileSync(resolve(__dirname, 'hooks-manager.ts'), 'utf8');
    const helper = hooks.match(/static async hydrateWorldActorsOnReady\(\):[\s\S]*?\n {4}\}/)?.[0] ?? '';

    it('each world actor is joined inside its own try / catch that logs and continues', () => {
        expect(helper).not.toBe('');
        expect(helper).toMatch(/try \{\s*await hydrateActorInMemory\(actor\);\s*\} catch \(err\) \{\s*console\.error\(/);
    });

    it('the boot join is awaited as one Promise.all over every actor, so no throw escapes it', () => {
        expect(helper).toMatch(/await Promise\.all\(\s*game\.actors\.contents\.map\(async \(actor\) =>/);
    });
});
