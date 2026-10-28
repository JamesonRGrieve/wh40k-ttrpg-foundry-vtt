import { expect, type Page } from '@playwright/test';
import { showChatMessage } from './lib/chat-capture';
import { clearScreenOverlays, snap } from './lib/screenshot';

/**
 * Sheet-driven helpers shared by the occult / corruption / Fate specs
 * (daemonology-ritual, fate, malignancy, mutant-background-dialog,
 * sanctic-daemonology). Each spec drives the real UI — open the sheet, click
 * the control, fill the dialog, read the posted card — and these keep the
 * Foundry plumbing (actor seeding, deterministic dice, chat lookup) in one place.
 */

/** The probe actors every helper creates are named with this prefix, so cleanup finds them all. */
export const PROBE_PREFIX = 'e2e-occult-';

/** Foundry dice uniform forcing every die to its lowest face: ceil((1 − 0.995) × faces) = 1. */
export const LOWEST_FACE = 0.995;

/** Foundry dice uniform forcing every die to its highest face: ceil((1 − 0) × faces) = faces. */
export const HIGHEST_FACE = 0;

/** A value read back out of the page: actor system data and flags are plain JSON. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** The browser-side Foundry surface these helpers touch. */
interface FlowActor {
    id: string;
    name: string;
    sheet: { id: string; render: (options: { force: boolean }) => Promise<object>; changeTab?: (tab: string, group: string) => void };
    system: { [key: string]: JsonValue };
    getFlag: (scope: string, key: string) => JsonValue | undefined;
    delete: () => Promise<object>;
}
interface FlowWindow {
    Actor: { create: (data: object) => Promise<FlowActor | null> };
    CONFIG: { Dice: { randomUniform: () => number } };
    game: {
        actors: { get: (id: string) => FlowActor | undefined; contents: FlowActor[] };
        messages: { contents: Array<{ id: string; content: string; flavor?: string; delete: () => Promise<object> }> };
    };
    occultSavedUniform?: (() => number) | undefined;
}

/** What a seeded probe actor needs. */
export interface ProbeActorData {
    name: string;
    type: string;
    system?: object;
    flags?: object;
    items?: object[];
}

/** Create a probe actor, open its sheet on the Overview tab, and return the actor and sheet ids. */
export async function openProbeSheet(page: Page, data: ProbeActorData, tab = 'overview'): Promise<{ actorId: string; sheetId: string }> {
    const ids = await page.evaluate(
        async ({ actorData, prefix }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals (Actor, game) have no repo types
            const w = globalThis as unknown as FlowWindow;
            const actor = await w.Actor.create({ ...actorData, name: `${prefix}${actorData.name}` });
            if (actor === null) throw new Error('Actor.create returned null');
            return { actorId: actor.id, sheetId: actor.sheet.id };
        },
        { actorData: data, prefix: PROBE_PREFIX },
    );
    await showSheetTab(page, ids.actorId, tab);
    return ids;
}

/** (Re)open an actor's sheet and click its `tab` in the tab strip, as a player would. */
export async function showSheetTab(page: Page, actorId: string, tab: string): Promise<void> {
    const sheetId = await page.evaluate(async (id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const actor = (globalThis as unknown as FlowWindow).game.actors.get(id);
        if (actor === undefined) throw new Error(`actor ${id} missing`);
        await actor.sheet.render({ force: true });
        return actor.sheet.id;
    }, actorId);
    await page.locator(`#${sheetId} [data-action="tab"][data-tab="${tab}"]`).first().click();
    await expect(page.locator(`#${sheetId} section.tab[data-tab="${tab}"]`)).toHaveClass(/active/);
}

/** Embed compendium documents (by UUID) on an actor, as a drop from the compendium would; returns the new item ids. */
export async function addCompendiumItems(page: Page, actorId: string, uuids: readonly string[]): Promise<string[]> {
    return page.evaluate(
        async ({ id, sources }) => {
            interface ItemsGlobal {
                fromUuid: (uuid: string) => Promise<object | null>;
                game: {
                    items: { fromCompendium: (doc: object) => object };
                    actors: {
                        get: (i: string) =>
                            | {
                                  createEmbeddedDocuments: (
                                      type: string,
                                      data: object[],
                                  ) => Promise<Array<{ id: string; _stats: { compendiumSource: string | null } }>>;
                              }
                            | undefined;
                    };
                };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals (fromUuid, game) have no repo types
            const w = globalThis as unknown as ItemsGlobal;
            const docs = await Promise.all(sources.map(async (uuid) => w.fromUuid(uuid)));
            const data = docs.map((doc, i) => {
                if (doc === null) throw new Error(`compendium document ${sources[i] ?? ''} not found`);
                return w.game.items.fromCompendium(doc);
            });
            const actor = w.game.actors.get(id);
            if (actor === undefined) throw new Error(`actor ${id} missing`);
            const created = await actor.createEmbeddedDocuments('Item', data);
            // Match each item to its source rather than trusting the returned order: the
            // creation pipeline can hand them back reordered, and a Dark Pact capture once
            // opened the armour's sheet in its place.
            return sources.map((uuid) => {
                const match = created.find((item) => item._stats.compendiumSource === uuid);
                if (match === undefined) throw new Error(`no item was created from ${uuid}`);
                return match.id;
            });
        },
        { id: actorId, sources: [...uuids] },
    );
}

/** Read a dotted path off a live actor's system data. */
export async function readActorSystem(page: Page, actorId: string, path: string): Promise<JsonValue | undefined> {
    return page.evaluate(
        ({ id, dotted }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as FlowWindow;
            const actor = w.game.actors.get(id);
            if (actor === undefined) throw new Error(`actor ${id} missing`);
            let node: JsonValue | undefined = actor.system;
            for (const key of dotted.split('.')) {
                node = node !== null && typeof node === 'object' && !Array.isArray(node) ? node[key] : undefined;
            }
            return node;
        },
        { id: actorId, dotted: path },
    );
}

/** Read one of the system's flags off a live actor. */
export async function readActorFlag(page: Page, actorId: string, key: string): Promise<JsonValue | undefined> {
    return page.evaluate(
        ({ id, flagKey }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            return (globalThis as unknown as FlowWindow).game.actors.get(id)?.getFlag('wh40k-rpg', flagKey);
        },
        { id: actorId, flagKey: key },
    );
}

/** Force every die rolled from now on to one face (see {@link LOWEST_FACE} / {@link HIGHEST_FACE}) until {@link restoreDice}. */
export async function forceDice(page: Page, uniform: number): Promise<void> {
    await page.evaluate((u) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals (CONFIG) have no repo types
        const w = globalThis as unknown as FlowWindow;
        // Keep the original across repeated forces, so restoreDice puts Foundry's own back.
        const original = w.occultSavedUniform ?? w.CONFIG.Dice.randomUniform;
        w.occultSavedUniform = original;
        Object.assign(w.CONFIG.Dice, { randomUniform: (): number => u });
    }, uniform);
}

/** Put Foundry's dice back after {@link forceDice}. */
export async function restoreDice(page: Page): Promise<void> {
    await page.evaluate(() => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals (CONFIG) have no repo types
        const w = globalThis as unknown as FlowWindow;
        if (w.occultSavedUniform !== undefined) Object.assign(w.CONFIG.Dice, { randomUniform: w.occultSavedUniform });
        w.occultSavedUniform = undefined;
    });
}

/** The ids of every chat message now in the log. */
export async function messageIds(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        return (globalThis as unknown as FlowWindow).game.messages.contents.map((m) => m.id);
    });
}

/** A chat message the flow posted. */
export interface PostedMessage {
    id: string;
    content: string;
    flavor: string;
}

/**
 * Wait for a message not in `before` whose content (or flavor) matches `marker`,
 * and return it. Fails the test when none arrives.
 */
export async function waitForMessage(page: Page, before: readonly string[], marker: string): Promise<PostedMessage> {
    const holder: { found: PostedMessage | null } = { found: null };
    await expect
        .poll(
            async () => {
                holder.found = await page.evaluate(
                    ({ seen, needle }) => {
                        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                        const w = globalThis as unknown as FlowWindow;
                        const known = new Set(seen);
                        const hit = w.game.messages.contents.find((m) => !known.has(m.id) && (m.content.includes(needle) || (m.flavor ?? '').includes(needle)));
                        return hit === undefined ? null : { id: hit.id, content: hit.content, flavor: hit.flavor ?? '' };
                    },
                    { seen: [...before], needle: marker },
                );
                return holder.found !== null;
            },
            { message: `no new chat message containing "${marker}"` },
        )
        .toBe(true);
    if (holder.found === null) throw new Error(`no new chat message containing "${marker}"`);
    return holder.found;
}

/** How many pixels of a chat popout's card are scrolled out of its window (0 when it shows whole). */
async function popoutOverflow(page: Page, popoutId: string): Promise<number> {
    return page.evaluate((id) => {
        const popout = document.getElementById(id);
        const content = popout?.querySelector<HTMLElement>('.window-content');
        if (popout === null || content === undefined || content === null) throw new Error(`popout ${id} has no content`);
        // The window clips as well as scrolls: measure every child's foot against the window's own.
        const foot = Math.max(...Array.from(content.querySelectorAll<HTMLElement>('*'), (el) => el.getBoundingClientRect().bottom));
        const clipped = Math.ceil(foot - Math.min(popout.getBoundingClientRect().bottom, content.getBoundingClientRect().bottom));
        return Math.max(0, clipped, content.scrollHeight - content.clientHeight);
    }, popoutId);
}

/** The viewport rectangle of a popout's width, from the top of `from` to the foot of `to`, with a small margin. */
async function regionClip(
    page: Page,
    popoutId: string,
    region: { from: string; to: string },
): Promise<{ x: number; y: number; width: number; height: number }> {
    return page.evaluate(
        ({ id, from, to }) => {
            const popout = document.getElementById(id);
            const top = popout?.querySelector(from)?.getBoundingClientRect();
            const foot = popout?.querySelector(to)?.getBoundingClientRect();
            const frame = popout?.getBoundingClientRect();
            if (top === undefined || foot === undefined || frame === undefined) throw new Error(`region ${from} → ${to} not in popout ${id}`);
            const y = Math.max(0, top.top - 8);
            return { x: frame.left, y, width: frame.width, height: foot.bottom + 8 - y };
        },
        { id: popoutId, ...region },
    );
}

/**
 * Snap one message by id. The card is first shown in the sidebar chat log (where
 * the player sees it), then framed whole in Foundry's own chat popout — the window
 * the log's "Pop Out" entry opens — because a tall card's foot (a ritual's outcome
 * block) sits under the sidebar's message editor and would be cut off in the log.
 *
 * The popout is clamped to the viewport, so a card taller than the window scrolled
 * inside it and the capture cut its text mid-sentence (the #699 audit). The viewport
 * grows until the whole card fits, for the capture only. Pass `region` to frame one
 * part of the card: the popout's width, from the top of `region.from` to the foot of
 * `region.to` (selectors inside the popout).
 */
export async function snapMessage(page: Page, label: string, messageId: string, region?: { from: string; to: string }): Promise<void> {
    await clearScreenOverlays(page);
    // `#sidebar .chat-log .message[data-message-id=…]`: exactly the one message in the sidebar log.
    const logSelector = await showChatMessage(page, messageId);
    await expect(page.locator(logSelector)).toBeVisible();
    const popoutId = await page.evaluate(async (id) => {
        interface PopoutGlobals {
            CONFIG: {
                ChatMessage: {
                    popoutClass: new (options: { message: object; position: { left: number; top: number } }) => {
                        id: string;
                        render: (o: { force: boolean }) => Promise<object>;
                    };
                };
            };
            game: { messages: { get: (i: string) => object | undefined } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals (CONFIG, game) have no repo types
        const w = globalThis as unknown as PopoutGlobals;
        const message = w.game.messages.get(id);
        if (message === undefined) throw new Error(`message ${id} missing`);
        const popout = new w.CONFIG.ChatMessage.popoutClass({ message, position: { left: 420, top: 10 } });
        await popout.render({ force: true });
        return popout.id;
    }, messageId);
    await expect(page.locator(`#${popoutId}`)).toBeVisible();
    const viewport = page.viewportSize();
    const hidden = await popoutOverflow(page, popoutId);
    if (hidden > 0 && viewport !== null) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height + hidden + 40 });
        await page.evaluate(async (id) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals (foundry.applications.instances) have no repo types
            const apps = (globalThis as unknown as { foundry: { applications: { instances: Map<string, { setPosition: (p: object) => void }> } } }).foundry
                .applications.instances;
            apps.get(id)?.setPosition({ top: 10, height: 'auto' });
            await globalThis.wh40kE2E.settle(300);
        }, popoutId);
    }
    try {
        expect(await popoutOverflow(page, popoutId), `${label}: the card scrolls inside its popout, so the capture cuts it off`).toBe(0);
        const clip = region === undefined ? null : await regionClip(page, popoutId, region);
        const shot = clip === null ? await snap(page, label, { selector: `#${popoutId}` }) : await snap(page, label, { clip });
        expect(shot, `snap ${label}`).not.toBeNull();
    } finally {
        if (hidden > 0 && viewport !== null) await page.setViewportSize(viewport);
    }
    await page.evaluate(async (id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals (foundry.applications.instances) have no repo types
        const apps = (globalThis as unknown as { foundry: { applications: { instances: Map<string, { close: () => Promise<object> }> } } }).foundry.applications
            .instances;
        await apps.get(id)?.close();
    }, popoutId);
}

/** Clear overlays and other windows, keeping `keepId`'s window, and snap `selector`. */
export async function snapElement(page: Page, label: string, selector: string, keepId: string): Promise<void> {
    await clearScreenOverlays(page, keepId);
    await expect(page.locator(selector).first()).toBeVisible();
    expect(await snap(page, label, { selector }), `snap ${label}`).not.toBeNull();
}

/** Delete every probe actor and the messages posted since `before`, and restore the dice. */
export async function cleanupProbes(page: Page, before: readonly string[] = []): Promise<void> {
    await restoreDice(page);
    await page.evaluate(
        async ({ prefix, seen }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as FlowWindow;
            const known = new Set(seen);
            for (const actor of w.game.actors.contents.filter((a) => a.name.startsWith(prefix))) {
                // eslint-disable-next-line no-await-in-loop -- sequential deletes keep the world's socket traffic ordered
                await actor.delete();
            }
            if (seen.length === 0) return;
            for (const message of w.game.messages.contents.filter((m) => !known.has(m.id))) {
                // eslint-disable-next-line no-await-in-loop -- sequential deletes keep the world's socket traffic ordered
                await message.delete();
            }
        },
        { prefix: PROBE_PREFIX, seen: [...before] },
    );
}
