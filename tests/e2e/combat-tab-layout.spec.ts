import type { Page } from '@playwright/test';
import { type HarnessScene, installAttackHarness } from './lib/attack-harness';
import { assertFlowResults } from './lib/flow-assert';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { allWithinContainer, openProbeSheet, type SheetWidth } from './lib/sheet-probe';
import { test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the Combat tab's Armour | Movement row (#617, #620,
 * src/templates/actor/panel/combat-station-panel.hbs, partial/movement-stat-row.hbs).
 *
 * At the default sheet width the armour silhouette's column was too narrow: L.ARM
 * was cut off and L.LEG partly hidden, on PC and NPC sheets alike (#620); and the
 * selected move mode's check was clipped at the row's edge (#617). The two panels now
 * sit side by side only when both fit, else stack. A DH2 PC (Run selected) and a DH2
 * NPC (Charge selected) in an encounter are opened on their Combat tab at the sheet's
 * default and minimum widths; every armour location and the check must lie inside
 * their panel, and each sheet is captured.
 *
 * Each flow records under `combat-tab-layout.flow`. Keys MUST match
 * COMBAT_TAB_LAYOUT_FLOWS in scripts/e2e-coverage.mjs.
 */

const COMBAT_TAB_LAYOUT_FLOWS = ['pc-default-width', 'pc-min-width', 'npc-default-width', 'npc-min-width'] as const;
type FlowName = (typeof COMBAT_TAB_LAYOUT_FLOWS)[number];

/** The narrowest a PC / NPC sheet resizes to (tailwind/npc-sheet.js). */
const MIN_SHEET_WIDTH_PX = 600;

const agility35 = { characteristics: { agility: { base: 35 } } };
const TOKENS = [
    { key: 'pc', name: 'Runner', type: 'dh2-character', x: 200, y: 200, system: agility35, flags: { 'wh40k-rpg': { sheetSource: 'authored-build' } } },
    { key: 'npc', name: 'Charger', type: 'dh2-npc', x: 500, y: 200, system: agility35 },
];

/** Start an encounter with both tokens and give each its move mode (the token flag the toggle writes). */
async function startEncounter(page: Page, scene: HarnessScene): Promise<string> {
    return page.evaluate(async (s: HarnessScene) => {
        interface TokenDoc {
            setFlag: (scope: string, key: string, value: string) => Promise<object>;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            Combat: {
                create: (
                    d: object,
                ) => Promise<{ id: string; createEmbeddedDocuments: (t: string, d: object[]) => Promise<object[]>; startCombat: () => Promise<object> }>;
            };
            game: { scenes: { get: (id: string) => { tokens: { get: (id: string) => TokenDoc | undefined } } | undefined } };
        };
        const combat = await g.Combat.create({ scene: s.sceneId, active: true });
        await combat.createEmbeddedDocuments('Combatant', [
            { tokenId: s.tokens['pc'], sceneId: s.sceneId, actorId: s.actors['pc'], initiative: 20 },
            { tokenId: s.tokens['npc'], sceneId: s.sceneId, actorId: s.actors['npc'], initiative: 10 },
        ]);
        await combat.startCombat();
        const tokens = g.game.scenes.get(s.sceneId)?.tokens;
        await tokens?.get(s.tokens['pc'] ?? '')?.setFlag('wh40k-rpg', 'movementAction', 'run');
        await tokens?.get(s.tokens['npc'] ?? '')?.setFlag('wh40k-rpg', 'movementAction', 'charge');
        return combat.id;
    }, scene);
}

async function endEncounter(page: Page, combatId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { combats: { get: (i: string) => { delete: () => Promise<object> } | undefined } } };
        await g.game.combats.get(id)?.delete();
    }, combatId);
}

/** How many armour locations and selected-mode checks the open sheet renders. */
async function countPieces(page: Page, appId: string): Promise<{ locations: number; checks: number }> {
    return page.evaluate((id: string) => {
        const root = document.getElementById(id);
        return { locations: root?.querySelectorAll('[data-location]').length ?? 0, checks: root?.querySelectorAll('[data-move-mode-selected]').length ?? 0 };
    }, appId);
}

/** Scroll the sheet body so `selector` is in view, for the capture. */
async function scrollSheetTo(page: Page, appId: string, selector: string, block: 'start' | 'center'): Promise<void> {
    await page.evaluate(
        async (args: { appId: string; selector: string; block: 'start' | 'center' }) => {
            document.getElementById(args.appId)?.querySelector(args.selector)?.scrollIntoView({ block: args.block });
            await globalThis.wh40kE2E.settle(200);
        },
        { appId, selector, block },
    );
}

test.describe.serial('Combat tab Armour and Movement fit the sheet (Tier B, #617, #620)', () => {
    test.setTimeout(scaledMs(300_000));
    test('every armour location and the selected move check lie inside their panel at default and minimum widths', async ({ page }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);
        const results: Array<{ name: FlowName; ok: boolean; detail: string | null }> = [];
        const record = (name: FlowName, ok: boolean, detail: string): void => {
            results.push({ name, ok, detail: ok ? null : detail });
        };
        let combatId: string | null = null;
        try {
            const scene: HarnessScene = await page.evaluate(async (tokens) => globalThis.wh40kAttack.setup({ width: 1000, height: 600, tokens }), TOKENS);
            combatId = await startEncounter(page, scene);
            const cases: Array<{ key: 'pc' | 'npc'; width: SheetWidth; flow: FlowName }> = [
                { key: 'pc', width: 'default', flow: 'pc-default-width' },
                { key: 'pc', width: 'min', flow: 'pc-min-width' },
                { key: 'npc', width: 'default', flow: 'npc-default-width' },
                { key: 'npc', width: 'min', flow: 'npc-min-width' },
            ];
            for (const { key, width, flow } of cases) {
                // eslint-disable-next-line no-await-in-loop -- one sheet at a time, captured in turn
                const sheet = await openProbeSheet(page, scene.actors[key] ?? '', { tab: 'combat', width });
                if (sheet === null) {
                    record(flow, false, `${key} sheet did not open`);
                    continue;
                }
                // eslint-disable-next-line no-await-in-loop -- reads the sheet just opened
                const pieces = await countPieces(page, sheet.appId);
                // eslint-disable-next-line no-await-in-loop -- reads the sheet just opened
                const armour = await allWithinContainer(page, sheet.appId, '[data-location]', '.wh40k-panel');
                // eslint-disable-next-line no-await-in-loop -- reads the sheet just opened
                const check = await allWithinContainer(page, sheet.appId, '[data-move-mode-selected]', '[aria-pressed]');
                record(
                    flow,
                    pieces.locations === 6 && pieces.checks === 1 && armour.ok && check.ok && (width !== 'min' || sheet.width >= MIN_SHEET_WIDTH_PX),
                    `${key} at ${sheet.width}px: ${pieces.locations} locations, ${pieces.checks} checks; armour ${armour.detail}; check ${check.detail}`,
                );
                // eslint-disable-next-line no-await-in-loop -- captures the sheet just opened
                const tag = `${key}-${width === 'min' ? 'min' : 'default'}-width`;
                // eslint-disable-next-line no-await-in-loop -- captures the sheet just opened
                await scrollSheetTo(page, sheet.appId, '[data-combat-armour-movement]', 'start');
                // eslint-disable-next-line no-await-in-loop -- captures the sheet just opened
                await snap(page, `combat-tab-layout-${tag}-armour`, { selector: `#${sheet.appId}`, closeWindows: true, keepWindow: sheet.appId });
                // eslint-disable-next-line no-await-in-loop -- captures the sheet just opened
                await scrollSheetTo(page, sheet.appId, '[data-move-mode-selected]', 'center');
                // eslint-disable-next-line no-await-in-loop -- captures the sheet just opened
                await snap(page, `combat-tab-layout-${tag}-move-mode`, { selector: `#${sheet.appId}`, closeWindows: true, keepWindow: sheet.appId });
            }
        } finally {
            if (combatId !== null) await endEncounter(page, combatId);
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
        }
        assertFlowResults({ results }, COMBAT_TAB_LAYOUT_FLOWS, { dimension: 'combat-tab-layout.flow', label: 'combat tab layout' });
    });
});
