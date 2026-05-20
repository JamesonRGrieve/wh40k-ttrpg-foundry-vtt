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

async function createOwActor(page: import('@playwright/test').Page): Promise<ActorRef | { error: string }> {
    const result = await page.evaluate(async () => {
        const { Actor } = globalThis as unknown as {
            Actor?: { create?: (data: object) => Promise<{ id?: string } | null> };
        };
        if (!Actor?.create) return { id: null, error: 'Actor.create unavailable' };
        try {
            const actor = await Actor.create({
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
            return { id: null, error: String((err as Error)?.message ?? err) };
        }
    });
    if (!result.id) return { error: result.error ?? 'unknown create error' };
    return { id: result.id };
}

async function deleteActor(page: import('@playwright/test').Page, actorId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        const { game } = globalThis as unknown as {
            game?: { actors?: { get?: (id: string) => { delete?: () => Promise<unknown> } | undefined } };
        };
        const actor = game?.actors?.get?.(id);
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
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
                const g = globalThis as any;
                const actor = g.game?.actors?.get?.(id);
                if (!actor) return { error: 'actor lookup failed' };

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
                    if (!sheet) return { error: 'actor.sheet is null' };
                    await sheet.render({ force: true });
                    await new Promise((r) => setTimeout(r, 120));
                    rendered = sheet.element instanceof HTMLElement;

                    if (rendered && sheet.element) {
                        const el: HTMLElement = sheet.element;
                        const panel = el.querySelector('.wh40k-ow-orders-panel');
                        hasPanel = panel !== null;
                        hasRangedVolleyRow = el.querySelector('[data-order-id="ranged-volley"]') !== null;
                        hasCloseQuartersRow = el.querySelector('[data-order-id="close-quarters"]') !== null;
                        hasTakeCoverRow = el.querySelector('[data-order-id="take-cover"]') !== null;
                        const issueBtn = el.querySelector('button[data-action="owIssueOrder"][data-order-id="ranged-volley"]') as HTMLButtonElement | null;
                        hasIssueButton = issueBtn !== null;

                        if (issueBtn && !issueBtn.disabled) {
                            issueBtn.click();
                            await new Promise((r) => setTimeout(r, 200));
                            issueDispatched = true;
                        }

                        const after = actor.system?.activeOrders;
                        ordersAfter = Array.isArray(after) ? after.length : 0;
                        firstOrderId = Array.isArray(after) && after.length > 0 ? (after[0] as { orderId?: string } | undefined)?.orderId ?? null : null;
                    }

                    // Keep the sheet open so snap() (outside this evaluate)
                    // captures the live DOM.
                    g.__c153sheet = sheet;
                } catch (err) {
                    probeError = String((err as Error)?.message ?? err);
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
                /* eslint-enable @typescript-eslint/no-explicit-any */
            }, actorId);

            await snap(page, 'ow-orders-panel');

            await page.evaluate(async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const g = globalThis as any;
                try {
                    await g.__c153sheet?.close?.();
                } catch {
                    /* ignore */
                }
                g.__c153sheet = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'sheet did not render').toBe(true);
            expect(result.hasPanel, 'OW Orders panel should render in OW sheet').toBe(true);
            expect(result.hasRangedVolleyRow, 'Ranged Volley row should render').toBe(true);
            expect(result.hasCloseQuartersRow, 'Close Quarters row should render').toBe(true);
            expect(result.hasTakeCoverRow, 'Take Cover! row should render').toBe(true);
            expect(result.hasIssueButton, 'Issue button for Ranged Volley should render').toBe(true);
            expect(result.ordersBefore, 'activeOrders should start empty').toBe(0);
            if (result.issueDispatched) {
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
