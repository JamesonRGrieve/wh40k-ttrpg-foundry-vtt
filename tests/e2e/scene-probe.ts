import type { Locator, Page } from '@playwright/test';
import { showChatMessage } from './lib/chat-capture';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { scaledMs } from './lib/timing';

/**
 * Probe fixtures for the Tier B specs that need a viewed scene with a placed
 * character token (scene environment, hazards, portraits): build the scene and
 * its actors, view it, control a token, start a combat, and tear it all down.
 * Setup only — the specs drive the feature under test through its real UI.
 */

/** One probe actor to create and place. */
export interface ProbeActorSpec {
    name: string;
    type: string;
    system: object;
    items?: object[];
    /** Canvas position of its token. */
    x: number;
    y: number;
}

/** Ids of everything a probe created, for the spec and for cleanup. */
export interface ProbeScene {
    sceneId: string;
    actorIds: string[];
    tokenIds: string[];
    combatId: string | null;
    error: string | null;
}

/** The scene grid size the probe uses, so a spec can frame tokens on the canvas. */
export const PROBE_GRID = 100;

/** How long a posted card may take to render into the sidebar chat log. */
const CARD_RENDER_TIMEOUT_MS = scaledMs(15_000);

/**
 * Create a scene, the given actors with a linked token each, and view it.
 * `environment` seeds the scene's `flags.wh40k-rpg.environment` (omit for the default).
 */
export async function createProbeScene(page: Page, name: string, actors: readonly ProbeActorSpec[], environment?: object): Promise<ProbeScene> {
    return page.evaluate(
        async (args): Promise<ProbeScene> => {
            interface ActorDoc {
                id: string;
                getTokenDocument: (data: { x: number; y: number; actorLink: boolean }) => Promise<{ toObject: () => object }>;
            }
            interface SceneDoc {
                id: string;
                view: () => Promise<void>;
                createEmbeddedDocuments: (type: string, data: object[]) => Promise<Array<{ id: string }>>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                Actor: { create: (data: object) => Promise<ActorDoc | null> };
                Scene: { create: (data: object) => Promise<SceneDoc | null> };
                canvas: { ready: boolean; scene: { id: string } | null; tokens?: { placeables: object[] } };
            };
            const out: ProbeScene = { sceneId: '', actorIds: [], tokenIds: [], combatId: null, error: null };
            try {
                const flags = args.environment === undefined ? {} : { 'wh40k-rpg': { environment: args.environment } };
                const scene = await g.Scene.create({ name: args.name, width: 1200, height: 900, grid: { size: args.grid }, flags });
                if (scene === null) return { ...out, error: 'Scene.create returned null' };
                out.sceneId = scene.id;
                const tokens: object[] = [];
                for (const spec of args.actors) {
                    // eslint-disable-next-line no-await-in-loop -- each actor must exist before its token document is built
                    const actor = await g.Actor.create({ name: spec.name, type: spec.type, system: spec.system, items: spec.items ?? [] });
                    if (actor === null) return { ...out, error: `Actor.create returned null for ${spec.name}` };
                    out.actorIds.push(actor.id);
                    // eslint-disable-next-line no-await-in-loop -- see above
                    const td = await actor.getTokenDocument({ x: spec.x, y: spec.y, actorLink: true });
                    tokens.push(td.toObject());
                }
                const placed = await scene.createEmbeddedDocuments('Token', tokens);
                out.tokenIds = placed.map((t) => t.id);
                await scene.view();
                await globalThis.wh40kE2E.pollUntil(
                    () => g.canvas.ready && g.canvas.scene?.id === scene.id && (g.canvas.tokens?.placeables.length ?? 0) === tokens.length,
                    globalThis.wh40kE2E.scaledMs(20_000),
                );
                return out;
            } catch (err) {
                return { ...out, error: err instanceof Error ? err.message : String(err) };
            }
        },
        { name, actors, environment, grid: PROBE_GRID },
    );
}

/** Control (select) the probe tokens with these ids on the canvas, releasing any others. */
export async function controlTokens(page: Page, tokenIds: readonly string[]): Promise<void> {
    await page.evaluate((ids: readonly string[]) => {
        interface TokenLayer {
            releaseAll: () => void;
            get: (id: string) => { control: (o: object) => boolean } | undefined;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `canvas` global is injected by the licensed app; no shipped types
        const c = (globalThis as unknown as { canvas: { tokens: TokenLayer } }).canvas;
        c.tokens.releaseAll();
        for (const id of ids) c.tokens.get(id)?.control({ releaseOthers: false });
    }, tokenIds);
}

/** Start a combat on the probe scene with the given tokens, the first token's turn current. */
export async function startCombat(page: Page, sceneId: string, tokenIds: readonly string[]): Promise<string | null> {
    return page.evaluate(
        async (args): Promise<string | null> => {
            interface CombatDoc {
                id: string;
                createEmbeddedDocuments: (type: string, data: object[]) => Promise<object[]>;
                startCombat: () => Promise<object>;
                update: (data: object) => Promise<object>;
                activate: () => Promise<object>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `Combat` global is injected by the licensed app; no shipped types
            const g = globalThis as unknown as { Combat: { create: (data: object) => Promise<CombatDoc | null> } };
            const combat = await g.Combat.create({ scene: args.sceneId, active: true });
            if (combat === null) return null;
            await combat.createEmbeddedDocuments(
                'Combatant',
                args.tokenIds.map((tokenId, i) => ({ tokenId, sceneId: args.sceneId, initiative: 50 - i })),
            );
            await combat.startCombat();
            await combat.update({ turn: 0 });
            return combat.id;
        },
        { sceneId, tokenIds },
    );
}

/** Delete every document a probe created (combat, scene, actors). Best-effort. */
export async function deleteProbeScene(page: Page, probe: ProbeScene): Promise<void> {
    await page.evaluate(async (p: ProbeScene) => {
        interface Deletable {
            delete: () => Promise<object>;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            game: {
                combats: { get: (id: string) => Deletable | undefined };
                scenes: { get: (id: string) => Deletable | undefined };
                actors: { get: (id: string) => Deletable | undefined };
            };
        };
        const drop = async (doc: Deletable | undefined): Promise<void> => {
            try {
                await doc?.delete();
            } catch {
                /* already gone */
            }
        };
        if (p.combatId !== null) await drop(g.game.combats.get(p.combatId));
        await drop(g.game.scenes.get(p.sceneId));
        await Promise.all(p.actorIds.map(async (id) => drop(g.game.actors.get(id))));
    }, probe);
}

/** Set the viewed probe scene's environment flag directly (setup for a later step, not the GM flow under test). */
export async function setSceneEnvironment(page: Page, sceneId: string, environment: object): Promise<void> {
    await page.evaluate(
        async (args) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: { scenes: { get: (id: string) => { setFlag: (s: string, k: string, v: object) => Promise<object> } | undefined } };
            };
            await g.game.scenes.get(args.sceneId)?.setFlag('wh40k-rpg', 'environment', args.environment);
        },
        { sceneId, environment },
    );
}

/**
 * Capture one open application window: close every other floating window, clear
 * the overlays, and snap the window by its own id.
 */
export async function snapWindow(page: Page, label: string, appWindow: Locator): Promise<string | null> {
    const id = (await appWindow.getAttribute('id')) ?? '';
    await clearScreenOverlays(page, id === '' ? undefined : id);
    return snap(page, label, id === '' ? {} : { selector: `#${id}` });
}

/** The ids of every chat message in the log, to diff the cards a step posts. */
export async function chatMessageIds(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { messages: { contents: Array<{ id: string }> } } };
        return g.game.messages.contents.map((m) => m.id);
    });
}

/** A chat card posted since `before`: its id and rendered content. */
export interface PostedCard {
    id: string;
    content: string;
}

/** Wait for the chat cards posted since `before` (at least `count`) and return them, oldest first. */
export async function waitForNewCards(page: Page, before: readonly string[], count = 1): Promise<PostedCard[]> {
    return page.evaluate(
        async (args): Promise<PostedCard[]> => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
            const g = globalThis as unknown as { game: { messages: { contents: Array<{ id: string; content: string }> } } };
            const seen = new Set(args.before);
            const fresh = (): Array<{ id: string; content: string }> => g.game.messages.contents.filter((m) => !seen.has(m.id));
            await globalThis.wh40kE2E.pollUntil(() => fresh().length >= args.count);
            return fresh().map((m) => ({ id: m.id, content: m.content }));
        },
        { before, count },
    );
}

/** The first chat card posted since `before`; fails the step when none arrives. */
export async function firstNewCard(page: Page, before: readonly string[]): Promise<PostedCard> {
    const cards = await waitForNewCards(page, before);
    const [card] = cards;
    if (cards.length === 0) throw new Error('no chat card was posted');
    return card;
}

/**
 * Show the chat log, clear overlays and capture one posted card by its message id.
 * Floating windows are closed except those whose id contains `keepWindow`.
 */
export async function snapChatCard(page: Page, label: string, messageId: string, keepWindow?: string): Promise<string | null> {
    await clearScreenOverlays(page, keepWindow);
    const selector = await showChatMessage(page, messageId);
    await page.waitForSelector(selector, { timeout: CARD_RENDER_TIMEOUT_MS });
    return snap(page, label, { selector });
}
