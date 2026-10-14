import type { Page } from '@playwright/test';
import { type HarnessScene, installAttackHarness, leanWeapon } from './lib/attack-harness';
import { canvasClip } from './lib/canvas-capture';
import { popOutChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of area attacks (#599, #600) and the no-damage area card (#601) on
 * a live canvas, through the real attack path: the targeted action manager opens the
 * unified roll dialog, its `_systemRoll` resolves the attack with seeded dice, the
 * attack places its MeasuredTemplate, and the card's Resolve button reads the tokens
 * inside the template and posts the results card.
 *
 * - Spray (DH2 Hand Flamer, 10 m cone): no attack roll; each creature in the cone
 *   tests to avoid; the firer and a creature outside the cone are never caught.
 * - Blast (DH2 Frag Grenade, Blast 3): the template sits on the target; everyone
 *   inside is hit; Roll Damage rolls one hit per creature.
 * - No damage (DH2 Stun Grenade, Blast 3, damage "—"): the results card names who is
 *   caught and shows "No Damage" in place of Roll Damage.
 *
 * Every state is captured: each template on the canvas, each attack card, each
 * results card and the blast's damage card.
 *
 * Grid: 100 px = 1 m. The firer stands at (250, 550); the target 5 m east; a flanker
 * 7 m out, 4° off the axis (inside the cone and within 3 m of the target); a
 * bystander 5 m out at 37° (outside the 30° cone and 3.2 m from the target).
 *
 * Each flow records under `area-attack.flow`. Keys MUST match AREA_ATTACK_FLOWS in
 * scripts/e2e-coverage.mjs.
 */

const AREA_ATTACK_FLOWS = [
    'spray-places-cone',
    'spray-card-no-attack-roll',
    'spray-resolves-caught',
    'blast-places-circle',
    'blast-resolves-caught',
    'blast-rolls-damage-per-creature',
    'no-damage-area-card',
] as const;

type FlowName = (typeof AREA_ATTACK_FLOWS)[number];

const WEAPONS = 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item';
const HAND_FLAMER = `${WEAPONS}.j7K8l9M0n1O2p3Q4`;
const FRAG_GRENADE = `${WEAPONS}.x1Y2z3A4b5C6d7E8`;
const STUN_GRENADE = `${WEAPONS}.yzrs7m1lir9zo000`;

const FIRER_CENTRE = { x: 250, y: 550 };
const TARGET_CENTRE = { x: 750, y: 550 };
/** The far corners of the 10 m, 30° spray cone, in canvas pixels (1000 px at ±15° from the firer). */
const CONE_EDGES = [
    { x: 1216, y: 291 },
    { x: 1216, y: 809 },
];

const TOKENS = [
    {
        key: 'firer',
        name: 'Gunner',
        type: 'dh2-character',
        x: 200,
        y: 500,
        items: [leanWeapon('Hand Flamer', HAND_FLAMER, 2), leanWeapon('Frag Grenade', FRAG_GRENADE, 1), leanWeapon('Stun Grenade', STUN_GRENADE, 1)],
        system: { characteristics: { ballisticSkill: { base: 50 }, strength: { base: 40 } } },
    },
    { key: 'target', name: 'Mark', type: 'dh2-npc', x: 700, y: 500, system: { characteristics: { agility: { base: 30 } } } },
    { key: 'flank', name: 'Flanker', type: 'dh2-npc', x: 900, y: 550, system: { characteristics: { agility: { base: 30 } } } },
    { key: 'bystander', name: 'Bystander', type: 'dh2-npc', x: 600, y: 800, system: { characteristics: { agility: { base: 30 } } } },
];

interface TemplateView {
    count: number;
    shape: string | null;
    x: number;
    y: number;
    distance: number;
    angle: number;
}

interface CardView {
    hasResolve: boolean;
    hasRollDamage: boolean;
    hasNoDamage: boolean;
    statement: string;
    targets: Array<{ name: string; hit: boolean }>;
}

async function templates(page: Page, sceneId: string): Promise<TemplateView> {
    return page.evaluate((id: string): TemplateView => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            game: {
                scenes: {
                    get: (i: string) => { templates: { contents: Array<{ t: string; x: number; y: number; distance: number; angle: number }> } } | undefined;
                };
            };
        };
        const all = g.game.scenes.get(id)?.templates.contents ?? [];
        const last = all.at(-1);
        return { count: all.length, shape: last?.t ?? null, x: last?.x ?? 0, y: last?.y ?? 0, distance: last?.distance ?? 0, angle: last?.angle ?? 0 };
    }, sceneId);
}

async function clearTemplates(page: Page, sceneId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            game: {
                scenes: {
                    get: (
                        i: string,
                    ) =>
                        | { templates: { contents: Array<{ id: string }> }; deleteEmbeddedDocuments: (type: string, ids: string[]) => Promise<object[]> }
                        | undefined;
                };
            };
        };
        const scene = g.game.scenes.get(id);
        if (scene !== undefined)
            await scene.deleteEmbeddedDocuments(
                'MeasuredTemplate',
                scene.templates.contents.map((t) => t.id),
            );
    }, sceneId);
}

/** Read a posted card from the rendered chat log. */
async function readCard(page: Page, messageId: string): Promise<CardView> {
    return page.evaluate(async (id: string): Promise<CardView> => {
        const sel = `#sidebar .chat-log .message[data-message-id="${id}"]`;
        await globalThis.wh40kE2E.pollUntil(() => document.querySelector(sel) !== null);
        const card = document.querySelector(sel);
        return {
            hasResolve: card?.querySelector('.roll-control__resolve-area') !== null,
            hasRollDamage: card?.querySelector('.roll-control__roll-damage') !== null,
            hasNoDamage: card?.querySelector('[data-no-damage]') !== null,
            statement: card?.querySelector('[data-area-statement]')?.textContent.trim() ?? '',
            targets: Array.from(card?.querySelectorAll<HTMLElement>('[data-area-target]') ?? []).map((li) => ({
                name: li.querySelector('span')?.textContent.trim() ?? '',
                hit: li.dataset['areaHit'] === 'true',
            })),
        };
    }, messageId);
}

/** The card among `ids` that carries `predicate`, read from the log. */
async function findCard(page: Page, ids: readonly string[], predicate: (card: CardView) => boolean): Promise<{ id: string; card: CardView } | null> {
    for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop -- sequential by design: a handful of cards, read in posting order
        const card = await readCard(page, id);
        if (predicate(card)) return { id, card };
    }
    return null;
}

async function snapCanvas(page: Page, label: string, points: ReadonlyArray<{ x: number; y: number }>, pad: number): Promise<void> {
    await page.waitForTimeout(scaledMs(600));
    const clip = await canvasClip(page, points, pad);
    // Floating widgets (In-Universe Time, scene environment) sat over the firer in the first captures.
    await snap(page, label, clip === null ? { selector: '#board', closeWindows: true } : { clip, closeWindows: true });
}

async function snapCard(page: Page, label: string, messageId: string): Promise<void> {
    const selector = await popOutChatMessage(page, messageId);
    await snap(page, label, { selector });
}

/** Frame the whole scene on the canvas so a capture can show a 10 m cone. */
async function frameScene(page: Page): Promise<void> {
    await page.evaluate(async () => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `canvas` is injected by the licensed app; no shipped types
        const g = globalThis as unknown as { canvas: { animatePan: (o: { x: number; y: number; scale: number; duration: number }) => Promise<void> } };
        await g.canvas.animatePan({ x: 750, y: 600, scale: 0.7, duration: 0 });
    });
}

test.describe.serial('area attacks on a live canvas (Tier B, #599, #600, #601)', () => {
    test.setTimeout(scaledMs(300_000));
    test('Spray and Blast place their templates, resolve who is caught, and a no-damage area rolls nothing', async ({ page }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);

        const passed = new Map<FlowName, string | null>();
        const pass = (flow: FlowName, ok: boolean, detail: string): void => {
            passed.set(flow, ok ? null : detail);
        };
        try {
            const scene: HarnessScene = await page.evaluate(async (tokens) => globalThis.wh40kAttack.setup({ width: 1400, height: 1100, tokens }), TOKENS);
            await frameScene(page);
            const firer = scene.tokens['firer'] ?? '';
            const target = scene.tokens['target'] ?? '';

            // --- Spray: a cone on the firer, no attack roll ---------------------
            const spray = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
                firer,
                target,
                weaponName: 'Hand Flamer',
                faces: [[50, 100]] as Array<[number, number]>,
            });
            const cone = await templates(page, scene.sceneId);
            pass(
                'spray-places-cone',
                cone.count === 1 && cone.shape === 'cone' && cone.distance === 10 && cone.angle === 30,
                `templates ${cone.count}, last ${String(cone.shape)} ${cone.distance} m ${cone.angle}°`,
            );
            await snapCanvas(page, 'area-spray-cone-on-canvas', [FIRER_CENTRE, ...CONE_EDGES, { x: 650, y: 850 }], 100);
            const sprayCard = await findCard(page, spray.messageIds, (c) => c.hasResolve);
            pass(
                'spray-card-no-attack-roll',
                sprayCard !== null && sprayCard.card.statement !== '' && !sprayCard.card.hasRollDamage,
                `spray messages ${spray.messageIds.length}; card with Resolve: ${
                    sprayCard === null ? 'none' : JSON.stringify(sprayCard.card)
                }; notices ${spray.notices.join(' | ')}`,
            );
            if (sprayCard !== null) {
                await snapCard(page, 'area-spray-attack-card', sprayCard.id);
                // The first creature tested fails its avoidance (96), the second passes it (5).
                // They are tested in the canvas's token order, so which one is hit is not fixed.
                const posted = await page.evaluate(
                    async (id) =>
                        globalThis.wh40kAttack.clickInMessage({
                            messageId: id,
                            buttonSelector: '.roll-control__resolve-area',
                            faces: [
                                [96, 100],
                                [5, 100],
                            ],
                            expectMessages: 1,
                        }),
                    sprayCard.id,
                );
                const results = await findCard(page, posted, (c) => c.targets.length > 0);
                const names = results?.card.targets ?? [];
                const ok =
                    names.length === 2 &&
                    names.some((n) => n.name === 'Mark') &&
                    names.some((n) => n.name === 'Flanker') &&
                    names.filter((n) => n.hit).length === 1 &&
                    !names.some((n) => n.name === 'Bystander' || n.name === 'Gunner');
                pass('spray-resolves-caught', ok, `spray results ${JSON.stringify(names)}`);
                if (results !== null) await snapCard(page, 'area-spray-results-card', results.id);
            }
            await clearTemplates(page, scene.sceneId);

            // --- Blast: a circle on the target, everyone inside hit -------------
            const blast = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
                firer,
                target,
                weaponName: 'Frag Grenade',
                faces: [[10, 100]] as Array<[number, number]>,
            });
            const circle = await templates(page, scene.sceneId);
            pass(
                'blast-places-circle',
                circle.count === 1 &&
                    circle.shape === 'circle' &&
                    circle.distance === 3 &&
                    Math.abs(circle.x - TARGET_CENTRE.x) < 1 &&
                    Math.abs(circle.y - TARGET_CENTRE.y) < 1,
                `templates ${circle.count}, last ${String(circle.shape)} ${circle.distance} m at ${circle.x},${circle.y}`,
            );
            await snapCanvas(page, 'area-blast-circle-on-canvas', [FIRER_CENTRE, TARGET_CENTRE, { x: 950, y: 600 }, { x: 650, y: 850 }], 350);
            const blastCard = await findCard(page, blast.messageIds, (c) => c.hasResolve);
            if (blastCard === null) {
                pass('blast-resolves-caught', false, `blast messages ${blast.messageIds.length}, none with Resolve; notices ${blast.notices.join(' | ')}`);
            } else {
                await snapCard(page, 'area-blast-attack-card', blastCard.id);
                const posted = await page.evaluate(
                    async (id) =>
                        globalThis.wh40kAttack.clickInMessage({ messageId: id, buttonSelector: '.roll-control__resolve-area', faces: [], expectMessages: 1 }),
                    blastCard.id,
                );
                const results = await findCard(page, posted, (c) => c.targets.length > 0);
                const names = results?.card.targets ?? [];
                const ok = names.length === 2 && names.every((n) => n.hit) && names.some((n) => n.name === 'Mark') && names.some((n) => n.name === 'Flanker');
                pass('blast-resolves-caught', ok, `blast results ${JSON.stringify(names)}`);
                if (results !== null) {
                    await snapCard(page, 'area-blast-results-card', results.id);
                    const damage = await page.evaluate(
                        async (id) =>
                            globalThis.wh40kAttack.clickInMessage({
                                messageId: id,
                                buttonSelector: '.roll-control__roll-damage',
                                faces: [
                                    [7, 10],
                                    [4, 10],
                                    [9, 10],
                                    [2, 10],
                                ],
                                expectMessages: 1,
                            }),
                        results.id,
                    );
                    const hits = await page.evaluate((ids: string[]) => {
                        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                        const g = globalThis as unknown as { game: { messages: { get: (i: string) => { rolls: object[] } | undefined } } };
                        return ids.reduce((n, id) => n + (g.game.messages.get(id)?.rolls.length ?? 0), 0);
                    }, damage);
                    pass('blast-rolls-damage-per-creature', damage.length > 0 && hits === 2, `damage messages ${damage.length}, rolls ${hits}`);
                    const first = damage.at(0);
                    if (first !== undefined) await snapCard(page, 'area-blast-damage-card', first);
                }
            }
            await clearTemplates(page, scene.sceneId);

            // --- No damage: the Stun Grenade catches, rolls nothing -------------
            const stun = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
                firer,
                target,
                weaponName: 'Stun Grenade',
                faces: [[10, 100]] as Array<[number, number]>,
            });
            const stunCard = await findCard(page, stun.messageIds, (c) => c.hasResolve);
            if (stunCard === null) {
                pass('no-damage-area-card', false, `stun messages ${stun.messageIds.length}, none with Resolve; notices ${stun.notices.join(' | ')}`);
            } else {
                const posted = await page.evaluate(
                    async (id) =>
                        globalThis.wh40kAttack.clickInMessage({ messageId: id, buttonSelector: '.roll-control__resolve-area', faces: [], expectMessages: 1 }),
                    stunCard.id,
                );
                const results = await findCard(page, posted, (c) => c.targets.length > 0);
                const ok = results !== null && results.card.hasNoDamage && !results.card.hasRollDamage && results.card.targets.length === 2;
                pass('no-damage-area-card', ok, `stun results ${results === null ? 'none' : JSON.stringify(results.card)}`);
                if (results !== null) await snapCard(page, 'area-stun-no-damage-results-card', results.id);
            }
        } finally {
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
        }

        const failures: string[] = [];
        for (const flow of AREA_ATTACK_FLOWS) {
            const detail = passed.get(flow);
            if (detail === null) recordCoverage('area-attack.flow', flow);
            else failures.push(`flow ${flow}: ${detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
