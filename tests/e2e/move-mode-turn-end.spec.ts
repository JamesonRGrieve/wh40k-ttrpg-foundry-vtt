import type { Page } from '@playwright/test';
import { type HarnessScene, installAttackHarness } from './lib/attack-harness';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the move-mode reset (#610, src/module/hooks-manager.ts
 * combatTurnChange / deleteCombat + rules/movement-budget.ts `clearTurnMoveMode`).
 *
 * A PC on its turn picks Run on its sheet's movement panel (a real click on the
 * toggle, which writes the token's `movementAction` flag). When the turn passes,
 * the flag is gone and the panel shows no mode selected; an NPC that picked Charge
 * loses it when the encounter ends. The panel is captured with Run selected, and
 * again after the turn change.
 *
 * Each flow records under `move-mode.flow`. Keys MUST match MOVE_MODE_FLOWS in
 * scripts/e2e-coverage.mjs.
 */

const MOVE_MODE_FLOWS = ['toggle-sets-mode', 'turn-change-clears-mode', 'combat-end-clears-mode'] as const;

type FlowName = (typeof MOVE_MODE_FLOWS)[number];

const TOKENS = [
    // Agility 35 gives the panel real distances (Half 3 m … Run 18 m) instead of zeros.
    { key: 'pc', name: 'Runner', type: 'dh2-character', x: 200, y: 200, system: { characteristics: { agility: { base: 35 } } } },
    { key: 'npc', name: 'Charger', type: 'dh2-npc', x: 500, y: 200 },
];

const FLAG_SCOPE = 'wh40k-rpg';
/** The token flag the toggle writes (MOVE_MODE_FLAG in rules/movement-budget.ts; the page cannot import it). */
const FLAG_KEY = 'movementAction';
/** Marks the movement panel on the open sheet for the capture. */
const PANEL_MARK = 'data-e2e-move-panel';

interface TokenDocLike {
    id: string;
    getFlag: (scope: string, key: string) => string | undefined;
    setFlag: (scope: string, key: string, value: string) => Promise<object>;
}

interface CombatLike {
    id: string;
    turn: number;
    combatant: { tokenId: string } | null;
    createEmbeddedDocuments: (type: string, data: object[]) => Promise<object[]>;
    startCombat: () => Promise<object>;
    nextTurn: () => Promise<object>;
    delete: () => Promise<object>;
}

interface MoveGlobals {
    game: {
        scenes: { get: (id: string) => { tokens: { get: (id: string) => TokenDocLike | undefined } } | undefined };
        actors: {
            get: (
                id: string,
            ) =>
                | { sheet: { id: string; rendered: boolean; render: (o: { force: boolean }) => Promise<object>; changeTab: (t: string, g: string) => void } }
                | undefined;
        };
        combats: { get: (id: string) => CombatLike | undefined };
    };
    Combat: { create: (d: object) => Promise<CombatLike> };
}

/** Read the move-mode flag on a token of the harness scene. */
async function modeOf(page: Page, sceneId: string, tokenId: string): Promise<string | null> {
    return page.evaluate(
        (args: { sceneId: string; tokenId: string; scope: string; key: string }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as MoveGlobals;
            return g.game.scenes.get(args.sceneId)?.tokens.get(args.tokenId)?.getFlag(args.scope, args.key) ?? null;
        },
        { sceneId, tokenId, scope: FLAG_SCOPE, key: FLAG_KEY },
    );
}

/** Open (or re-render) the PC's sheet on its Combat tab and mark the movement panel; returns the panel selector. */
async function showMovementPanel(page: Page, actorId: string): Promise<string | null> {
    return page.evaluate(
        async (args: { actorId: string; mark: string }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as MoveGlobals;
            const sheet = g.game.actors.get(args.actorId)?.sheet;
            if (sheet === undefined) return null;
            await sheet.render({ force: true });
            const { waitFor, settle, scaledMs: scale } = globalThis.wh40kE2E;
            await waitFor(() => sheet.rendered, 'PC sheet render', scale(10_000));
            sheet.changeTab('combat', 'primary');
            const toggle = (): Element | null => document.querySelector(`#${sheet.id} [data-movement-type="run"]`);
            await waitFor(() => toggle() !== null, 'movement toggle', scale(10_000));
            const panel = toggle()?.closest('.wh40k-panel');
            panel?.setAttribute(args.mark, '');
            panel?.scrollIntoView({ block: 'center' });
            await settle(300);
            return `#${sheet.id} [${args.mark}]`;
        },
        { actorId, mark: PANEL_MARK },
    );
}

/** Which toggles the panel shows as pressed. */
async function pressedModes(page: Page, panelSelector: string): Promise<string[]> {
    return page.evaluate(
        (sel: string) =>
            Array.from(document.querySelectorAll<HTMLElement>(`${sel} [aria-pressed="true"]`)).map(
                // A turn-gated row drops its data-movement-type; fall back to its label.
                (el) => el.dataset['movementType'] ?? el.textContent.trim().toLowerCase(),
            ),
        panelSelector,
    );
}

test.describe.serial('move mode cleared at turn end (Tier B, #610)', () => {
    test.setTimeout(scaledMs(240_000));
    test('a move mode picked on a turn is gone when the turn passes and when the encounter ends', async ({ page }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);

        const results = new Map<FlowName, string | null>();
        const pass = (flow: FlowName, ok: boolean, detail: string): void => {
            results.set(flow, ok ? null : detail);
        };
        let combatId: string | null = null;
        try {
            const scene: HarnessScene = await page.evaluate(async (tokens) => globalThis.wh40kAttack.setup({ width: 1000, height: 600, tokens }), TOKENS);
            const pcToken = scene.tokens['pc'] ?? '';
            const npcToken = scene.tokens['npc'] ?? '';
            const pcActor = scene.actors['pc'] ?? '';

            combatId = await page.evaluate(
                async (args: { sceneId: string; pc: string; npc: string; pcActor: string; npcActor: string }) => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                    const g = globalThis as unknown as MoveGlobals;
                    const combat = await g.Combat.create({ scene: args.sceneId, active: true });
                    await combat.createEmbeddedDocuments('Combatant', [
                        { tokenId: args.pc, sceneId: args.sceneId, actorId: args.pcActor, initiative: 20 },
                        { tokenId: args.npc, sceneId: args.sceneId, actorId: args.npcActor, initiative: 10 },
                    ]);
                    await combat.startCombat();
                    return combat.id;
                },
                { sceneId: scene.sceneId, pc: pcToken, npc: npcToken, pcActor, npcActor: scene.actors['npc'] ?? '' },
            );

            // The PC picks Run on its own sheet.
            const panel = await showMovementPanel(page, pcActor);
            if (panel === null) throw new Error('the PC sheet did not open');
            await page.locator(`${panel} [data-movement-type="run"]`).click();
            await expect.poll(async () => modeOf(page, scene.sceneId, pcToken), { timeout: scaledMs(10_000) }).toBe('run');
            // The pick redraws the cluster by itself (#235): no re-open, Run shows pressed at once.
            const sheetSelector = panel.split(' ')[0] ?? '';
            await expect(page.locator(`${sheetSelector} [data-movement-type="run"][aria-pressed="true"]`)).toBeVisible();
            await page.mouse.move(1, 1);
            await snap(page, 'move-mode-pick-redraws-cluster', {
                selector: `${sheetSelector} .wh40k-panel:has([data-movement-type="run"])`,
                closeWindows: true,
                keepWindow: sheetSelector.slice(1),
            });
            await showMovementPanel(page, pcActor);
            const before = await pressedModes(page, panel);
            pass('toggle-sets-mode', before.length === 1 && before[0] === 'run', `after the click the panel shows ${JSON.stringify(before)} pressed`);
            // The panel selector is `#<sheet app id> [mark]`; keep that window open for the capture.
            const sheetId = panel.split(' ')[0]?.slice(1) ?? '';
            await page.mouse.move(1, 1);
            await snap(page, 'move-mode-run-selected', { selector: panel, closeWindows: true, keepWindow: sheetId });

            // The turn passes to the NPC: the PC's mode is cleared.
            await page.evaluate(async (id: string) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as MoveGlobals;
                await g.game.combats.get(id)?.nextTurn();
            }, combatId);
            let cleared = false;
            try {
                await expect.poll(async () => modeOf(page, scene.sceneId, pcToken), { timeout: scaledMs(10_000) }).toBeNull();
                cleared = true;
            } catch {
                cleared = false;
            }
            await showMovementPanel(page, pcActor);
            const after = await pressedModes(page, panel);
            pass(
                'turn-change-clears-mode',
                cleared && after.length === 0,
                `after the turn change the flag reads ${String(await modeOf(page, scene.sceneId, pcToken))}; pressed ${JSON.stringify(after)}`,
            );
            await page.mouse.move(1, 1);
            await snap(page, 'move-mode-cleared-after-turn', { selector: panel, closeWindows: true, keepWindow: sheetId });

            // The NPC charges, then the encounter ends: its mode is cleared too.
            await page.evaluate(
                async (args: { sceneId: string; tokenId: string; scope: string; key: string }) => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                    const g = globalThis as unknown as MoveGlobals;
                    await g.game.scenes.get(args.sceneId)?.tokens.get(args.tokenId)?.setFlag(args.scope, args.key, 'charge');
                },
                { sceneId: scene.sceneId, tokenId: npcToken, scope: FLAG_SCOPE, key: FLAG_KEY },
            );
            const charged = await modeOf(page, scene.sceneId, npcToken);
            await page.evaluate(async (id: string) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as MoveGlobals;
                await g.game.combats.get(id)?.delete();
            }, combatId);
            combatId = null;
            let ended = false;
            try {
                await expect.poll(async () => modeOf(page, scene.sceneId, npcToken), { timeout: scaledMs(10_000) }).toBeNull();
                ended = true;
            } catch {
                ended = false;
            }
            pass(
                'combat-end-clears-mode',
                charged === 'charge' && ended,
                `NPC flag before the end ${String(charged)}, after ${String(await modeOf(page, scene.sceneId, npcToken))}`,
            );
        } finally {
            if (combatId !== null) {
                await page.evaluate(async (id: string) => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                    const g = globalThis as unknown as MoveGlobals;
                    await g.game.combats
                        .get(id)
                        ?.delete()
                        .catch(() => undefined);
                }, combatId);
            }
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
        }

        const failures: string[] = [];
        for (const flow of MOVE_MODE_FLOWS) {
            const detail = results.get(flow);
            if (detail === null) recordCoverage('move-mode.flow', flow);
            else failures.push(`flow ${flow}: ${detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
