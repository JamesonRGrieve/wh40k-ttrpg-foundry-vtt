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
 *   Overrides are editable (playtest report, 2026-11-24).
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
] as const;
type FlowName = (typeof SESSION_26_FLOWS)[number];

const PLAYER = 'E2E Bundle Player';
const MODULE_ROOT = '/systems/wh40k-rpg/module';

/** The DH2 Corpse-Crawler, placed token-only. */
const CRAWLER_UUID = 'Compendium.wh40k-rpg.dh2-core-actors-bestiary.Actor.CFPEyLfUMDBUVCd2';

/** Place a token-only token of a compendium actor (as the canvas drop does, #586). */
async function placeTokenOnly(page: Page, sceneId: string, uuid: string): Promise<string> {
    return page.evaluate(
        async ({ root, scene, actorUuid }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                fromUuid: (u: string) => Promise<{ id: string; prototypeToken: { toObject: () => object } } | null>;
                game: {
                    scenes: {
                        get: (i: string) =>
                            | {
                                  createEmbeddedDocuments: (t: string, d: object[]) => Promise<Array<{ id: string }>>;
                                  tokens: { get: (i: string) => object | undefined };
                              }
                            | undefined;
                    };
                };
            };
            const tokenOnly = (await import(/* @vite-ignore */ `${root}/rules/compendium-token-actors.js`)) as {
                ensureCompendiumTokenActor: (token: object) => Promise<void>;
            };
            const actor = await g.fromUuid(actorUuid);
            if (actor === null) throw new Error(`no compendium actor ${actorUuid}`);
            const data = {
                ...actor.prototypeToken.toObject(),
                name: 'Token-only Crawler',
                actorId: actor.id,
                actorLink: false,
                x: 300,
                y: 500,
                flags: { 'wh40k-rpg': { compendiumActor: actorUuid } },
            };
            const created = await g.game.scenes.get(scene)?.createEmbeddedDocuments('Token', [data]);
            const id = created?.at(0)?.id ?? '';
            const token = g.game.scenes.get(scene)?.tokens.get(id);
            if (token !== undefined) await tokenOnly.ensureCompendiumTokenActor(token);
            return id;
        },
        { root: MODULE_ROOT, scene: sceneId, actorUuid: uuid },
    );
}

/** Snap a sub-square token through the document and move it one square right by keyboard; read where it lands. */
async function snapSubSquare(
    page: Page,
    sceneId: string,
    tokenId: string,
): Promise<{ width: number; snapped: { x: number; y: number }; moved: { x: number; y: number } }> {
    return page.evaluate(
        async ({ scene, id }) => {
            interface TokenDocLike {
                x: number;
                y: number;
                width: number;
                update: (d: object) => Promise<object | undefined>;
                getSnappedPosition: (d: object) => { x: number; y: number };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: { scenes: { get: (i: string) => { tokens: { get: (i: string) => TokenDocLike | undefined } } | undefined } };
                canvas: { tokens: { moveMany: (o: object) => Promise<object[]> } };
            };
            const doc = g.game.scenes.get(scene)?.tokens.get(id);
            if (doc === undefined) throw new Error('no token');
            await doc.update({ width: 0.75, height: 0.75 });
            const snapped = doc.getSnappedPosition({ x: 300, y: 500 });
            await doc.update({ x: snapped.x, y: snapped.y });
            await g.canvas.tokens.moveMany({ dx: 1, dy: 0, ids: [id] });
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 1500);
            });
            return { width: doc.width, snapped, moved: { x: doc.x, y: doc.y } };
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
async function openPartyXp(page: Page, actorId: string): Promise<{ opened: boolean; boxes: number; ticked: number }> {
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
            await globalThis.wh40kE2E.pollUntil(() => rendered.element.querySelector('[data-action="awardPartyXP"]') !== null, 10_000);
            rendered.element.querySelector<HTMLButtonElement>('[data-action="awardPartyXP"]')?.click();
            const batchDialog = (): App | undefined =>
                [...g.foundry.applications.instances.values()].find((app) => app.element?.classList.contains('batch-xp-dialog') === true);
            const opened = await globalThis.wh40kE2E
                .pollUntil(() => batchDialog() !== undefined, 10_000)
                .then(() => true)
                .catch(() => false);
            const boxes = [...(batchDialog()?.element?.querySelectorAll<HTMLInputElement>('input[name="selected"]') ?? [])];
            const result = { opened, boxes: boxes.length, ticked: boxes.filter((b) => b.checked).length };
            await batchDialog()?.close();
            await sheet.close();
            return result;
        },
        { id: actorId },
    );
}

/** On an NPC sheet: set the subfaction through the form, re-render, read it back; is the Custom Stats checkbox live? */
async function npcSheetInputs(page: Page, actorId: string): Promise<{ subfaction: string; checkboxEnabled: boolean }> {
    return page.evaluate(
        async ({ id }) => {
            interface SheetLike {
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
            await sheet.close();
            return { subfaction, checkboxEnabled };
        },
        { id: actorId },
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
            await snap(page, 'session-26-copies-own-reaction-budgets', { selector: '#combat', closeWindows: true });

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
            const tokenOnlyId = await placeTokenOnly(page, scene.sceneId, CRAWLER_UUID);
            const centred = await snapSubSquare(page, scene.sceneId, tokenOnlyId);
            pass(
                'sub-square-token-centred',
                centred.snapped.x === 312.5 && centred.snapped.y === 512.5 && centred.moved.x === 412.5 && centred.moved.y === 512.5,
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
