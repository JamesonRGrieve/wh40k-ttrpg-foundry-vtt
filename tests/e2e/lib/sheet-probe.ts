import type { Page } from '@playwright/test';

/**
 * Open and size actor / owned-item sheets for layout captures.
 *
 * Several specs need the same moves: create a probe actor, open its sheet (or one of
 * its items' sheets) on a given tab, and size it to its default or its minimum width
 * so a layout defect that only shows at one width is captured at both. These helpers
 * run inside `page.evaluate` and return the opened application's id (for `snap`'s
 * `selector` / `keepWindow`) and the width it actually took.
 */

/** How a sheet is sized before capture: its default width, its CSS minimum, or an explicit px width. */
export type SheetWidth = 'default' | 'min' | number;

/** An opened sheet: its application id and rendered width. */
export interface OpenedSheet {
    appId: string;
    width: number;
}

interface SheetLike {
    id: string;
    rendered: boolean;
    render: (o: { force: boolean }) => Promise<object>;
    setPosition: (p: { width: number }) => object;
    changeTab?: (tab: string, group: string) => void;
    element: HTMLElement;
}

interface ItemLike {
    name: string;
    sheet: SheetLike;
}

interface ActorLike {
    id: string;
    sheet: SheetLike;
    items: { contents: ItemLike[] };
    delete: () => Promise<object>;
}

interface Globals {
    Actor: { create: (d: object) => Promise<ActorLike | null> };
    game: { actors: { get: (id: string) => ActorLike | undefined } };
}

/** Create a world actor from `data` and let its compendium join settle; returns its id. */
export async function createProbeActor(page: Page, data: object): Promise<string | null> {
    return page.evaluate(async (d: object) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as Globals;
        const actor = await g.Actor.create(d);
        if (actor === null) return null;
        await globalThis.wh40kE2E.settle(500);
        return actor.id;
    }, data);
}

/** Delete probe actors, ignoring ones already gone. */
export async function deleteProbeActors(page: Page, actorIds: readonly string[]): Promise<void> {
    await page.evaluate(async (ids: readonly string[]) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as Globals;
        for (const id of ids) {
            // eslint-disable-next-line no-await-in-loop -- sequential teardown of the probe's own documents
            await g.game.actors
                .get(id)
                ?.delete()
                .catch(() => undefined);
        }
    }, actorIds);
}

/**
 * Render an actor's sheet (or, with `itemName`, one of its items' sheets), switch it
 * to `tab`, and size it. A `'min'` width asks for 1 px, which Foundry clamps to the
 * window's CSS `min-width` (ApplicationV2#_updatePosition).
 */
export async function openProbeSheet(
    page: Page,
    actorId: string,
    opts: { itemName?: string; tab?: string; width?: SheetWidth } = {},
): Promise<OpenedSheet | null> {
    return page.evaluate(
        async (args: { actorId: string; itemName: string | null; tab: string | null; width: SheetWidth }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as Globals;
            const actor = g.game.actors.get(args.actorId);
            if (actor === undefined) return null;
            const sheet = args.itemName === null ? actor.sheet : actor.items.contents.find((item) => item.name === args.itemName)?.sheet;
            if (sheet === undefined) return null;
            const { waitFor, settle, scaledMs: scale } = globalThis.wh40kE2E;
            await sheet.render({ force: true });
            await waitFor(() => sheet.rendered, 'probe sheet render', scale(10_000));
            if (args.tab !== null) sheet.changeTab?.(args.tab, 'primary');
            if (args.width !== 'default') sheet.setPosition({ width: args.width === 'min' ? 1 : args.width });
            await settle(400);
            return { appId: sheet.id, width: Math.round(sheet.element.getBoundingClientRect().width) };
        },
        { actorId, itemName: opts.itemName ?? null, tab: opts.tab ?? null, width: opts.width ?? 'default' },
    );
}

/**
 * Whether every element matching `selector` inside the app lies within the box of its
 * nearest `containerSelector` ancestor, on both axes: a piece outside it is clipped
 * (the containers here hide their overflow).
 */
export async function allWithinContainer(page: Page, appId: string, selector: string, containerSelector: string): Promise<{ ok: boolean; detail: string }> {
    return page.evaluate(
        (args: { appId: string; selector: string; containerSelector: string }) => {
            const root = document.getElementById(args.appId);
            if (root === null) return { ok: false, detail: `no #${args.appId}` };
            const nodes = Array.from(root.querySelectorAll<HTMLElement>(args.selector));
            if (nodes.length === 0) return { ok: false, detail: `no ${args.selector}` };
            const clipped: string[] = [];
            const box = (r: DOMRect): string => `[${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}]`;
            for (const node of nodes) {
                const container = node.closest<HTMLElement>(args.containerSelector);
                if (container === null) continue;
                const outer = container.getBoundingClientRect();
                const inner = node.getBoundingClientRect();
                // 1 px of slack for sub-pixel rounding.
                const outside = inner.left < outer.left - 1 || inner.right > outer.right + 1 || inner.top < outer.top - 1 || inner.bottom > outer.bottom + 1;
                if (outside) clipped.push(`${node.textContent.trim().slice(0, 24)} ${box(inner)} outside ${box(outer)}`);
            }
            return { ok: clipped.length === 0, detail: clipped.join('; ') };
        },
        { appId, selector, containerSelector },
    );
}
