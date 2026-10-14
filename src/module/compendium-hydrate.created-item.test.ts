/**
 * Regression tests for #621: a lean compendium item added to an EXISTING actor is
 * joined to its compendium body in memory the moment it is created.
 *
 * The join ran at boot, on actor import and on sheet render, but nothing ran when an
 * item was dropped on an actor that already existed, so the new item read its schema
 * defaults (a Hand Flamer showed clip 2/0, no stats, no qualities) until the next load.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { hydrateCreatedItemInMemory } from './compendium-hydrate.ts';

type SystemPayload = Record<string, string | number>;

interface JoinItem {
    id: string;
    name: string;
    img: null;
    type: string;
    system: SystemPayload;
    _stats: { compendiumSource: string };
    updateSource: Mock<(changes: object, options?: object) => void>;
    render: Mock<(force?: boolean) => void>;
}

const HAND_FLAMER = 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item.handFlamer';

/** A lean Hand Flamer stub: the join key and the actor's own clip. */
function leanFlamer(): JoinItem {
    return {
        id: 'flamer',
        name: 'Hand Flamer',
        img: null,
        type: 'weapon',
        system: { clipValue: 2 },
        _stats: { compendiumSource: HAND_FLAMER },
        updateSource: vi.fn(),
        render: vi.fn(),
    };
}

function actorHolding(items: JoinItem[]): {
    documentName: string;
    name: string;
    items: { contents: JoinItem[] };
    reset: Mock<() => void>;
    render: Mock<(force?: boolean) => void>;
} {
    return { documentName: 'Actor', name: 'Acolyte', items: { contents: items }, reset: vi.fn(), render: vi.fn() };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('hydrateCreatedItemInMemory (#621)', () => {
    it('joins a lean item dropped on an existing actor, in memory, and re-renders its sheets', async () => {
        vi.stubGlobal(
            'fromUuid',
            vi.fn(async (uuid: string) =>
                Promise.resolve(uuid === HAND_FLAMER ? { img: null, type: 'weapon', system: { class: 'pistol', clipMax: 2, clipValue: 0 } } : null),
            ),
        );
        const flamer = leanFlamer();
        const actor = actorHolding([flamer]);

        await expect(hydrateCreatedItemInMemory({ parent: actor, render: flamer.render })).resolves.toBe(1);

        // The canonical profile under the actor's own state ("persisted wins").
        expect(flamer.updateSource.mock.calls[0]?.[0]).toMatchObject({ system: { class: 'pistol', clipMax: 2, clipValue: 2 } });
        expect(actor.reset).toHaveBeenCalledOnce();
        expect(actor.render).toHaveBeenCalledWith(false);
        expect(flamer.render).toHaveBeenCalledWith(false);
    });

    it('does nothing for a world or pack item with no owning actor', async () => {
        const lookup = vi.fn();
        vi.stubGlobal('fromUuid', lookup);
        await expect(hydrateCreatedItemInMemory({ parent: null })).resolves.toBe(0);
        expect(lookup).not.toHaveBeenCalled();
    });

    it('does not re-render when the item was already full', async () => {
        vi.stubGlobal(
            'fromUuid',
            vi.fn(async () => Promise.resolve({ img: null, type: 'weapon', system: { clipValue: 2 } })),
        );
        const flamer = leanFlamer();
        const actor = actorHolding([flamer]);

        await expect(hydrateCreatedItemInMemory({ parent: actor, render: flamer.render })).resolves.toBe(0);
        expect(actor.render).not.toHaveBeenCalled();
        expect(flamer.render).not.toHaveBeenCalled();
    });
});

describe('createItem hook wiring (#621)', () => {
    const hooks = readFileSync(resolve(__dirname, 'hooks-manager.ts'), 'utf8');

    it('joins a created item through the hook on every client, rejection handled', () => {
        const block = hooks.match(/hooksOn\('createItem',\s*\(item: Parameters<typeof hydrateCreatedItemInMemory>\[0\]\) => \{[\s\S]*?\}\);/);
        expect(block).not.toBeNull();
        expect(block?.[0]).toMatch(/hydrateCreatedItemInMemory\(item\)\.catch\(/);
        // An in-memory join must run on every client, so it must NOT gate on the triggering user.
        expect(block?.[0]).not.toMatch(/userId/);
    });
});
