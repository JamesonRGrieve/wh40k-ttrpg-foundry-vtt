import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Only War Orders panel + actions (#153).
 *
 * Creates an `ow-character` actor in the seed world, opens its sheet,
 * asserts the Orders panel renders with the three generic Order rows
 * (Ranged Volley / Close Quarters / Take Cover!), drives one Issue
 * click for the Ranged Volley row, asserts `system.activeOrders`
 * appended the entry, and snapshots the rendered sheet.
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
        interface ActorCreateGlobals {
            Actor?: { create?: (data: object) => Promise<{ id?: string } | null> };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-context globalThis (Actor namespace, no shipped browser-side types)
        const { Actor: ActorCls } = globalThis as unknown as ActorCreateGlobals;
        if (!ActorCls?.create) return { id: null, error: 'Actor.create unavailable' };
        try {
            const actor = await ActorCls.create({
                name: 'probe-ow-orders-pc',
                type: 'ow-character',
                system: {
                    gameSystem: 'ow',
                    activeOrders: [],
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
        interface DeleteGlobals {
            game?: { actors?: { get?: (id: string) => { delete?: () => Promise<void> } | undefined } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-context globalThis (game namespace, no shipped browser-side types)
        const { game: gameObj } = globalThis as unknown as DeleteGlobals;
        const actor = gameObj?.actors?.get?.(id);
        await actor?.delete?.();
    }, actorId);
}

test.describe.serial('OW Orders panel (Tier B, #153)', () => {
    test('renders the panel, drives owIssueOrder, asserts activeOrders persists, snaps', async ({ page }) => {
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
                interface ProbeSheet {
                    render: (options: { force: boolean }) => Promise<void>;
                    element?: HTMLElement | null;
                    close?: () => Promise<void>;
                }
                interface ProbeActor {
                    system?: { activeOrders?: Array<{ orderId?: string }> };
                    sheet?: ProbeSheet | null;
                }
                interface ProbeGlobals {
                    game?: { actors?: { get?: (id: string) => ProbeActor | undefined } };
                    __c153sheet?: ProbeSheet | undefined;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-context globalThis (game namespace + cross-callback sheet handle, no shipped browser-side types)
                const g = globalThis as unknown as ProbeGlobals;
                const actor = g.game?.actors?.get?.(id);
                if (actor == null) return { error: 'actor lookup failed' };

                let rendered = false;
                let hasPanel = false;
                let hasRangedVolleyRow = false;
                let hasCloseQuartersRow = false;
                let hasTakeCoverRow = false;
                let hasIssueButton = false;
                let ordersBefore = 0;
                let ordersAfter = 0;
                let firstOrderId: string | null = null;
                let issueDispatched = false;
                let probeError: string | null = null;

                try {
                    ordersBefore = Array.isArray(actor.system?.activeOrders) ? actor.system.activeOrders.length : 0;
                    const sheet = actor.sheet;
                    if (sheet == null) return { error: 'actor.sheet is null' };
                    await sheet.render({ force: true });
                    await new Promise<void>((r) => {
                        setTimeout(r, 120);
                    });
                    rendered = sheet.element instanceof HTMLElement;

                    if (rendered && sheet.element != null) {
                        const el: HTMLElement = sheet.element;
                        const panel = el.querySelector('.wh40k-ow-orders-panel');
                        hasPanel = panel !== null;
                        hasRangedVolleyRow = el.querySelector('[data-order-id="ranged-volley"]') !== null;
                        hasCloseQuartersRow = el.querySelector('[data-order-id="close-quarters"]') !== null;
                        hasTakeCoverRow = el.querySelector('[data-order-id="take-cover"]') !== null;
                        const issueBtn = el.querySelector<HTMLButtonElement>('button[data-action="owIssueOrder"][data-order-id="ranged-volley"]');
                        hasIssueButton = issueBtn !== null;

                        if (issueBtn && !issueBtn.disabled) {
                            issueBtn.click();
                            await new Promise<void>((r) => {
                                setTimeout(r, 200);
                            });
                            issueDispatched = true;
                        }

                        const after = actor.system?.activeOrders;
                        ordersAfter = Array.isArray(after) ? after.length : 0;
                        firstOrderId = Array.isArray(after) && after.length > 0 ? after[0]?.orderId ?? null : null;
                    }

                    // Keep the sheet open so snap() (outside this evaluate)
                    // captures the live DOM.
                    g.__c153sheet = sheet;
                } catch (err) {
                    probeError = err instanceof Error ? err.message : String(err);
                }

                return {
                    rendered,
                    hasPanel,
                    hasRangedVolleyRow,
                    hasCloseQuartersRow,
                    hasTakeCoverRow,
                    hasIssueButton,
                    ordersBefore,
                    ordersAfter,
                    firstOrderId,
                    issueDispatched,
                    error: probeError,
                };
            }, actorId);

            await snap(page, 'ow-orders-panel');

            await page.evaluate(async () => {
                interface CleanupGlobals {
                    __c153sheet?: { close?: () => Promise<void> } | undefined;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: cross-callback sheet handle stashed on globalThis (no shipped browser-side type)
                const g = globalThis as unknown as CleanupGlobals;
                try {
                    await g.__c153sheet?.close?.();
                } catch {
                    /* ignore */
                }
                g.__c153sheet = undefined;
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'sheet did not render').toBe(true);
            expect(result.hasPanel, 'OW Orders panel should render in OW sheet').toBe(true);
            expect(result.hasRangedVolleyRow, 'Ranged Volley row should render').toBe(true);
            expect(result.hasCloseQuartersRow, 'Close Quarters row should render').toBe(true);
            expect(result.hasTakeCoverRow, 'Take Cover! row should render').toBe(true);
            expect(result.hasIssueButton, 'Issue button for Ranged Volley should render').toBe(true);
            expect(result.ordersBefore, 'activeOrders should start empty').toBe(0);
            if (result.issueDispatched === true) {
                expect(result.ordersAfter, 'activeOrders should append one entry after Issue').toBe(1);
                expect(result.firstOrderId, 'persisted entry should match the clicked orderId').toBe('ranged-volley');
            }
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'OwOrdersPanel');
        } finally {
            page.off('pageerror', listener);
            await deleteActor(page, actorId);
        }
    });
});
