import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { type HarnessScene, installAttackHarness, leanWeapon } from './lib/attack-harness';
import { popOutChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid, documentFile } from './lib/pack-lookup';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B: range on a scene measured in feet, the target-size modifier on retarget,
 * a Fate re-roll's ammunition and the attack card's tooltips (#233, #761, #762).
 *
 * The scene's grid is switched to 5 ft squares, as the Kingsbarrow maps are. A DH2
 * character with a laspistol (30 m) stands at (500, 500):
 * - a Puny (Size 2) creature diagonally next to it and a human directly below are
 *   engaged: melee distance, no Point Blank bonus (#233);
 * - a human six squares east is 30 ft, about 9 m, so Short Range (#233);
 * - opening on the Puny creature then targeting the human drops the −20 size
 *   modifier to the human's 0 (#761);
 * - in combat, a canvas target that isn't a combatant survives a later change to
 *   the dialog's form, and the roster marks no row for it (#764);
 * - a Fate re-roll of a shot leaves the clip one round down, not two;
 * - every button on the attack card has a tooltip (#762);
 * - the Corpse-Crawler's Acid Spray (no clip, a dash for Reload) fires instead of
 *   being refused as out of ammunition (#765).
 *
 * Each flow records under `range-retarget.flow`. Keys MUST match RANGE_RETARGET_FLOWS
 * in scripts/e2e-coverage.mjs.
 */
const RANGE_RETARGET_FLOWS = [
    'feet-diagonal-neighbour-engaged',
    'feet-orthogonal-neighbour-engaged',
    'feet-distance-in-metres',
    'retarget-recomputes-size',
    'canvas-target-survives-form-change',
    'fate-reroll-spends-ammo-once',
    'card-buttons-have-tooltips',
    'clipless-natural-weapon-fires',
] as const;
type FlowName = (typeof RANGE_RETARGET_FLOWS)[number];

const LASPISTOL = compendiumUuid({ line: 'dh2', category: 'weapons' }, 'f1G2h3I4j5K6l7M8');

/** The Corpse-Crawler's own Acid Spray, as its bestiary entry embeds it (no clip, Reload "—"). */
function crawlerAcidSpray(): object {
    const file = documentFile({ line: 'dh2', category: 'actors' }, 'CFPEyLfUMDBUVCd2');
    // eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse returns unknown (ts-reset); only the embedded items are read
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { items?: Array<{ name?: string; _id?: string }> };
    const spray = doc.items?.find((item) => item.name === 'Acid Spray');
    if (spray === undefined) throw new Error('the Corpse-Crawler has no Acid Spray');
    const { _id: _unused, ...rest } = spray;
    return rest;
}

const TOKENS = [
    {
        key: 'shooter',
        name: 'Range Shooter',
        type: 'dh2-character',
        x: 500,
        y: 500,
        items: [leanWeapon('Laspistol', LASPISTOL, 30)],
        system: { characteristics: { ballisticSkill: { base: 50 } }, fate: { value: 3, max: 3 } },
    },
    { key: 'puny', name: 'Puny Crawler', type: 'dh2-npc', x: 400, y: 600, system: { size: 2 } },
    { key: 'below', name: 'Adjacent Human', type: 'dh2-npc', x: 500, y: 600, system: { size: 4 } },
    { key: 'far', name: 'Distant Human', type: 'dh2-npc', x: 1100, y: 500, system: { size: 4 } },
    { key: 'sprayer', name: 'Spraying Crawler', type: 'dh2-npc', x: 1100, y: 800, items: [crawlerAcidSpray()], system: { size: 2 } },
];

/** In combat (shooter and the Puny creature), target the distant human on the canvas, submit the form, and read the target and the roster. */
async function targetSurvivesSubmit(page: Page, scene: HarnessScene): Promise<{ before: string; after: string; selectedRows: number }> {
    return page.evaluate(
        async ({ sceneId, shooterId, punyId, farId }) => {
            interface TokenLike {
                actor: { name: string; items: { contents: Array<{ name: string }> } } | null;
                setTarget: (on: boolean, opts: object) => void;
            }
            interface Dialog {
                rendered: boolean;
                element: HTMLElement;
                submit: () => Promise<void>;
                actionData?: { rollData?: { targetActor: { name: string } | null } };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                canvas: { tokens: { get: (i: string) => TokenLike | undefined } };
                foundry: { applications: { instances: Map<string, object> } };
                Combat: {
                    create: (
                        d: object,
                    ) => Promise<{ createEmbeddedDocuments: (t: string, d: object[]) => Promise<object[]>; startCombat: () => Promise<object> }>;
                };
            };
            const combat = await g.Combat.create({ scene: sceneId, active: true });
            await combat.createEmbeddedDocuments('Combatant', [
                { tokenId: shooterId, sceneId },
                { tokenId: punyId, sceneId },
            ]);
            await combat.startCombat();
            const moduleRoot = '/systems/wh40k-rpg/module';
            const targeted = (await import(/* @vite-ignore */ `${moduleRoot}/actions/targeted-action-manager.js`)) as {
                DHTargetedActionManager: { performWeaponAttack: (s: TokenLike, t: TokenLike | null, w: object) => void };
            };
            const dialogModule = (await import(/* @vite-ignore */ `${moduleRoot}/applications/prompts/unified-roll-dialog.js`)) as {
                default: abstract new (...a: never[]) => object;
            };
            const findDialog = (): Dialog | null => {
                for (const app of g.foundry.applications.instances.values()) if (app instanceof dialogModule.default) return app as Dialog;
                return null;
            };
            const shooter = g.canvas.tokens.get(shooterId);
            const far = g.canvas.tokens.get(farId);
            const weapon = shooter?.actor?.items.contents.find((i) => i.name === 'Laspistol');
            if (shooter === undefined || far === undefined || weapon === undefined) throw new Error('missing shooter, target or laspistol');
            g.canvas.tokens.get(punyId)?.setTarget(true, { releaseOthers: true });
            targeted.DHTargetedActionManager.performWeaponAttack(shooter, null, weapon);
            await globalThis.wh40kE2E.pollUntil(() => findDialog()?.rendered === true, 15_000);
            const dialog = findDialog();
            if (dialog === null) throw new Error('no attack dialog');
            far.setTarget(true, { releaseOthers: true });
            await globalThis.wh40kE2E.pollUntil(() => dialog.actionData?.rollData?.targetActor?.name === 'Distant Human', 10_000).catch(() => undefined);
            const before = dialog.actionData?.rollData?.targetActor?.name ?? '';
            // What any other control in the form does: submit it.
            await dialog.submit();
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 500);
            });
            const after = dialog.actionData?.rollData?.targetActor?.name ?? '';
            const selectedRows = dialog.element.querySelectorAll('select[name="targetCombatantId"] option[selected]').length;
            return { before, after, selectedRows };
        },
        { sceneId: scene.sceneId, shooterId: scene.tokens['shooter'] ?? '', punyId: scene.tokens['puny'] ?? '', farId: scene.tokens['far'] ?? '' },
    );
}

async function endCombats(page: Page): Promise<void> {
    await page.evaluate(async () => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { combats: { contents: Array<{ delete: () => Promise<object> }> } } };
        for (const combat of [...g.game.combats.contents]) await combat.delete();
    });
}

/** What the open attack dialog read for its target. */
interface DialogRead {
    distance: number;
    bracket: string;
    sizeModifier: number | null;
    targetName: string;
}

/** Switch the harness scene to 5 ft squares. */
async function useFeetGrid(page: Page, sceneId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { scenes: { get: (i: string) => { update: (d: object) => Promise<object> } | undefined } } };
        await g.game.scenes.get(id)?.update({ grid: { distance: 5, units: 'ft' } });
    }, sceneId);
}

/**
 * Target `targetId`, open the laspistol attack at it and read the dialog. With
 * `retargetId`, then target that token while the dialog stays open and read again.
 */
async function openAndRead(
    page: Page,
    scene: HarnessScene,
    targetId: string,
    retargetId: string | null,
): Promise<{ first: DialogRead; second: DialogRead | null }> {
    return page.evaluate(
        async ({ shooterId, target, retarget }) => {
            interface TokenLike {
                id: string;
                actor: { name: string; items: { contents: Array<{ name: string }> } } | null;
                setTarget: (on: boolean, opts: object) => void;
            }
            interface Dialog {
                rendered: boolean;
                close: () => Promise<void>;
                actionData?: {
                    rollData?: { distance: number; rangeBracket?: string; modifiers: Record<string, number>; targetActor: { name: string } | null };
                };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                canvas: { tokens: { get: (i: string) => TokenLike | undefined } };
                foundry: { applications: { instances: Map<string, object> } };
            };
            const moduleRoot = '/systems/wh40k-rpg/module';
            const targeted = (await import(/* @vite-ignore */ `${moduleRoot}/actions/targeted-action-manager.js`)) as {
                DHTargetedActionManager: { performWeaponAttack: (s: TokenLike, t: TokenLike | null, w: object) => void };
            };
            const dialogModule = (await import(/* @vite-ignore */ `${moduleRoot}/applications/prompts/unified-roll-dialog.js`)) as {
                default: abstract new (...a: never[]) => object;
            };
            const shooter = g.canvas.tokens.get(shooterId);
            const first = g.canvas.tokens.get(target);
            const weapon = shooter?.actor?.items.contents.find((i) => i.name === 'Laspistol');
            if (shooter === undefined || first === undefined || weapon === undefined) throw new Error('missing shooter, target or laspistol');
            const findDialog = (): Dialog | null => {
                for (const app of g.foundry.applications.instances.values()) if (app instanceof dialogModule.default) return app as Dialog;
                return null;
            };
            const read = (open: Dialog): DialogRead => {
                const rd = open.actionData?.rollData;
                if (rd === undefined) throw new Error('dialog has no roll data');
                return {
                    distance: rd.distance,
                    bracket: rd.rangeBracket ?? '',
                    sizeModifier: rd.modifiers['target-size'] ?? null,
                    targetName: rd.targetActor?.name ?? '',
                };
            };
            first.setTarget(true, { releaseOthers: true });
            targeted.DHTargetedActionManager.performWeaponAttack(shooter, first, weapon);
            await globalThis.wh40kE2E.pollUntil(() => findDialog()?.rendered === true, 15_000);
            const dialog = findDialog();
            if (dialog === null) throw new Error('no attack dialog');
            const before = read(dialog);
            let after: DialogRead | null = null;
            if (retarget !== null) {
                const next = g.canvas.tokens.get(retarget);
                const nextName = next?.actor?.name ?? '';
                next?.setTarget(true, { releaseOthers: true });
                await globalThis.wh40kE2E.pollUntil(() => dialog.actionData?.rollData?.targetActor?.name === nextName, 10_000).catch(() => undefined);
                after = read(dialog);
            }
            return { first: before, second: after };
        },
        { shooterId: scene.tokens['shooter'] ?? '', target: targetId, retarget: retargetId },
    );
}

async function closeDialogs(page: Page): Promise<void> {
    await page.evaluate(async () => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { foundry: { applications: { instances: Map<string, { element?: HTMLElement; close: () => Promise<void> }> } } };
        for (const app of [...g.foundry.applications.instances.values()]) {
            if (app.element?.classList.contains('unified-roll-dialog') === true) await app.close();
        }
    });
}

/** The laspistol's loaded rounds. */
async function clipOf(page: Page, actorId: string): Promise<number> {
    return page.evaluate((id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            game: { actors: { get: (i: string) => { items: { contents: Array<{ name: string; system: { clip: { value: number } } }> } } | undefined } };
        };
        return g.game.actors.get(id)?.items.contents.find((i) => i.name === 'Laspistol')?.system.clip.value ?? -1;
    }, actorId);
}

/** Press the card's Fate re-roll, confirm it, and wait for the re-rolled card. */
async function fateReroll(page: Page, messageId: string): Promise<boolean> {
    return page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { messages: { contents: Array<{ id: string }> } } };
        const before = g.game.messages.contents.length;
        const button = document.querySelector<HTMLButtonElement>(
            `#sidebar .chat-log .message[data-message-id="${id}"] .roll-control__variant-reroll[data-variant-kind="fate"]`,
        );
        if (button === null) return false;
        button.click();
        await globalThis.wh40kE2E.pollUntil(() => document.querySelector('[data-action="confirm"]') !== null, 8000);
        document.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.click();
        // pollUntil resolves to whether the condition held; it never rejects.
        return globalThis.wh40kE2E.pollUntil(() => g.game.messages.contents.length >= before + 2, 15_000);
    }, messageId);
}

/** The attack card's buttons that have no tooltip, by their text. */
async function untippedButtons(page: Page, messageId: string): Promise<string[]> {
    return page.evaluate((id: string) => {
        const buttons = document.querySelectorAll<HTMLButtonElement>(`#sidebar .chat-log .message[data-message-id="${id}"] button`);
        return [...buttons].filter((b) => (b.dataset['tooltip'] ?? '').trim() === '').map((b) => b.textContent.trim());
    }, messageId);
}

test.describe.serial('range on a feet grid, retargeting and Fate re-rolls (Tier B, #233 #761 #762)', () => {
    test.setTimeout(scaledMs(300_000));
    test('neighbours are engaged, feet read as metres, retargeting resets the size, a Fate re-roll spends one round', async ({ page }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);
        const passed = new Map<FlowName, string | null>();
        const pass = (flow: FlowName, ok: boolean, detail: string): void => {
            passed.set(flow, ok ? null : detail);
        };
        try {
            const scene: HarnessScene = await page.evaluate(async (tokens) => globalThis.wh40kAttack.setup({ width: 1500, height: 1000, tokens }), TOKENS);
            await useFeetGrid(page, scene.sceneId);
            const id = (key: string): string => scene.tokens[key] ?? '';

            // --- #233: neighbours engaged, feet converted -----------------------------
            const diagonal = await openAndRead(page, scene, id('puny'), null);
            pass('feet-diagonal-neighbour-engaged', diagonal.first.distance === 1 && diagonal.first.bracket === 'melee', JSON.stringify(diagonal.first));
            await snap(page, 'range-feet-diagonal-neighbour-dialog', { selector: 'form.unified-roll-dialog' });
            await closeDialogs(page);

            const below = await openAndRead(page, scene, id('below'), null);
            pass('feet-orthogonal-neighbour-engaged', below.first.distance === 1 && below.first.bracket === 'melee', JSON.stringify(below.first));
            await closeDialogs(page);

            const far = await openAndRead(page, scene, id('far'), null);
            pass('feet-distance-in-metres', far.first.distance === 9 && far.first.bracket === 'short', JSON.stringify(far.first));
            await snap(page, 'range-feet-thirty-feet-short-dialog', { selector: 'form.unified-roll-dialog' });
            await closeDialogs(page);

            // --- #761: retarget resets the size modifier ------------------------------
            const retarget = await openAndRead(page, scene, id('puny'), id('far'));
            pass(
                'retarget-recomputes-size',
                retarget.first.sizeModifier === -20 && retarget.second?.targetName === 'Distant Human' && retarget.second.sizeModifier === 0,
                `${JSON.stringify(retarget.first)} -> ${JSON.stringify(retarget.second)}`,
            );
            await snap(page, 'range-retarget-size-reset-dialog', { selector: 'form.unified-roll-dialog' });
            await closeDialogs(page);

            // --- #764: a canvas target survives a form change in combat ---------------
            const held = await targetSurvivesSubmit(page, scene);
            pass(
                'canvas-target-survives-form-change',
                held.before === 'Distant Human' && held.after === 'Distant Human' && held.selectedRows === 0,
                JSON.stringify(held),
            );
            await snap(page, 'range-canvas-target-after-form-change-dialog', { selector: 'form.unified-roll-dialog' });
            await closeDialogs(page);
            await endCombats(page);

            // --- A Fate re-roll spends the shot once; #762 tooltips -------------------
            const shooterActor = scene.actors['shooter'] ?? '';
            const before = await clipOf(page, shooterActor);
            const shot = await page.evaluate(
                async ({ firer, target }) => globalThis.wh40kAttack.attack({ firer, target, weaponName: 'Laspistol', faces: [[5, 100]] }),
                { firer: id('shooter'), target: id('far') },
            );
            const card = shot.messageIds.at(0) ?? '';
            const afterShot = await clipOf(page, shooterActor);
            const untipped = card === '' ? ['no card'] : await untippedButtons(page, card);
            pass('card-buttons-have-tooltips', untipped.length === 0, `untipped: ${untipped.join(' | ')}`);
            if (card !== '') await snap(page, 'range-attack-card-buttons', { selector: await popOutChatMessage(page, card) });
            const rerolled = card === '' ? false : await fateReroll(page, card);
            const afterReroll = await clipOf(page, shooterActor);

            // --- #765: a clipless natural weapon fires --------------------------------
            const spray = await page.evaluate(
                async ({ firer, target }) => globalThis.wh40kAttack.attack({ firer, target, weaponName: 'Acid Spray', faces: [[5, 100]] }),
                { firer: id('sprayer'), target: id('far') },
            );
            const refused = spray.notices.some((n) => /ammo|ammunition/i.test(n));
            pass(
                'clipless-natural-weapon-fires',
                spray.messageIds.length > 0 && !refused,
                `messages ${spray.messageIds.length}; notices ${spray.notices.join(' | ')}`,
            );
            const sprayCard = spray.messageIds.at(0);
            if (sprayCard !== undefined) await snap(page, 'range-acid-spray-attack-card', { selector: await popOutChatMessage(page, sprayCard) });
            pass(
                'fate-reroll-spends-ammo-once',
                rerolled && afterShot === before - 1 && afterReroll === afterShot,
                `rerolled ${String(rerolled)}; clip ${before} -> ${afterShot} -> ${afterReroll}; notices ${shot.notices.join(' | ')}`,
            );
        } finally {
            await closeDialogs(page);
            await endCombats(page);
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
        }

        const failures: string[] = [];
        for (const flow of RANGE_RETARGET_FLOWS) {
            const detail = passed.get(flow);
            if (detail === null) recordCoverage('range-retarget.flow', flow);
            else failures.push(`flow ${flow}: ${detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
