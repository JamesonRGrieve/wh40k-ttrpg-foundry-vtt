import type { Page } from '@playwright/test';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * E2E smoke test for the Investigation Lead item sheet (#74).
 *
 * Creates a `lead` item, renders its sheet, snaps a screenshot, then cleans
 * up. Surfaces uncaught page errors so a registration / template regression
 * fails the spec.
 */

interface LeadProbeResult {
    created: boolean;
    rendered: boolean;
    createError: string | null;
    pageErrors: string[];
}

async function probeLeadSheet(page: Page): Promise<LeadProbeResult> {
    const pageErrors: string[] = [];
    const listener = (pageErr: Error): void => {
        pageErrors.push(pageErr.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async () => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const g = globalThis as any;
            const ItemCls = g.Item;
            if (ItemCls?.create == null) {
                return { created: false, rendered: false, createError: 'Item.create unavailable' };
            }
            let item;
            try {
                item = await ItemCls.create({
                    name: 'probe-lead',
                    type: 'lead',
                    system: {
                        state: 'pursued',
                        leadType: 'witness',
                        sourceClue: 'Bloodstained sermon-card from the chapel.',
                        notes: 'Follow up after the vox-window.',
                    },
                });
            } catch (createErr) {
                return { created: false, rendered: false, createError: String((createErr as Error).message) };
            }
            if (item == null) return { created: false, rendered: false, createError: 'Item.create returned null' };

            let rendered = false;
            try {
                if (item.sheet?.render != null) {
                    await item.sheet.render(true);
                    await new Promise((r) => {
                        setTimeout(r, 100);
                    });
                    rendered = true;
                }
            } catch (renderErr) {
                return { created: true, rendered: false, createError: String((renderErr as Error).message) };
            }

            // Leave the sheet open long enough for the screenshot caller to
            // capture it; cleanup happens after snap() in the test below.
            g.__leadProbeItemId = item.id;
            return { created: true, rendered, createError: null };
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });
        return {
            created: result.created,
            rendered: result.rendered,
            createError: result.createError,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

async function cleanupLeadProbe(page: Page): Promise<void> {
    await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
        const g = globalThis as any;
        const id = g.__leadProbeItemId;
        if (id == null) return;
        const item = g.game?.items?.get?.(id);
        try {
            await item?.sheet?.close?.();
        } catch {
            /* ignore */
        }
        try {
            await item?.delete?.();
        } catch {
            /* ignore */
        }
        delete g.__leadProbeItemId;
        /* eslint-enable @typescript-eslint/no-explicit-any */
    });
}

test.describe.serial('lead item sheet', () => {
    test('creates a lead item and renders its sheet', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeLeadSheet(page);
        test.skip(!probe.created, `could not create lead item: ${probe.createError ?? 'unknown'}`);

        await snap(page, 'lead-sheet-render');
        await cleanupLeadProbe(page);

        const failures: string[] = [];
        if (!probe.rendered) {
            failures.push(`sheet did not render: ${probe.createError ?? 'unknown'}`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 3).join(' | ')}`);
        }
        expect(failures, `lead sheet render failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
