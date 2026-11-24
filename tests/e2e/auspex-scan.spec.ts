import type { Page } from '@playwright/test';
import { type HarnessScene, installAttackHarness } from './lib/attack-harness';
import { canvasClip } from './lib/canvas-capture';
import { popOutChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B: an auspex scan (#759) on a live canvas.
 *
 * A DH2 character carrying the Auspex/Scanner (50 m, sees through 50 cm of wall, once
 * a round in combat) scans from its token through the real item roll and roll dialog:
 * - a success finds the creature 5 m away, not the one behind a 60 cm wall, nor the one
 *   60 m away. The GM gets a whispered card naming it; the roll card states the count.
 * - a failure reads nothing and whispers no card.
 * - in combat, a second scan the same round is refused before the test opens.
 * - the Wall Configuration shows the wall's scan fields with its thickness.
 *
 * Grid: 100 px = 1 m. The scanner stands at (550, 550).
 *
 * Each flow records under `auspex.flow`. Keys MUST match AUSPEX_FLOWS in
 * scripts/e2e-coverage.mjs.
 */
const AUSPEX_FLOWS = [
    'scan-finds-contact-in-range',
    'scan-wall-blocks',
    'scan-out-of-range-missed',
    'scan-card-states-contacts',
    'scan-failure-reads-nothing',
    'scan-once-per-round',
    'wall-config-shows-scan-fields',
] as const;
type FlowName = (typeof AUSPEX_FLOWS)[number];

const AUSPEX_UUID = compendiumUuid({ line: 'dh2', category: 'tools' }, 'Tm4kRvXp8wLn2QBf');
const SCANNER_CENTRE = { x: 550, y: 550 };
/** A 60 cm wall across the line to the walled contact, 5 m north of the scanner. */
const THICK_WALL = { c: [300, 200, 800, 200], thickness: 60 };

const TOKENS = [
    {
        key: 'scanner',
        name: 'Scanner',
        type: 'dh2-character',
        x: 500,
        y: 500,
        items: [{ name: 'Auspex/Scanner', type: 'gear', _stats: { compendiumSource: AUSPEX_UUID }, system: { state: { equipped: true } } }],
        system: { characteristics: { intelligence: { base: 40 } }, skills: { techUse: { advance: 1 } } },
    },
    { key: 'near', name: 'Near Contact', type: 'dh2-npc', x: 1000, y: 500 },
    { key: 'walled', name: 'Walled Contact', type: 'dh2-npc', x: 500, y: 0 },
    { key: 'far', name: 'Distant Contact', type: 'dh2-npc', x: 6500, y: 500 },
];

/** What one use of the auspex produced. */
interface ScanUse {
    /** The roll dialog opened (false when the use was refused first). */
    opened: boolean;
    /** Text of the whispered GM card, or null when none was posted. */
    gmCard: string | null;
    gmCardId: string | null;
    /** Text of the roll card. */
    rollCard: string;
    rollCardId: string | null;
    notices: string[];
}

/** Use the scanner's auspex through the real item roll, rolling the test with `face` on the d100. */
async function useAuspex(page: Page, scannerActorId: string, face: number): Promise<ScanUse> {
    return page.evaluate(
        async ({ actorId, d100 }) => {
            interface Message {
                id: string;
                content: string;
                whisper: string[];
            }
            interface RollApp {
                element?: HTMLElement;
                _systemRoll: () => Promise<void>;
                close: () => Promise<void>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: {
                    actors: {
                        get: (i: string) => { items: { contents: Array<{ id: string; name: string }> }; rollItem: (id: string) => Promise<void> } | undefined;
                    };
                    messages: { contents: Message[] };
                };
                ui: { notifications: { warn: (m: string) => void } };
                CONFIG: { Dice: { randomUniform: () => number } };
                foundry: { applications: { instances: Map<string, RollApp> } };
            };
            const actor = g.game.actors.get(actorId);
            const item = actor?.items.contents.find((i) => i.name === 'Auspex/Scanner');
            if (actor === undefined || item === undefined) throw new Error('no scanner or auspex');
            const before = new Set(g.game.messages.contents.map((m) => m.id));
            const notices: string[] = [];
            const notifications = g.ui.notifications;
            const dice = g.CONFIG.Dice;
            const warn = notifications.warn;
            notifications.warn = (m: string): void => {
                notices.push(m);
                warn.call(notifications, m);
            };
            const restoreWarn = (): void => {
                notifications.warn = warn;
            };
            const dialogs = (): RollApp[] =>
                [...g.foundry.applications.instances.values()].filter((app) => app.element?.classList.contains('unified-roll-dialog') === true);
            // A roll dialog still closing from the last use isn't this use's dialog.
            const before = new Set(dialogs());
            const findDialog = (): RollApp | null => dialogs().find((app) => !before.has(app)) ?? null;
            let opened = false;
            try {
                await actor.rollItem(item.id);
                opened = await globalThis.wh40kE2E
                    .pollUntil(() => findDialog() !== null, 8000)
                    .then(() => true)
                    .catch(() => false);
                const dialog = findDialog();
                if (dialog !== null) {
                    const original = dice.randomUniform;
                    // The d100's face, then the middle face for anything else.
                    const queue = [1 - (d100 - 0.5) / 100];
                    dice.randomUniform = (): number => queue.shift() ?? 0.5;
                    try {
                        await dialog._systemRoll();
                    } finally {
                        dice.randomUniform = original;
                        await findDialog()
                            ?.close()
                            .catch(() => undefined);
                    }
                }
            } finally {
                restoreWarn();
            }
            const posted = g.game.messages.contents.filter((m) => !before.has(m.id));
            const text = (html: string): string => new DOMParser().parseFromString(html, 'text/html').body.textContent.replace(/\s+/g, ' ');
            const gm = posted.find((m) => m.content.includes('data-auspex-scan'));
            const roll = posted.find((m) => !m.content.includes('data-auspex-scan'));
            return {
                opened,
                gmCard: gm === undefined ? null : text(gm.content),
                gmCardId: gm?.id ?? null,
                rollCard: roll === undefined ? '' : text(roll.content),
                rollCardId: roll?.id ?? null,
                notices,
            };
        },
        { actorId: scannerActorId, d100: face },
    );
}

/** Make a wall on the scene carrying a scan thickness. */
async function addThickWall(page: Page, sceneId: string): Promise<string> {
    return page.evaluate(
        async ({ id, wall }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: { scenes: { get: (i: string) => { createEmbeddedDocuments: (t: string, d: object[]) => Promise<Array<{ id: string }>> } | undefined } };
            };
            const created = await g.game.scenes
                .get(id)
                ?.createEmbeddedDocuments('Wall', [{ c: wall.c, flags: { 'wh40k-rpg': { scanThickness: wall.thickness } } }]);
            return created?.at(0)?.id ?? '';
        },
        { id: sceneId, wall: THICK_WALL },
    );
}

/** Start a combat holding the scanner's token. */
async function startCombat(page: Page, sceneId: string, tokenId: string): Promise<string> {
    return page.evaluate(
        async ({ scene, token }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                Combat: {
                    create: (
                        d: object,
                    ) => Promise<{ id: string; createEmbeddedDocuments: (t: string, d: object[]) => Promise<object[]>; startCombat: () => Promise<object> }>;
                };
            };
            const combat = await g.Combat.create({ scene, active: true });
            await combat.createEmbeddedDocuments('Combatant', [{ tokenId: token, sceneId: scene }]);
            await combat.startCombat();
            return combat.id;
        },
        { scene: sceneId, token: tokenId },
    );
}

async function deleteCombat(page: Page, combatId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { combats: { get: (i: string) => { delete: () => Promise<object> } | undefined } } };
        await g.game.combats.get(id)?.delete();
    }, combatId);
}

/** Open the wall's sheet and read its scan fields. */
async function openWallConfig(page: Page, sceneId: string, wallId: string): Promise<{ hasFields: boolean; thickness: string }> {
    return page.evaluate(
        async ({ scene, wall }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: {
                    scenes: {
                        get: (i: string) => { walls: { get: (w: string) => { sheet: { render: (o: object) => Promise<object> } } | undefined } } | undefined;
                    };
                };
            };
            await g.game.scenes.get(scene)?.walls.get(wall)?.sheet.render({ force: true });
            await globalThis.wh40kE2E.pollUntil(() => document.querySelector('[data-wall-scan]') !== null, 8000).catch(() => undefined);
            const input = document.querySelector<HTMLInputElement>('[data-wall-scan] input[name="flags.wh40k-rpg.scanThickness"]');
            return { hasFields: document.querySelector('[data-wall-scan]') !== null, thickness: input?.value ?? '' };
        },
        { scene: sceneId, wall: wallId },
    );
}

test.describe.serial('auspex scan (Tier B, #759)', () => {
    test.setTimeout(scaledMs(300_000));
    test('a scan finds what is in reach, not behind a thick wall or out of range; fails read nothing; once a round in combat', async ({ page }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);
        const passed = new Map<FlowName, string | null>();
        const pass = (flow: FlowName, ok: boolean, detail: string): void => {
            passed.set(flow, ok ? null : detail);
        };
        let combatId: string | null = null;
        try {
            const scene: HarnessScene = await page.evaluate(async (tokens) => globalThis.wh40kAttack.setup({ width: 7000, height: 1200, tokens }), TOKENS);
            const scannerActor = scene.actors['scanner'] ?? '';
            const wallId = await addThickWall(page, scene.sceneId);

            // --- A success: the near contact only -------------------------------------
            const hit = await useAuspex(page, scannerActor, 5);
            const gm = hit.gmCard ?? '';
            pass(
                'scan-finds-contact-in-range',
                hit.opened && gm.includes('Near Contact'),
                `opened ${String(hit.opened)}; gm card ${JSON.stringify(hit.gmCard)}; notices ${hit.notices.join(' | ')}`,
            );
            pass('scan-wall-blocks', hit.gmCard !== null && !gm.includes('Walled Contact'), `gm card ${JSON.stringify(hit.gmCard)}`);
            pass('scan-out-of-range-missed', hit.gmCard !== null && !gm.includes('Distant Contact'), `gm card ${JSON.stringify(hit.gmCard)}`);
            pass('scan-card-states-contacts', hit.rollCard.includes('1 contact(s) within 50 m'), `roll card ${JSON.stringify(hit.rollCard.slice(0, 400))}`);
            const clip = await canvasClip(page, [SCANNER_CENTRE, { x: 1050, y: 550 }, { x: 550, y: 50 }], 200);
            await snap(page, 'auspex-scan-sweep-on-canvas', clip === null ? { selector: '#board', closeWindows: true } : { clip, closeWindows: true });
            if (hit.gmCardId !== null) await snap(page, 'auspex-scan-gm-card', { selector: await popOutChatMessage(page, hit.gmCardId) });
            if (hit.rollCardId !== null) await snap(page, 'auspex-scan-roll-card', { selector: await popOutChatMessage(page, hit.rollCardId) });

            // --- A failure: nothing read, no card ----------------------------------------
            const miss = await useAuspex(page, scannerActor, 95);
            pass(
                'scan-failure-reads-nothing',
                miss.opened && miss.gmCard === null && miss.rollCard.includes('no clear reading'),
                `gm ${JSON.stringify(miss.gmCard)}; roll ${JSON.stringify(miss.rollCard.slice(0, 300))}`,
            );

            // --- In combat: once a round -------------------------------------------------
            combatId = await startCombat(page, scene.sceneId, scene.tokens['scanner'] ?? '');
            const first = await useAuspex(page, scannerActor, 5);
            const second = await useAuspex(page, scannerActor, 5);
            pass(
                'scan-once-per-round',
                first.opened && !second.opened && second.notices.some((n) => n.includes('already been used this round')),
                `first opened ${String(first.opened)}; second opened ${String(second.opened)}; notices ${second.notices.join(' | ')}`,
            );

            // --- The wall's scan fields -------------------------------------------------
            const wallForm = await openWallConfig(page, scene.sceneId, wallId);
            pass(
                'wall-config-shows-scan-fields',
                wallForm.hasFields && wallForm.thickness === '60',
                `fields ${String(wallForm.hasFields)}, thickness ${JSON.stringify(wallForm.thickness)}`,
            );
            if (wallForm.hasFields) await snap(page, 'auspex-wall-config-scan-fields', { selector: '[data-wall-scan]' });
        } finally {
            if (combatId !== null) await deleteCombat(page, combatId);
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
        }

        const failures: string[] = [];
        for (const flow of AUSPEX_FLOWS) {
            const detail = passed.get(flow);
            if (detail === null) recordCoverage('auspex.flow', flow);
            else failures.push(`flow ${flow}: ${detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
