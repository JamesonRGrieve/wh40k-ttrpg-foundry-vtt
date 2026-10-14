import type { Page } from '@playwright/test';
import { popOutChatMessage, showChatMessage } from './lib/chat-capture';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { scaledMs } from './lib/timing';

/**
 * Shared steps for the combat-resolution Tier B specs (evasion, Counter Attack,
 * auto-fire, Without talents, passive modifiers): drive a roll the way a player
 * does — open the sheet, click the control, enter the d100 in the Roll Test
 * dialog's manual dice, submit — and find, read and capture the chat card it posts.
 *
 * Every outcome is fixed by entering the die by hand (the `allow-manual-roll` world
 * setting), so no assertion depends on a random d100.
 */

/** A posted chat card. */
export interface ChatCard {
    id: string;
    html: string;
}

/** World settings a spec changes, with the values to restore afterwards. */
export type SettingsSnapshot = Record<string, boolean>;

const SYSTEM_ID = 'wh40k-rpg';

/** The longest one UI action (a click, a fill, a wait for a window) may take before the step fails. */
const UI_ACTION_TIMEOUT_MS = scaledMs(20_000);

/**
 * Ready a freshly joined page for UI-driven steps: bound every locator action and
 * selector wait (Playwright's default is no limit, so one blocked click used to burn
 * the whole test budget), and clear the screen — the welcome tour, which core starts
 * a few seconds after `ready`, sits over the canvas and intercepts clicks.
 */
export async function prepareStage(page: Page): Promise<void> {
    page.setDefaultTimeout(UI_ACTION_TIMEOUT_MS);
    await clearScreenOverlays(page);
}

/** Set boolean world settings and return their previous values, for {@link restoreSettings}. */
export async function setWorldSettings(page: Page, values: SettingsSnapshot): Promise<SettingsSnapshot> {
    return page.evaluate(
        async ({ sys, next }) => {
            interface SettingsApi {
                get: (s: string, k: string) => boolean;
                set: (s: string, k: string, v: boolean) => Promise<object>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game.settings` has no browser-side types
            const { settings } = (globalThis as unknown as { game: { settings: SettingsApi } }).game;
            const previous: Record<string, boolean> = {};
            for (const [key, value] of Object.entries(next)) {
                previous[key] = settings.get(sys, key);
                await settings.set(sys, key, value);
            }
            return previous;
        },
        { sys: SYSTEM_ID, next: values },
    );
}

/** Put back the settings {@link setWorldSettings} changed. */
export async function restoreSettings(page: Page, previous: SettingsSnapshot): Promise<void> {
    await setWorldSettings(page, previous);
}

/** The ids of every chat message, to tell the next posts apart. */
export async function messageIds(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { messages: { contents: Array<{ id: string }> } } };
        return g.game.messages.contents.map((m) => m.id);
    });
}

/** Wait for a message posted after `before` whose content contains `marker`, and return it. */
export async function awaitCard(page: Page, before: readonly string[], marker: string): Promise<ChatCard> {
    return page.evaluate(
        async ({ seen, needle }): Promise<ChatCard> => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
            const g = globalThis as unknown as { game: { messages: { contents: Array<{ id: string; content: string }> } } };
            const known = new Set(seen);
            const newest = (): { id: string; content: string } | undefined =>
                g.game.messages.contents.find((m) => !known.has(m.id) && m.content.includes(needle));
            await globalThis.wh40kE2E.waitFor(() => newest() !== undefined, `a new chat card containing "${needle}"`);
            const message = newest();
            return { id: message?.id ?? '', html: message?.content ?? '' };
        },
        { seen: [...before], needle: marker },
    );
}

/** Whether any message posted after `before` contains `marker` (no wait). */
export async function anyNewCard(page: Page, before: readonly string[], marker: string): Promise<boolean> {
    return page.evaluate(
        ({ seen, needle }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
            const g = globalThis as unknown as { game: { messages: { contents: Array<{ id: string; content: string }> } } };
            const known = new Set(seen);
            return g.game.messages.contents.some((m) => !known.has(m.id) && m.content.includes(needle));
        },
        { seen: [...before], needle: marker },
    );
}

/** A message's current content (an attack card re-renders in place when its evasion resolves). */
export async function cardHtml(page: Page, id: string): Promise<string> {
    return page.evaluate((messageId) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { messages: { get: (i: string) => { content: string } | undefined } } };
        return g.game.messages.get(messageId)?.content ?? '';
    }, id);
}

/** Bring the chat log into view, clear overlays, and capture one card on its own. */
export async function snapCard(page: Page, label: string, id: string): Promise<string | null> {
    // The popout sizes to the card, so a long card is captured whole (the sidebar log cuts it off under the chat input).
    return snap(page, label, { selector: await popOutChatMessage(page, id) });
}

/**
 * A control inside a chat card in the sidebar chat log: the message element itself
 * (a bare `[data-message-id]` also matches the card's Delete control, and the
 * transient copy over the canvas is outside `#sidebar`).
 */
export function cardControl(id: string, control: string): string {
    return `#sidebar .chat-log .message[data-message-id="${id}"] ${control}`;
}

/** Click a control inside a chat card, with the chat log in view. */
export async function clickInCard(page: Page, id: string, control: string): Promise<void> {
    await showChatMessage(page, id);
    await page.locator(cardControl(id, control)).click();
}

/**
 * The Roll Test dialog's hero target once its count-up animation has settled (it
 * tweens from the previous target, so an early read or capture shows a passing
 * number). Null for a window without one.
 */
export async function settledTarget(page: Page, appId: string): Promise<number | null> {
    return page.evaluate(async (id) => {
        const read = (): string | null => document.getElementById(id)?.querySelector('.urd-target__number')?.textContent.trim() ?? null;
        if (read() === null) return null;
        let last = read();
        let stableFor = 0;
        await globalThis.wh40kE2E.waitFor(async () => {
            await globalThis.wh40kE2E.settle(100);
            const now = read();
            stableFor = now === last ? stableFor + 1 : 0;
            last = now;
            return stableFor >= 4;
        }, 'the dialog target to settle');
        return Number(last);
    }, appId);
}

/** Capture one open application window on its own, every other floating window closed. */
export async function snapWindow(page: Page, label: string, appId: string): Promise<string | null> {
    await settledTarget(page, appId);
    await clearScreenOverlays(page, appId);
    return snap(page, label, { selector: `#${appId}` });
}

/** Target the actor's token, as the GM does before an attack (each roll clears the target). */
export async function targetActor(page: Page, actorId: string): Promise<void> {
    await page.evaluate(async (id) => {
        interface TokenLike {
            actor: { id: string } | null;
            setTarget: (targeted: boolean, options: object) => void;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `canvas` / `game` globals have no browser-side types
        const g = globalThis as unknown as { canvas: { tokens: { placeables: TokenLike[] } }; game: { user: { targets: Set<TokenLike> } } };
        const token = g.canvas.tokens.placeables.find((t) => t.actor?.id === id);
        token?.setTarget(true, { releaseOthers: true, groupSelection: false });
        await globalThis.wh40kE2E.waitFor(() => g.game.user.targets.size === 1, 'the target to register');
    }, actorId);
}

/** The open Roll Test dialog's element id, once one is open. */
export async function awaitRollDialog(page: Page): Promise<string> {
    await page.waitForSelector('form.unified-roll-dialog');
    return page.evaluate(() => document.querySelector('form.unified-roll-dialog')?.id ?? '');
}

/** Close an application window by id. */
export async function closeWindow(page: Page, appId: string): Promise<void> {
    await page.evaluate(async (id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `foundry.applications.instances` has no browser-side types
        const apps = (globalThis as unknown as { foundry: { applications: { instances: Map<string, { close: () => Promise<object> }> } } }).foundry.applications
            .instances;
        await apps.get(id)?.close();
    }, appId);
}

/** Open the actor's weapon sheet and click its Attack card: returns the Roll Test dialog's id (the weapon sheet is closed again). */
export async function attackWith(page: Page, actorId: string, weaponId: string): Promise<string> {
    const sheetId = await page.evaluate(
        async ({ actor, weapon }) => {
            interface Sheet {
                id: string;
                render: (force: boolean) => Promise<object>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
            const g = globalThis as unknown as {
                game: { actors: { get: (id: string) => { items: { get: (id: string) => { sheet: Sheet } | undefined } } | undefined } };
            };
            const sheet = g.game.actors.get(actor)?.items.get(weapon)?.sheet;
            if (sheet === undefined) throw new Error('weapon sheet unavailable');
            await sheet.render(true);
            await globalThis.wh40kE2E.waitFor(() => document.querySelector(`#${CSS.escape(sheet.id)} [data-action="rollAttack"]`) !== null, 'the weapon sheet');
            return sheet.id;
        },
        { actor: actorId, weapon: weaponId },
    );
    await page.locator(`#${sheetId} [data-action="rollAttack"]`).click();
    const dialogId = await awaitRollDialog(page);
    await closeWindow(page, sheetId);
    return dialogId;
}

/** Open the actor's sheet on `tab` and return its element id. */
export async function openActorSheet(page: Page, actorId: string, tab: string): Promise<string> {
    return page.evaluate(
        async ({ actor, tabId }) => {
            interface Sheet {
                id: string;
                element: HTMLElement | null;
                render: (force: boolean) => Promise<object>;
                changeTab: (tab: string, group: string) => void;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
            const g = globalThis as unknown as { game: { actors: { get: (id: string) => { sheet: Sheet } | undefined } } };
            const sheet = g.game.actors.get(actor)?.sheet;
            if (sheet === undefined) throw new Error('actor sheet unavailable');
            await sheet.render(true);
            await globalThis.wh40kE2E.waitFor(() => sheet.element !== null, 'the actor sheet');
            sheet.changeTab(tabId, 'primary');
            await globalThis.wh40kE2E.settle(150);
            return sheet.id;
        },
        { actor: actorId, tabId: tab },
    );
}

/** Type a d100 result into the dialog's manual dice (tens + units; 100 is 0 + 0). */
export async function enterRoll(page: Page, dialogId: string, value: number): Promise<void> {
    await page.locator(`#${dialogId} #manual-tens`).fill(String(Math.floor(value / 10) % 10));
    await page.locator(`#${dialogId} #manual-units`).fill(String(value % 10));
    await page.evaluate(
        async ({ id, total }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `foundry.applications.instances` has no browser-side types
            const apps = (globalThis as unknown as { foundry: { applications: { instances: Map<string, { _manualRollTotal: number | null }> } } }).foundry
                .applications.instances;
            await globalThis.wh40kE2E.waitFor(() => apps.get(id)?._manualRollTotal === total, `the manual roll ${total}`);
        },
        { id: dialogId, total: value },
    );
}

/** Submit the entered roll; resolves once the dialog has closed. */
export async function submitRoll(page: Page, dialogId: string): Promise<void> {
    await page.locator(`#${dialogId} [data-action="submitToChat"]`).click();
    await page.waitForSelector(`#${dialogId}`, { state: 'detached' });
}

/** Pick an attack mode card (`standard`, `semiAuto`, `fullAuto`, `calledShot`, …) in an open weapon dialog. */
export async function selectAttackMode(page: Page, dialogId: string, modeKey: string): Promise<void> {
    await page.locator(`#${dialogId} [data-action="selectAttackMode"][data-mode-key="${modeKey}"]`).first().click();
    await page.waitForSelector(`#${dialogId} [data-action="selectAttackMode"][data-mode-key="${modeKey}"]`);
}

/** Read an actor flag under the system scope. */
export async function actorFlag(page: Page, actorId: string, key: string): Promise<object | null> {
    return page.evaluate(
        ({ id, sys, flagKey }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types; the flags read here are objects
            const g = globalThis as unknown as {
                game: { actors: { get: (i: string) => { getFlag: (s: string, k: string) => object | undefined } | undefined } };
            };
            return g.game.actors.get(id)?.getFlag(sys, flagKey) ?? null;
        },
        { id: actorId, sys: SYSTEM_ID, flagKey: key },
    );
}

/** Set an actor flag under the system scope. */
export async function setActorFlag(page: Page, actorId: string, key: string, value: object): Promise<void> {
    await page.evaluate(
        async ({ id, sys, flagKey, flagValue }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
            const g = globalThis as unknown as {
                game: { actors: { get: (i: string) => { setFlag: (s: string, k: string, v: object) => Promise<object> } | undefined } };
            };
            await g.game.actors.get(id)?.setFlag(sys, flagKey, flagValue);
        },
        { id: actorId, sys: SYSTEM_ID, flagKey: key, flagValue: value },
    );
}

/** An actor to create: its document data, compendium items to copy onto it (equipped where asked), and inline items. */
export interface ActorSpec {
    data: object;
    /** `system` is shallow-merged over the copy's own (e.g. the Specialisation a talent was bought under). */
    compendiumItems?: Array<{ uuid: string; equip?: boolean; system?: object }>;
    items?: object[];
}

/** A created actor and its owned items' ids, keyed by item name. */
export interface CreatedActor {
    id: string;
    items: Record<string, string>;
}

/** Create an actor and give it its items; compendium items are copied whole (a world copy, as a GM drag does). */
export async function createActor(page: Page, spec: ActorSpec): Promise<CreatedActor> {
    return page.evaluate(async (actorSpec): Promise<CreatedActor> => {
        interface ItemDoc {
            id: string;
            name: string;
        }
        interface ItemData {
            system: { state?: { equipped?: boolean } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (Actor, fromUuid) have no browser-side types
        const g = globalThis as unknown as {
            Actor: { create: (data: object) => Promise<{ id: string; createEmbeddedDocuments: (type: string, data: object[]) => Promise<ItemDoc[]> }> };
            fromUuid: (uuid: string) => Promise<{ toObject: () => ItemData } | null>;
        };
        const actor = await g.Actor.create(actorSpec.data);
        const itemData: object[] = [...(actorSpec.items ?? [])];
        for (const entry of actorSpec.compendiumItems ?? []) {
            const source = await g.fromUuid(entry.uuid);
            if (source === null) throw new Error(`compendium item not found: ${entry.uuid}`);
            const data = source.toObject();
            data.system = { ...data.system, ...entry.system };
            if (entry.equip === true) data.system.state = { ...data.system.state, equipped: true };
            itemData.push(data);
        }
        const created = itemData.length === 0 ? [] : await actor.createEmbeddedDocuments('Item', itemData);
        return { id: actor.id, items: Object.fromEntries(created.map((item) => [item.name, item.id])) };
    }, spec);
}

/** A scene with each actor's token placed, viewed; remembers the scene it replaced. */
export interface StagedScene {
    sceneId: string;
    previousSceneId: string | null;
}

/** Create and view a gridded scene holding one token per actor at the given position. */
export async function stageScene(page: Page, name: string, placements: Array<{ actorId: string; x: number; y: number }>): Promise<StagedScene> {
    return page.evaluate(
        async ({ sceneName, tokens }): Promise<StagedScene> => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (Scene, game, canvas) have no browser-side types
            const g = globalThis as unknown as {
                Scene: {
                    create: (
                        data: object,
                    ) => Promise<{ id: string; view: () => Promise<void>; createEmbeddedDocuments: (t: string, d: object[]) => Promise<object[]> }>;
                };
                game: {
                    scenes: { viewed?: { id: string } | null };
                    actors: { get: (id: string) => { getTokenDocument: (data: object) => Promise<{ toObject: () => object }> } | undefined };
                };
                canvas: { tokens?: { placeables: object[] } };
            };
            const previousSceneId = g.game.scenes.viewed?.id ?? null;
            const scene = await g.Scene.create({ name: sceneName, width: 1200, height: 800, grid: { size: 100 } });
            const data: object[] = [];
            for (const token of tokens) {
                const doc = await g.game.actors.get(token.actorId)?.getTokenDocument({ x: token.x, y: token.y });
                if (doc === undefined) throw new Error(`no actor ${token.actorId} to place`);
                data.push(doc.toObject());
            }
            await scene.createEmbeddedDocuments('Token', data);
            await scene.view();
            await globalThis.wh40kE2E.waitFor(
                () => (g.canvas.tokens?.placeables.length ?? 0) >= tokens.length,
                'the tokens to draw',
                globalThis.wh40kE2E.scaledMs(20_000),
            );
            return { sceneId: scene.id, previousSceneId };
        },
        { sceneName: name, tokens: placements },
    );
}

/** Start a combat on the viewed scene with each actor's token as a combatant at the given initiative; returns its id. */
export async function startCombat(page: Page, sceneId: string, order: Array<{ actorId: string; initiative: number }>): Promise<string> {
    return page.evaluate(
        async ({ scene, combatants }) => {
            interface CombatDoc {
                id: string;
                createEmbeddedDocuments: (type: string, data: object[]) => Promise<object[]>;
                startCombat: () => Promise<void>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (Combat, game) have no browser-side types
            const g = globalThis as unknown as {
                Combat: { create: (data: object) => Promise<CombatDoc> };
                game: { scenes: { get: (id: string) => { tokens: { contents: Array<{ id: string; actorId: string }> } } | undefined } };
            };
            const tokens = g.game.scenes.get(scene)?.tokens.contents ?? [];
            const combat = await g.Combat.create({ scene, active: true });
            await combat.createEmbeddedDocuments(
                'Combatant',
                combatants.map((c) => ({
                    tokenId: tokens.find((t) => t.actorId === c.actorId)?.id,
                    sceneId: scene,
                    actorId: c.actorId,
                    initiative: c.initiative,
                })),
            );
            await combat.startCombat();
            return combat.id;
        },
        { scene: sceneId, combatants: order },
    );
}

/** Advance the combat to its next turn (the new combatant's actions reset). */
export async function nextTurn(page: Page, combatId: string): Promise<void> {
    await page.evaluate(async (id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { combats: { get: (i: string) => { nextTurn: () => Promise<object> } | undefined } } };
        await g.game.combats.get(id)?.nextTurn();
    }, combatId);
}

/** View a scene again by id (teardown: return to the scene a spec replaced). */
export async function viewScene(page: Page, sceneId: string | null): Promise<void> {
    if (sceneId === null) return;
    await page.evaluate(async (id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { scenes: { get: (i: string) => { view: () => Promise<void> } | undefined } } };
        await g.game.scenes.get(id)?.view();
    }, sceneId);
}

/** Delete documents by id from their world collections (best-effort; for teardown). */
export async function deleteDocuments(page: Page, docs: { actors?: string[]; scenes?: string[]; combats?: string[] }): Promise<void> {
    await page.evaluate(async (ids) => {
        interface Deletable {
            delete: () => Promise<object>;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as Record<'game', Record<'actors' | 'scenes' | 'combats', { get: (id: string) => Deletable | undefined }>>;
        for (const id of ids.combats ?? []) await g.game.combats.get(id)?.delete();
        for (const id of ids.scenes ?? []) await g.game.scenes.get(id)?.delete();
        for (const id of ids.actors ?? []) await g.game.actors.get(id)?.delete();
    }, docs);
}
