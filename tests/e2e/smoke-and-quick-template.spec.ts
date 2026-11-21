import type { Page } from '@playwright/test';
import { type HarnessScene, installAttackHarness, leanWeapon } from './lib/attack-harness';
import { canvasClip } from './lib/canvas-capture';
import { popOutChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of #758 on a live canvas: smokescreens and the Quick Template tool,
 * both placed as V14 Regions.
 *
 * - A DH2 Blind Grenade (Smoke (2)) that hits throws up a 2 m radius cloud (4 m across)
 *   on the target. The cloud blocks sight, is flagged a smokescreen, and the card says so.
 * - With the GM's "Smoke clouds blind tokens inside" option on, the tokens inside get
 *   Blinded, and lose it when they walk out.
 * - The Quick Template tool: the GM opens it from the scene controls, sets a 4 m circle
 *   that blocks sight and blinds, and clicks the map. The Region lands where clicked and
 *   blinds the token under it.
 *
 * Grid: 100 px = 1 m. The thrower stands at (250, 550); the target 5 m east at (750, 550).
 *
 * Each flow records under `area-region.flow`. Keys MUST match AREA_REGION_FLOWS in
 * scripts/e2e-coverage.mjs.
 */
const AREA_REGION_FLOWS = [
    'smoke-places-cloud',
    'smoke-blocks-sight',
    'smoke-card-states-cloud',
    'smoke-blinds-inside-when-set',
    'smoke-blind-lifts-on-leaving',
    'quick-template-places-region',
    'quick-template-blinds-inside',
] as const;
type FlowName = (typeof AREA_REGION_FLOWS)[number];

const BLIND_GRENADE = compendiumUuid({ line: 'dh2', category: 'weapons' }, 'pxax2x1ugbv51000');
const SMOKE_SETTING = 'smoke-blinds-inside';

const THROWER_CENTRE = { x: 250, y: 550 };
const TARGET_CENTRE = { x: 750, y: 550 };

const TOKENS = [
    {
        key: 'thrower',
        name: 'Thrower',
        type: 'dh2-character',
        x: 200,
        y: 500,
        items: [leanWeapon('Blind Grenade', BLIND_GRENADE, 2)],
        system: { characteristics: { ballisticSkill: { base: 50 }, strength: { base: 40 } } },
    },
    { key: 'target', name: 'Mark', type: 'dh2-npc', x: 700, y: 500, system: { characteristics: { agility: { base: 30 } } } },
];

/** A Region on the scene, as the tests read it back. */
interface RegionView {
    id: string;
    name: string;
    shape: string | null;
    x: number;
    y: number;
    /** Radius in metres. */
    radius: number;
    blocksSight: boolean;
    source: string | null;
    behaviours: string[];
}

async function regions(page: Page, sceneId: string): Promise<RegionView[]> {
    return page.evaluate((id: string): RegionView[] => {
        interface RegionDoc {
            id: string;
            name: string;
            shapes: Array<{ type: string; x: number; y: number; radius?: number }>;
            restriction: { enabled: boolean; type: string };
            behaviors: { contents: Array<{ type: string }> };
            getFlag: (scope: string, key: string) => { source?: string } | undefined;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            game: { scenes: { get: (i: string) => { dimensions: { distancePixels: number }; regions: { contents: RegionDoc[] } } | undefined } };
        };
        const scene = g.game.scenes.get(id);
        const ppu = scene?.dimensions.distancePixels ?? 1;
        return (scene?.regions.contents ?? []).map((r) => {
            const shape = r.shapes.at(0);
            return {
                id: r.id,
                name: r.name,
                shape: shape?.type ?? null,
                x: shape?.x ?? 0,
                y: shape?.y ?? 0,
                radius: (shape?.radius ?? 0) / ppu,
                blocksSight: r.restriction.enabled && r.restriction.type === 'sight',
                source: r.getFlag('wh40k-rpg', 'area')?.source ?? null,
                behaviours: r.behaviors.contents.map((b) => b.type),
            };
        });
    }, sceneId);
}

async function clearRegions(page: Page, sceneId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            game: {
                scenes: {
                    get: (
                        i: string,
                    ) =>
                        | { regions: { contents: Array<{ id: string }> }; deleteEmbeddedDocuments: (type: string, ids: string[]) => Promise<object[]> }
                        | undefined;
                };
            };
        };
        const scene = g.game.scenes.get(id);
        if (scene !== undefined)
            await scene.deleteEmbeddedDocuments(
                'Region',
                scene.regions.contents.map((r) => r.id),
            );
    }, sceneId);
}

/** Wait until the actor's Blinded status is `want`; returns what it ended at. */
async function blindedBecomes(page: Page, sceneId: string, tokenId: string, want: boolean): Promise<boolean> {
    return page.evaluate(
        async ({ scene, token, wanted }) => {
            // An unlinked NPC token carries its own synthetic actor: the area's condition lands there, not on the world actor.
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: {
                    scenes: { get: (i: string) => { tokens: { get: (t: string) => { actor: { statuses: Set<string> } | null } | undefined } } | undefined };
                };
            };
            const blinded = (): boolean => g.game.scenes.get(scene)?.tokens.get(token)?.actor?.statuses.has('blinded') === true;
            try {
                await globalThis.wh40kE2E.pollUntil(() => blinded() === wanted);
            } catch {
                // Fall through: the caller reports what the status ended at.
            }
            return blinded();
        },
        { scene: sceneId, token: tokenId, wanted: want },
    );
}

/** Move a token so its centre sits at `centre`. */
async function moveToken(page: Page, sceneId: string, tokenId: string, centre: { x: number; y: number }): Promise<void> {
    await page.evaluate(
        async ({ scene, token, x, y }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: {
                    scenes: { get: (i: string) => { tokens: { get: (t: string) => { update: (d: object) => Promise<object> } | undefined } } | undefined };
                };
            };
            await g.game.scenes
                .get(scene)
                ?.tokens.get(token)
                ?.update({ x: x - 50, y: y - 50 });
        },
        { scene: sceneId, token: tokenId, x: centre.x, y: centre.y },
    );
}

/** The live state behind a blinding area, for a failure message: the token's regions and level, the area's, the behaviour's class and the actor's effects. */
async function blindingState(page: Page, sceneId: string, tokenId: string): Promise<string> {
    return page.evaluate(
        ({ scene, token }) => {
            interface DiagRegion {
                id: string;
                levels: Set<string>;
                tokens: Set<object>;
                behaviors: { contents: Array<{ type: string; system: object; active?: boolean; disabled?: boolean }> };
            }
            interface DiagScene {
                regions: { contents: DiagRegion[] };
                tokens: {
                    get: (t: string) =>
                        | {
                              level?: string | null;
                              _source: { _regions?: string[] };
                              actor: { effects: { contents: Array<{ name: string; origin: string | null; statuses: Set<string> }> } } | null;
                          }
                        | undefined;
                };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: {
                    scenes: { get: (i: string) => DiagScene | undefined };
                };
                foundry: { data: { regionBehaviors: { RegionBehaviorType: abstract new () => object } } };
            };
            const stage = g.game.scenes.get(scene);
            const tok = stage?.tokens.get(token);
            return JSON.stringify({
                tokenLevel: tok?.level ?? null,
                tokenRegions: tok?._source._regions ?? null,
                regions: (stage?.regions.contents ?? []).map((r) => ({
                    id: r.id,
                    levels: [...r.levels],
                    tokens: r.tokens.size,
                    behaviours: r.behaviors.contents.map((b) => ({
                        type: b.type,
                        system: b.system.constructor.name,
                        typed: b.system instanceof g.foundry.data.regionBehaviors.RegionBehaviorType,
                        disabled: b.disabled ?? null,
                    })),
                })),
                effects: (tok?.actor?.effects.contents ?? []).map((e) => ({ name: e.name, origin: e.origin, statuses: [...e.statuses] })),
            });
        },
        { scene: sceneId, token: tokenId },
    );
}

/** Text of a posted chat card. */
async function cardText(page: Page, messageId: string): Promise<string> {
    return page.evaluate(async (id: string) => {
        const sel = `#sidebar .chat-log .message[data-message-id="${id}"]`;
        await globalThis.wh40kE2E.pollUntil(() => document.querySelector(sel) !== null);
        return (document.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ');
    }, messageId);
}

async function setSmokeBlinds(page: Page, value: boolean): Promise<void> {
    await page.evaluate(
        async ({ key, on }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game.settings` has no browser-side types
            const g = globalThis as unknown as { game: { settings: { set: (s: string, k: string, v: boolean) => Promise<boolean> } } };
            await g.game.settings.set('wh40k-rpg', key, on);
        },
        { key: SMOKE_SETTING, on: value },
    );
}

async function snapCanvas(page: Page, label: string, points: ReadonlyArray<{ x: number; y: number }>, pad: number): Promise<void> {
    await page.waitForTimeout(scaledMs(600));
    const clip = await canvasClip(page, points, pad);
    await snap(page, label, clip === null ? { selector: '#board', closeWindows: true } : { clip, closeWindows: true });
}

/** Click the canvas at a point in scene pixels, through the real pointer. */
async function clickCanvas(page: Page, point: { x: number; y: number }): Promise<void> {
    const client = await page.evaluate((p) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `canvas` is injected by the licensed app; no shipped types
        const g = globalThis as unknown as { canvas: { clientCoordinatesFromCanvas: (q: { x: number; y: number }) => { x: number; y: number } } };
        return g.canvas.clientCoordinatesFromCanvas(p);
    }, point);
    await page.mouse.move(client.x, client.y);
    await page.mouse.down();
    await page.mouse.up();
}

test.describe.serial('smokescreens and quick templates as Regions (Tier B, #758)', () => {
    test.setTimeout(scaledMs(300_000));
    test('a Blind Grenade blocks sight and, when the GM says so, blinds; the Quick Template places a blinding cloud', async ({ page }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);
        const pageErrors: string[] = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('console', (message) => {
            if (message.type() === 'error') pageErrors.push(message.text());
        });

        const passed = new Map<FlowName, string | null>();
        const pass = (flow: FlowName, ok: boolean, detail: string): void => {
            passed.set(flow, ok ? null : detail);
        };
        try {
            const scene: HarnessScene = await page.evaluate(async (tokens) => globalThis.wh40kAttack.setup({ width: 1400, height: 1100, tokens }), TOKENS);
            const thrower = scene.tokens['thrower'] ?? '';
            const target = scene.tokens['target'] ?? '';
            await setSmokeBlinds(page, false);

            // --- RAW: the cloud blocks sight and nothing more -------------------
            const raw = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
                firer: thrower,
                target,
                weaponName: 'Blind Grenade',
                faces: [[10, 100]] as Array<[number, number]>,
            });
            const placed = await regions(page, scene.sceneId);
            const cloud = placed.find((r) => r.source === 'smoke');
            pass(
                'smoke-places-cloud',
                placed.length === 1 &&
                    cloud?.shape === 'circle' &&
                    cloud.radius === 2 &&
                    Math.abs(cloud.x - TARGET_CENTRE.x) < 1 &&
                    Math.abs(cloud.y - TARGET_CENTRE.y) < 1,
                `regions ${JSON.stringify(placed)}; notices ${raw.notices.join(' | ')}; page errors ${pageErrors.join(' | ')}`,
            );
            pass('smoke-blocks-sight', cloud !== undefined && cloud.blocksSight && cloud.behaviours.length === 0, `cloud ${JSON.stringify(cloud ?? null)}`);
            await snapCanvas(page, 'smoke-blind-grenade-cloud-on-canvas', [THROWER_CENTRE, TARGET_CENTRE], 300);
            const texts = await Promise.all(raw.messageIds.map(async (id) => ({ id, text: await cardText(page, id) })));
            const smokeCard = texts.find((c) => c.text.includes('4 m across'));
            pass('smoke-card-states-cloud', smokeCard !== undefined, `cards ${JSON.stringify(texts.map((c) => c.text.slice(0, 300)))}`);
            if (smokeCard !== undefined) await snap(page, 'smoke-blind-grenade-attack-card', { selector: await popOutChatMessage(page, smokeCard.id) });
            await clearRegions(page, scene.sceneId);

            // --- House rule on: the tokens inside are Blinded -------------------
            await setSmokeBlinds(page, true);
            const blindThrow = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
                firer: thrower,
                target,
                weaponName: 'Blind Grenade',
                faces: [[10, 100]] as Array<[number, number]>,
            });
            const blindCloud = (await regions(page, scene.sceneId)).find((r) => r.source === 'smoke');
            const blinded = await blindedBecomes(page, scene.sceneId, target, true);
            pass(
                'smoke-blinds-inside-when-set',
                blindCloud?.behaviours.includes('applyCondition') === true && blinded,
                `cloud ${JSON.stringify(blindCloud ?? null)}, target blinded ${String(blinded)}; notices ${blindThrow.notices.join(
                    ' | ',
                )}; state ${await blindingState(page, scene.sceneId, target)}`,
            );
            await snapCanvas(page, 'smoke-blinding-cloud-target-blinded', [THROWER_CENTRE, TARGET_CENTRE], 300);
            await moveToken(page, scene.sceneId, target, { x: 1150, y: 550 });
            const stillBlinded = await blindedBecomes(page, scene.sceneId, target, false);
            pass('smoke-blind-lifts-on-leaving', !stillBlinded, `target still blinded after leaving: ${String(stillBlinded)}`);
            await snapCanvas(page, 'smoke-target-left-cloud', [THROWER_CENTRE, { x: 1150, y: 550 }], 300);
            await clearRegions(page, scene.sceneId);
            await setSmokeBlinds(page, false);

            // --- Quick Template: a 4 m blinding cloud dropped by hand ------------
            await page.locator('#scene-controls [data-control="wh40k"]').first().click();
            await page.locator('#scene-controls [data-tool="quickTemplate"]').first().click();
            const dialog = page.locator('[data-quick-template]').first();
            await dialog.waitFor({ state: 'visible', timeout: scaledMs(10_000) });
            await dialog.locator('select[name="condition"]').selectOption('blinded');
            await dialog.locator('input[name="name"]').fill('Blind Grenade');
            await dialog.locator('input[name="name"]').press('Tab');
            await snap(page, 'quick-template-dialog-blind-grenade', { selector: '[data-quick-template]' });
            await dialog.locator('button[data-action="place"]').click();
            const drop = { x: 1150, y: 550 };
            await page.waitForTimeout(scaledMs(300));
            await clickCanvas(page, drop);
            await page.evaluate(async (id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as { game: { scenes: { get: (i: string) => { regions: { size: number } } | undefined } } };
                await globalThis.wh40kE2E.pollUntil(() => (g.game.scenes.get(id)?.regions.size ?? 0) > 0);
            }, scene.sceneId);
            const quick = (await regions(page, scene.sceneId)).find((r) => r.source === 'quick');
            pass(
                'quick-template-places-region',
                quick?.name === 'Blind Grenade' &&
                    quick.shape === 'circle' &&
                    quick.radius === 2 &&
                    quick.blocksSight &&
                    Math.abs(quick.x - drop.x) <= 50 &&
                    Math.abs(quick.y - drop.y) <= 50,
                `quick region ${JSON.stringify(quick ?? null)}; page errors ${pageErrors.join(' | ')}`,
            );
            const quickBlinded = await blindedBecomes(page, scene.sceneId, target, true);
            pass('quick-template-blinds-inside', quickBlinded, `target under the quick template blinded: ${String(quickBlinded)}`);
            await snapCanvas(page, 'quick-template-blinding-cloud-on-canvas', [THROWER_CENTRE, drop], 300);
        } finally {
            await setSmokeBlinds(page, false);
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
        }

        const failures: string[] = [];
        for (const flow of AREA_REGION_FLOWS) {
            const detail = passed.get(flow);
            if (detail === null) recordCoverage('area-region.flow', flow);
            else failures.push(`flow ${flow}: ${detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
