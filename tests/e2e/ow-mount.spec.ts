import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Only War Mounted Combat panel + action
 * (#159 — Hammer of the Emperor §"MOUNTED COMBAT" /
 * "MOUNT SPECIAL ACTIONS" / "MOUNT TRAITS", hammer.md lines 4046-4260).
 *
 * Creates an `ow-character` actor in the seed world (with a primed
 * `mountedOn` link so the mount readout exercises the populated branch),
 * opens its sheet, asserts the Mount panel renders with all four
 * action rows (Charge / Trample / Run Down / Mounted Attack), drives
 * one Issue click for the Charge row, asserts the action dispatch did
 * not throw, and snapshots the rendered sheet.
 *
 * Panel visibility depends on the orchestrator wiring the include
 * into `tab-status.hbs` gated on `isOW` and the schema fields onto
 * CharacterData. Pre-wire-up the presence assertions surface the
 * wiring gap; post-wire-up the spec exercises the full interaction.
 */

interface ActorRef {
    id: string;
}

async function createOwActor(page: Page): Promise<ActorRef | { error: string }> {
    const result = await page.evaluate(async () => {
        interface FoundryGlobal {
            Actor?: { create?: (data: object) => Promise<{ id?: string } | null> };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser globals untyped at the realm boundary
        const { Actor: ActorCls } = globalThis as unknown as FoundryGlobal;
        if (!ActorCls?.create) return { id: null, error: 'Actor.create unavailable' };
        try {
            const actor = await ActorCls.create({
                name: 'probe-ow-mount-pc',
                type: 'ow-character',
                system: {
                    gameSystem: 'ow',
                    mountedOn: {
                        mountId: 'Compendium.wh40k-rpg.ow-mounts.Actor.test-warhorse',
                        traits: ['quadruped', 'sure-footed', 'brutal-charge'],
                    },
                },
            });
            if (!actor) return { id: null, error: 'Actor.create returned null' };
            return { id: actor.id ?? null, error: null };
        } catch (err) {
            return { id: null, error: err instanceof Error ? err.message : String(err) };
        }
    });
    if (result.id === null) return { error: result.error ?? 'unknown create error' };
    return { id: result.id };
}

async function deleteActor(page: Page, actorId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        interface ActorHandle {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor.delete returns Promise<this> with no shipped types
            delete?: () => Promise<unknown>;
        }
        interface CleanupGlobal {
            game?: { actors?: { get?: (id: string) => ActorHandle | undefined } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser globals untyped at the realm boundary
        const { game: gameGlobal } = globalThis as unknown as CleanupGlobal;
        const actor = gameGlobal?.actors?.get?.(id);
        await actor?.delete?.();
    }, actorId);
}

test.describe.serial('OW Mounted Combat panel (Tier B, #159)', () => {
    test('renders the panel, drives owMountedAction, asserts mount readout, snaps', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const created = await createOwActor(page);
        if ('error' in created) {
            test.skip(true, `ow-character creation failed: ${created.error}`);
            return;
        }
        const actorId = created.id;

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async (id: string) => {
                interface ActorSheet {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 sheet.render returns Promise<this> with no shipped types
                    render: (opts: object) => Promise<unknown>;
                    element: HTMLElement | null;
                    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 sheet.close returns Promise<this> with no shipped types
                    close?: () => Promise<unknown>;
                }
                interface ActorInstance {
                    sheet: ActorSheet | null;
                }
                interface FoundryGlobal {
                    game?: { actors?: { get?: (id: string) => ActorInstance | undefined } };
                    __c159sheet?: ActorSheet | undefined;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser globals untyped at the realm boundary
                const g = globalThis as unknown as FoundryGlobal;
                const actor = g.game?.actors?.get?.(id);
                if (actor == null) return { error: 'actor lookup failed' };

                let rendered = false;
                let hasPanel = false;
                let hasChargeRow = false;
                let hasTrampleRow = false;
                let hasRunDownRow = false;
                let hasMountedAttackRow = false;
                let hasIssueButton = false;
                let hasMountReadout = false;
                let issueDispatched = false;
                let probeError: string | null = null;

                try {
                    const sheet = actor.sheet;
                    if (sheet == null) return { error: 'actor.sheet is null' };
                    await sheet.render({ force: true });
                    await new Promise((r) => {
                        setTimeout(r, 120);
                    });
                    rendered = sheet.element instanceof HTMLElement;

                    if (rendered && sheet.element !== null) {
                        const el: HTMLElement = sheet.element;
                        const panel = el.querySelector('.wh40k-ow-mount-panel');
                        hasPanel = panel !== null;
                        hasChargeRow = el.querySelector('[data-action-id="charge"]') !== null;
                        hasTrampleRow = el.querySelector('[data-action-id="trample"]') !== null;
                        hasRunDownRow = el.querySelector('[data-action-id="run-down"]') !== null;
                        hasMountedAttackRow = el.querySelector('[data-action-id="mounted-attack"]') !== null;
                        hasMountReadout = el.querySelector('.wh40k-ow-mount-current-readout') !== null;
                        const issueBtn = el.querySelector<HTMLButtonElement>('button[data-action="owMountedAction"][data-action-id="charge"]');
                        hasIssueButton = issueBtn !== null;

                        if (issueBtn !== null && !issueBtn.disabled) {
                            issueBtn.click();
                            await new Promise((r) => {
                                setTimeout(r, 200);
                            });
                            issueDispatched = true;
                        }
                    }

                    // Keep the sheet open so snap() (outside this evaluate)
                    // captures the live DOM.
                    g.__c159sheet = sheet;
                } catch (err) {
                    probeError = err instanceof Error ? err.message : String(err);
                }

                return {
                    rendered,
                    hasPanel,
                    hasChargeRow,
                    hasTrampleRow,
                    hasRunDownRow,
                    hasMountedAttackRow,
                    hasIssueButton,
                    hasMountReadout,
                    issueDispatched,
                    error: probeError,
                };
            }, actorId);

            await snap(page, 'ow-mount-panel');

            await page.evaluate(async () => {
                interface SheetCloseable {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 sheet.close returns Promise<this> with no shipped types
                    close?: () => Promise<unknown>;
                }
                interface CleanupGlobal {
                    __c159sheet?: SheetCloseable | undefined;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser globals untyped at the realm boundary
                const g = globalThis as unknown as CleanupGlobal;
                try {
                    await g.__c159sheet?.close?.();
                } catch {
                    /* ignore */
                }
                g.__c159sheet = undefined;
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'sheet did not render').toBe(true);
            expect(result.hasPanel, 'OW Mount panel should render in OW sheet').toBe(true);
            expect(result.hasChargeRow, 'Charge row should render').toBe(true);
            expect(result.hasTrampleRow, 'Trample row should render').toBe(true);
            expect(result.hasRunDownRow, 'Run Down row should render').toBe(true);
            expect(result.hasMountedAttackRow, 'Mounted Attack row should render').toBe(true);
            expect(result.hasIssueButton, 'Issue button for Charge should render').toBe(true);
            expect(result.hasMountReadout, 'Mount readout should render when mountedOn is non-null').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'OwMountPanel');
        } finally {
            page.off('pageerror', listener);
            await deleteActor(page, actorId);
        }
    });
});
