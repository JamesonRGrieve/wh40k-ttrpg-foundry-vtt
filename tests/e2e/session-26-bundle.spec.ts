import type { Page } from '@playwright/test';
import { createPlayer, deleteDocuments } from './combat-resolution-flow';
import { type HarnessScene, installAttackHarness } from './lib/attack-harness';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsUser, joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B for the Session 26 bundle, one flow per fix, on a live world:
 * - two unlinked copies of one creature in combat keep their own action budgets:
 *   one dodging leaves the other its Reaction (#777);
 * - a player heals an unlinked token they don't own: the GM proxy changes that
 *   token's actor, not the world actor it was copied from (#782);
 * - a token smaller than a square snaps to the centre of its square, through the
 *   document and on a keyboard move (#774);
 * - a crit row's stated duration lands on its condition effect (#766);
 * - the GM opens the party XP award from a character sheet, every character
 *   ticked (#553);
 * - an NPC's Faction & Allegiance fields keep what was typed, and its Custom Stat
 *   Overrides are editable (playtest report, 2026-11-24);
 * - with no condition documents for the line (a public install), the Create
 *   Active Effect dialog offers the registered token statuses and applies one.
 *
 * Each flow records under `session-26.flow`. Keys MUST match SESSION_26_FLOWS in
 * scripts/e2e-coverage.mjs.
 */
const SESSION_26_FLOWS = [
    'per-token-reaction-budget',
    'proxy-heals-unowned-token',
    'sub-square-token-centred',
    'crit-condition-duration',
    'party-xp-from-sheet',
    'npc-faction-holds',
    'npc-custom-stats-editable',
    'npc-combat-tab-fatigue',
    'npc-sidebar-rows-stacked',
    'effect-picker-falls-back-to-statuses',
    'armour-notice-equips',
] as const;
type FlowName = (typeof SESSION_26_FLOWS)[number];

const PLAYER = 'E2E Bundle Player';
const MODULE_ROOT = '/systems/wh40k-rpg/module';

/** Snap a sub-square token through the document and move it one square right by keyboard; read where it lands. */
async function snapSubSquare(
    page: Page,
    sceneId: string,
    tokenId: string,
): Promise<{ width: number; height: number; snapped: { x: number; y: number }; moved: { x: number; y: number }; cls: string }> {
    return page.evaluate(
        async ({ scene, id }) => {
            interface TokenDocLike {
                x: number;
                y: number;
                width: number;
                update: (d: object, o?: object) => Promise<object | undefined>;
                getSnappedPosition: (d: object) => { x: number; y: number };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: { scenes: { get: (i: string) => { tokens: { get: (i: string) => TokenDocLike | undefined } } | undefined } };
            };
            const doc = g.game.scenes.get(scene)?.tokens.get(id);
            if (doc === undefined) throw new Error('no token');
            // A size change is a movement in V14; teleport so it isn't animated or vetoed.
            await doc.update({ width: 0.75, height: 0.75 }, { teleport: true, animate: false });
            // Snap with the token's own size, as a drag, drop or keyboard move does.
            const snapped = doc.getSnappedPosition({ x: 300, y: 500 });
            // eslint-disable-next-line no-restricted-syntax -- boundary: the token document's height, read for the result
            const height = (doc as unknown as { height: number }).height;
            await doc.update({ x: snapped.x, y: snapped.y }, { teleport: true, animate: false });
            return { width: doc.width, height, snapped, moved: { x: doc.x, y: doc.y }, cls: doc.constructor.name };
        },
        { scene: sceneId, id: tokenId },
    );
}

/** Apply a crit row that Stuns for 2 rounds to an actor; read the Stunned effect's duration. */
async function applyTimedCrit(page: Page, actorId: string): Promise<{ rounds: number | null; label: string }> {
    return page.evaluate(
        async ({ root, id }) => {
            interface EffectLike {
                statuses: Set<string>;
                duration: { rounds?: number | null; value?: number | null };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as { game: { actors: { get: (i: string) => { effects: { contents: EffectLike[] } } | undefined } } };
            const effects = (await import(/* @vite-ignore */ `${root}/rules/active-effects.js`)) as {
                applyCriticalDamageConditions: (actor: object, record: object) => Promise<{ conditionDurations: Array<{ label: string }> }>;
            };
            const crit = (await import(/* @vite-ignore */ `${root}/rules/critical-damage.js`)) as {
                classifyCriticalEffect: (text: string) => object;
            };
            const actor = g.game.actors.get(id);
            if (actor === undefined) throw new Error('no actor');
            const record = {
                damageType: 'impact',
                bodyPart: 'body',
                severity: 3,
                effect: '',
                riders: crit.classifyCriticalEffect('The target is Stunned for 2 rounds.'),
            };
            const report = await effects.applyCriticalDamageConditions(actor, record);
            const stunned = actor.effects.contents.find((e) => e.statuses.has('stunned'));
            return { rounds: stunned?.duration.rounds ?? stunned?.duration.value ?? null, label: report.conditionDurations.at(0)?.label ?? '' };
        },
        { root: MODULE_ROOT, id: actorId },
    );
}

/** As GM, click the sheet's party XP button; read the dialog's character checkboxes. */
async function openPartyXp(page: Page, actorId: string): Promise<{ opened: boolean; boxes: number; ticked: number; htmlLength: number; text: string }> {
    return page.evaluate(
        async ({ id }) => {
            interface App {
                element?: HTMLElement;
                close: () => Promise<void>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: {
                    actors: {
                        get: (i: string) => { sheet: { render: (o: object) => Promise<{ element: HTMLElement }>; close: () => Promise<void> } } | undefined;
                    };
                };
                foundry: { applications: { instances: Map<string, App> } };
            };
            const sheet = g.game.actors.get(id)?.sheet;
            if (sheet === undefined) throw new Error('no sheet');
            const rendered = await sheet.render({ force: true });
            // pollUntil resolves to whether the condition held; it never rejects.
            const shown = await globalThis.wh40kE2E.pollUntil(() => rendered.element.querySelector('[data-action="awardPartyXP"]') !== null, 10_000);
            rendered.element.querySelector<HTMLButtonElement>('[data-action="awardPartyXP"]')?.click();
            const batchDialog = (): App | undefined =>
                [...g.foundry.applications.instances.values()].find((app) => app.element?.classList.contains('batch-xp-dialog') === true);
            const opened = shown && (await globalThis.wh40kE2E.pollUntil(() => batchDialog() !== undefined, 10_000));
            await globalThis.wh40kE2E.pollUntil(() => (batchDialog()?.element?.querySelectorAll('input[name="selected"]').length ?? 0) > 0, 10_000);
            const boxes = [...(batchDialog()?.element?.querySelectorAll<HTMLInputElement>('input[name="selected"]') ?? [])];
            const html = batchDialog()?.element?.innerHTML ?? '';
            const result = {
                opened,
                boxes: boxes.length,
                ticked: boxes.filter((b) => b.checked).length,
                htmlLength: html.length,
                text: (batchDialog()?.element?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 200),
            };
            await batchDialog()?.close();
            await sheet.close();
            return result;
        },
        { id: actorId },
    );
}

/** On an NPC sheet: set the subfaction through the form, re-render, read it back; is the Custom Stats checkbox live? */
/** An NPC sheet's faction input, Custom Stats checkbox, Combat-tab Fatigue and sidebar row layout; the sheet stays open for its screenshot. */
async function npcSheetInputs(
    page: Page,
    actorId: string,
): Promise<{ subfaction: string; checkboxEnabled: boolean; combatFatiguePips: number; sheetId: string; threatStacked: boolean; threatShare: number }> {
    return page.evaluate(
        async ({ id }) => {
            interface SheetLike {
                id: string;
                element: HTMLElement;
                render: (o: object) => Promise<SheetLike>;
                close: () => Promise<void>;
                changeTab?: (tab: string, group: string) => void;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: { actors: { get: (i: string) => { sheet: SheetLike; update: (d: object) => Promise<object> } | undefined } };
            };
            const actor = g.game.actors.get(id);
            if (actor === undefined) throw new Error('no NPC');
            const sheet = await actor.sheet.render({ force: true });
            sheet.changeTab?.('npc', 'primary');
            await globalThis.wh40kE2E.pollUntil(() => sheet.element.querySelector('input[name="system.subfaction"]') !== null, 10_000);
            const input = sheet.element.querySelector<HTMLInputElement>('input[name="system.subfaction"]');
            if (input === null) throw new Error('no subfaction input');
            input.value = 'Ordo Hereticus cell';
            input.dispatchEvent(new Event('change', { bubbles: true }));
            await globalThis.wh40kE2E
                .pollUntil(() => sheet.element.querySelector<HTMLInputElement>('input[name="system.subfaction"]')?.value === 'Ordo Hereticus cell', 10_000)
                .catch(() => undefined);
            await sheet.render({ force: true });
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 500);
            });
            const subfaction = sheet.element.querySelector<HTMLInputElement>('input[name="system.subfaction"]')?.value ?? '';
            const checkbox = sheet.element.querySelector<HTMLInputElement>('input[name="system.customStats.enabled"]');
            const checkboxEnabled = checkbox !== null && !checkbox.disabled;
            sheet.changeTab?.('combat', 'primary');
            await globalThis.wh40kE2E.pollUntil(() => sheet.element.querySelector('[data-action="setFatigueBolt"]') !== null, 10_000).catch(() => undefined);
            const combatFatiguePips = sheet.element.querySelectorAll('[data-action="setFatigueBolt"]').length;
            // The sidebar's Threat row: its input sits below its label and takes most of the row.
            const threatRow = sheet.element.querySelector<HTMLElement>('[data-sidebar-field="system.threatLevel"]');
            const threatLabel = threatRow?.querySelector<HTMLElement>('[data-sidebar-field-label]')?.getBoundingClientRect();
            const threatInput = threatRow?.querySelector<HTMLElement>('input')?.getBoundingClientRect();
            const threatStacked = threatLabel !== undefined && threatInput !== undefined && threatInput.top >= threatLabel.bottom;
            const threatShare = threatInput === undefined || threatRow === null ? 0 : threatInput.width / threatRow.getBoundingClientRect().width;
            return { subfaction, checkboxEnabled, combatFatiguePips, sheetId: sheet.id, threatStacked, threatShare };
        },
        { id: actorId },
    );
}

/**
 * #798: a character carrying a Flak Vest it doesn't wear. The Combat tab's Armour
 * panel names it with an Equip button; equipping it from there clears the notice.
 * The sheet stays open on the notice for its screenshot, then is equipped.
 */
async function armourNoticeFlow(page: Page, actorId: string): Promise<{ before: string; buttons: string[]; sheetId: string }> {
    return page.evaluate(
        async ({ id }) => {
            interface SheetLike {
                id: string;
                element: HTMLElement;
                render: (o: object) => Promise<SheetLike>;
                changeTab?: (tab: string, group: string) => void;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: {
                    actors: {
                        get: (i: string) =>
                            | {
                                  sheet: SheetLike;
                                  items: { contents: Array<{ type: string; delete: () => Promise<object | undefined> }> };
                                  createEmbeddedDocuments: (t: string, d: object[]) => Promise<object[]>;
                              }
                            | undefined;
                    };
                };
            };
            const actor = g.game.actors.get(id);
            if (actor === undefined) throw new Error('no PC');
            for (const item of actor.items.contents.filter((i) => i.type === 'armour')) await item.delete();
            await actor.createEmbeddedDocuments('Item', [
                { name: 'Flak Vest', type: 'armour', system: { state: { equipped: false }, armourPoints: { body: 3 } } },
            ]);
            const sheet = await actor.sheet.render({ force: true });
            sheet.changeTab?.('combat', 'primary');
            await globalThis.wh40kE2E.pollUntil(() => sheet.element.querySelector('[data-armour-notice]') !== null, 10_000);
            const notice = sheet.element.querySelector<HTMLElement>('[data-armour-notice]');
            const buttons = [...(notice?.querySelectorAll<HTMLElement>('[data-action="toggleEquip"]') ?? [])].map((b) => b.textContent.trim());
            return { before: notice?.dataset['armourNotice'] ?? '', buttons, sheetId: sheet.id };
        },
        { id: actorId },
    );
}

/** #798: click the notice's Equip button; read whether the notice cleared and the vest is worn. */
async function equipFromNotice(page: Page, actorId: string): Promise<{ cleared: boolean; worn: boolean }> {
    return page.evaluate(
        async ({ id }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: {
                    actors: {
                        get: (i: string) =>
                            | {
                                  sheet: { element: HTMLElement; close: () => Promise<void> };
                                  items: { contents: Array<{ type: string; system: { state?: { equipped?: boolean } } }> };
                              }
                            | undefined;
                    };
                };
            };
            const actor = g.game.actors.get(id);
            if (actor === undefined) throw new Error('no PC');
            actor.sheet.element.querySelector<HTMLElement>('[data-armour-notice] [data-action="toggleEquip"]')?.click();
            const cleared = await globalThis.wh40kE2E.pollUntil(() => actor.sheet.element.querySelector('[data-armour-notice]') === null, 10_000);
            const worn = actor.items.contents.some((i) => i.type === 'armour' && i.system.state?.equipped === true);
            await actor.sheet.close();
            return { cleared, worn };
        },
        { id: actorId },
    );
}

/** With the condition catalog emptied, open Create Active Effect on an actor; count its rows, pick one, read the effect. */
async function effectPickerFallback(
    page: Page,
    actorId: string,
): Promise<{ rows: number; statuses: number; fallbackRows: number; applied: string[]; errors: string[]; apps: string[] }> {
    return page.evaluate(
        async ({ root, id }) => {
            interface DialogLike {
                element?: HTMLElement;
                close: () => Promise<void>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                CONFIG: { statusEffects: Array<{ id?: string }> };
                game: { actors: { get: (i: string) => { effects: { contents: Array<{ id: string; statuses: Set<string> }> } } | undefined } };
                foundry: { applications: { instances: Map<string, DialogLike> } };
            };
            const registry = (await import(/* @vite-ignore */ `${root}/rules/condition-registry.js`)) as {
                setConditionCatalog: (next: Map<string, object>) => void;
                statusPickerRows: (statuses: Iterable<object>, translate: (key: string) => string) => object[];
            };
            const dialogModule = (await import(/* @vite-ignore */ `${root}/applications/prompts/effect-creation-dialog.js`)) as {
                default: { show: (owner: object) => Promise<object | null> };
            };
            const actor = g.game.actors.get(id);
            if (actor === undefined) throw new Error('no actor');
            registry.setConditionCatalog(new Map());
            // The PC may already carry a status from an earlier flow (a crit's Stunned); count only what this pick adds.
            const before = new Set(actor.effects.contents.map((e) => e.id));
            const errors: string[] = [];
            // eslint-disable-next-line no-restricted-syntax -- boundary: a rejected promise's reason is untyped; narrowed by instanceof on the next line
            const shown = dialogModule.default.show(actor).catch((err: unknown) => {
                errors.push(err instanceof Error ? err.message : String(err));
                return null;
            });
            const open = (): DialogLike | undefined =>
                [...g.foundry.applications.instances.values()].find((app) => app.element?.classList.contains('wh40k-effect-creation-dialog') === true);
            await globalThis.wh40kE2E.pollUntil(() => open() !== undefined, 10_000);
            // The dialog opens on Custom; the player picks the Condition category, as Skyhawk did.
            open()?.element?.querySelector<HTMLElement>('[data-action="selectCategory"][data-category="condition"]')?.click();
            await globalThis.wh40kE2E.pollUntil(() => (open()?.element?.querySelector('[data-action="selectCondition"]') ?? null) !== null, 10_000);
            const dialog = open();
            const rows = [...(dialog?.element?.querySelectorAll<HTMLElement>('[data-action="selectCondition"]') ?? [])];
            const stunned = rows.find((row) => row.dataset['conditionId'] === 'stunned') ?? rows.at(0);
            const picked = stunned?.dataset['conditionId'] ?? '';
            stunned?.click();
            dialog?.element?.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
            await Promise.race([
                shown,
                new Promise<void>((resolve) => {
                    setTimeout(resolve, 5000);
                }),
            ]);
            const applied = actor.effects.contents.filter((e) => !before.has(e.id) && e.statuses.has(picked)).map(() => picked);
            await open()?.close();
            const fallbackRows = registry.statusPickerRows(g.CONFIG.statusEffects, (key) => key).length;
            const apps = [...g.foundry.applications.instances.values()].map((app) => app.element?.className ?? '(no element)');
            return {
                rows: rows.length,
                statuses: g.CONFIG.statusEffects.filter((s) => s.id !== undefined && s.id !== 'dead').length,
                fallbackRows,
                applied,
                errors,
                apps,
            };
        },
        { root: MODULE_ROOT, id: actorId },
    );
}

const TOKENS = [
    { key: 'pc', name: 'Bundle Medic', type: 'dh2-character', x: 300, y: 300 },
    { key: 'dh1npc', name: 'Bundle DH1 Sergeant', type: 'dh1-npc', x: 900, y: 500 },
    { key: 'crawler', name: 'Bundle Crawler', type: 'dh2-npc', x: 500, y: 300, system: { wounds: { max: 10, value: 3 } } },
];

/** Add a second, unlinked token of the crawler's actor and return its id. */
async function addCopy(page: Page, sceneId: string, actorId: string): Promise<string> {
    return page.evaluate(
        async ({ scene, actor }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: {
                    actors: { get: (i: string) => { getTokenDocument: (d: object) => Promise<{ toObject: () => object }> } | undefined };
                    scenes: { get: (i: string) => { createEmbeddedDocuments: (t: string, d: object[]) => Promise<Array<{ id: string }>> } | undefined };
                };
            };
            const base = g.game.actors.get(actor);
            if (base === undefined) throw new Error('no crawler actor');
            const data = { ...(await base.getTokenDocument({ x: 700, y: 300 })).toObject(), name: 'Bundle Crawler Copy', actorLink: false };
            const created = await g.game.scenes.get(scene)?.createEmbeddedDocuments('Token', [data]);
            return created?.at(0)?.id ?? '';
        },
        { scene: sceneId, actor: actorId },
    );
}

/** In a combat holding both copies, spend the second copy's Reaction and read both copies' Reactions left. */
async function reactionsAfterCopyDodges(
    page: Page,
    sceneId: string,
    firstId: string,
    copyId: string,
): Promise<{ first: number | null; copy: number | null; combatId: string }> {
    return page.evaluate(
        async ({ root, scene, first, copy }) => {
            interface TokenDoc {
                actor: { id: string | null; token: { id: string | null } | null } | null;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: { scenes: { get: (i: string) => { tokens: { get: (i: string) => TokenDoc | undefined } } | undefined } };
                Combat: {
                    create: (
                        d: object,
                    ) => Promise<{ id: string; createEmbeddedDocuments: (t: string, d: object[]) => Promise<object[]>; startCombat: () => Promise<object> }>;
                };
            };
            const economy = (await import(/* @vite-ignore */ `${root}/rules/action-economy.js`)) as {
                spendActionForActor: (actorId: string, kind: string, tokenId?: string | null) => object | null;
            };
            const flow = (await import(/* @vite-ignore */ `${root}/rolls/evasion-flow.js`)) as {
                evasionGateFor: (actor: object) => { reactionRemaining: number | null };
            };
            const combat = await g.Combat.create({ scene, active: true });
            await combat.createEmbeddedDocuments('Combatant', [
                { tokenId: first, sceneId: scene },
                { tokenId: copy, sceneId: scene },
            ]);
            await combat.startCombat();
            const tokens = g.game.scenes.get(scene)?.tokens;
            const firstActor = tokens?.get(first)?.actor;
            const copyActor = tokens?.get(copy)?.actor;
            const copyActorId = copyActor?.id ?? null;
            if (firstActor == null || copyActor == null || copyActorId === null) throw new Error('missing token actors');
            economy.spendActionForActor(copyActorId, 'reaction', copyActor.token?.id ?? null);
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 500);
            });
            return { first: flow.evasionGateFor(firstActor).reactionRemaining, copy: flow.evasionGateFor(copyActor).reactionRemaining, combatId: combat.id };
        },
        { root: MODULE_ROOT, scene: sceneId, first: firstId, copy: copyId },
    );
}

/** On the player's client, raise the copy's wounds through the GM proxy (the player doesn't own it). */
async function playerProxyHeal(player: Page, sceneId: string, copyId: string, wounds: number): Promise<{ owner: boolean }> {
    return player.evaluate(
        async ({ root, scene, copy, value }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: {
                    scenes: {
                        get: (i: string) => { tokens: { get: (i: string) => { actor: (object & { isOwner: boolean }) | null } | undefined } } | undefined;
                    };
                };
            };
            const proxy = (await import(/* @vite-ignore */ `${root}/rules/gm-proxy.js`)) as {
                gmProxyActorUpdate: (actor: object, data: object) => Promise<void>;
            };
            const actor = g.game.scenes.get(scene)?.tokens.get(copy)?.actor;
            if (actor == null) throw new Error('the player sees no copy actor');
            await proxy.gmProxyActorUpdate(actor, { 'system.wounds.value': value });
            return { owner: actor.isOwner };
        },
        { root: MODULE_ROOT, scene: sceneId, copy: copyId, value: wounds },
    );
}

/** The copy token's wounds and its world actor's, as the GM reads them. */
async function woundsOf(page: Page, sceneId: string, copyId: string, actorId: string): Promise<{ token: number; world: number }> {
    return page.evaluate(
        ({ scene, copy, actor }) => {
            interface Wounded {
                system: { wounds: { value: number } };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: {
                    scenes: { get: (i: string) => { tokens: { get: (i: string) => { actor: Wounded | null } | undefined } } | undefined };
                    actors: { get: (i: string) => Wounded | undefined };
                };
            };
            return {
                token: g.game.scenes.get(scene)?.tokens.get(copy)?.actor?.system.wounds.value ?? -1,
                world: g.game.actors.get(actor)?.system.wounds.value ?? -1,
            };
        },
        { scene: sceneId, copy: copyId, actor: actorId },
    );
}

test.describe.serial('Session 26 bundle (Tier B, #777 #782 #774 #766 #553)', () => {
    test.setTimeout(scaledMs(300_000));
    test('copies keep their own budgets; a player heals an unowned token through the GM', async ({ page, openClient }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);
        const passed = new Map<FlowName, string | null>();
        const pass = (flow: FlowName, ok: boolean, detail: string): void => {
            passed.set(flow, ok ? null : detail);
        };
        const cleanup: { combats: string[]; users: string[] } = { combats: [], users: [] };
        try {
            const scene: HarnessScene = await page.evaluate(async (tokens) => globalThis.wh40kAttack.setup({ width: 1000, height: 600, tokens }), TOKENS);
            const crawlerActor = scene.actors['crawler'] ?? '';
            const copyId = await addCopy(page, scene.sceneId, crawlerActor);

            // --- #777: per-token budgets ---------------------------------------------
            const reactions = await reactionsAfterCopyDodges(page, scene.sceneId, scene.tokens['crawler'] ?? '', copyId);
            cleanup.combats.push(reactions.combatId);
            pass('per-token-reaction-budget', reactions.first === 1 && reactions.copy === 0, JSON.stringify(reactions));
            // The combat sidebar isn't the open tab, so capture the board (a hidden selector waits forever).
            await snap(page, 'session-26-copies-own-reaction-budgets', { selector: '#board', closeWindows: true });

            // --- #782: a player heals an unowned unlinked token through the GM ----------
            cleanup.users.push(await createPlayer(page, PLAYER));
            await page.evaluate(async (id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game.scenes` has no browser-side types
                const g = globalThis as unknown as { game: { scenes: { get: (i: string) => { activate: () => Promise<object> } | undefined } } };
                await g.game.scenes.get(id)?.activate();
            }, scene.sceneId);
            const player = await openClient();
            expect(await joinAsUser(player, PLAYER), 'the player joins on a second client').toBe(true);
            const before = await woundsOf(page, scene.sceneId, copyId, crawlerActor);
            const heal = await playerProxyHeal(player, scene.sceneId, copyId, 9);
            await page
                .waitForFunction(
                    ({ s, c }) => {
                        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                        const g = globalThis as unknown as {
                            game: {
                                scenes: {
                                    get: (
                                        i: string,
                                    ) =>
                                        | { tokens: { get: (i: string) => { actor: { system: { wounds: { value: number } } } | null } | undefined } }
                                        | undefined;
                                };
                            };
                        };
                        return g.game.scenes.get(s)?.tokens.get(c)?.actor?.system.wounds.value === 9;
                    },
                    { s: scene.sceneId, c: copyId },
                    { timeout: scaledMs(15_000) },
                )
                .catch(() => undefined);
            const after = await woundsOf(page, scene.sceneId, copyId, crawlerActor);
            await player.close();
            pass(
                'proxy-heals-unowned-token',
                !heal.owner && after.token === 9 && after.world === before.world,
                `owner ${String(heal.owner)}; before ${JSON.stringify(before)}; after ${JSON.stringify(after)}`,
            );

            // --- #774: a sub-square token centres in its square ------------------------
            // An ordinary unlinked token: a token-only token's resize is #780's.
            const centred = await snapSubSquare(page, scene.sceneId, scene.tokens['crawler'] ?? '');
            pass(
                'sub-square-token-centred',
                // Token x/y are stored as integers, so the stored centre may round by half a pixel.
                centred.width === 0.75 &&
                    centred.snapped.x === 312.5 &&
                    centred.snapped.y === 512.5 &&
                    Math.abs(centred.moved.x - 312.5) <= 1 &&
                    Math.abs(centred.moved.y - 512.5) <= 1,
                JSON.stringify(centred),
            );
            await snap(page, 'session-26-sub-square-token-centred', { selector: '#board', closeWindows: true });

            // --- #766: a crit's stated duration on its condition ------------------------
            const timed = await applyTimedCrit(page, scene.actors['pc'] ?? '');
            pass('crit-condition-duration', timed.rounds === 2 && timed.label.includes('2 rounds'), JSON.stringify(timed));

            // --- #553: the party XP award from a character sheet ---------------------
            const party = await openPartyXp(page, scene.actors['pc'] ?? '');
            pass('party-xp-from-sheet', party.opened && party.boxes > 0 && party.ticked === party.boxes, JSON.stringify(party));

            // --- NPC sheet: faction holds, custom stats editable ----------------------
            const npc = await npcSheetInputs(page, scene.actors['dh1npc'] ?? '');
            pass('npc-faction-holds', npc.subfaction === 'Ordo Hereticus cell', JSON.stringify(npc));
            pass('npc-custom-stats-editable', npc.checkboxEnabled, JSON.stringify(npc));
            pass('npc-combat-tab-fatigue', npc.combatFatiguePips > 0, JSON.stringify(npc));
            pass('npc-sidebar-rows-stacked', npc.threatStacked && npc.threatShare > 0.5, JSON.stringify(npc));
            await snap(page, 'session-26-npc-sidebar-rows-stacked', { selector: `#${npc.sheetId}`, closeWindows: true, keepWindow: npc.sheetId });

            // --- Effect picker with no condition catalog (public install) -------------
            const picker = await effectPickerFallback(page, scene.actors['pc'] ?? '');
            pass(
                'effect-picker-falls-back-to-statuses',
                picker.rows > 0 && picker.rows === picker.statuses && picker.applied.length === 1,
                JSON.stringify(picker),
            );

            // --- #798: the Armour panel's notice, and equipping from it ---------------
            const notice = await armourNoticeFlow(page, scene.actors['pc'] ?? '');
            await snap(page, 'session-26-armour-notice-unequipped', { selector: `#${notice.sheetId}`, closeWindows: true, keepWindow: notice.sheetId });
            const equipped = await equipFromNotice(page, scene.actors['pc'] ?? '');
            pass(
                'armour-notice-equips',
                notice.before === 'unequipped' && notice.buttons.join() === 'Flak Vest' && equipped.cleared && equipped.worn,
                JSON.stringify({ notice, equipped }),
            );
        } finally {
            await deleteDocuments(page, { combats: cleanup.combats, users: cleanup.users });
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
        }

        const failures: string[] = [];
        for (const flow of SESSION_26_FLOWS) {
            const detail = passed.get(flow);
            if (detail === null) recordCoverage('session-26.flow', flow);
            else failures.push(`flow ${flow}: ${detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
