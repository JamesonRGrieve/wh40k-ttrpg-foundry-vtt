import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B for #687: saving an origin-path sheet keeps the origin's step.
 *
 * The sheet's step select hard-coded Rogue Trader's steps, so a DH2 elite advance,
 * a BC archetype or an OW speciality opened on "Home World". The sheet's form
 * submits every control on change, so any edit in edit mode wrote `homeWorld` over
 * the real step. That dropped the origin out of its builder step, its psyker unlock
 * (#681) and the Elite Advances tab (#684).
 *
 * Each case opens the sheet, checks the select shows the item's step and the header
 * its 1-based step number, enters edit mode, and edits another field (the name) so
 * the form submits. Then it checks the edit saved and the step did not
 * change.
 */

const PREFIX = 'e2e-687';
/** Appended to the origin's name: the edit that makes the sheet's form submit. */
const RENAMED = '(edited)';

interface Case {
    line: string;
    step: string;
    stepIndex: number;
    name: string;
}

const CASES: readonly Case[] = [
    { line: 'dh2', step: 'elite', stepIndex: 4, name: 'Psyker' },
    { line: 'bc', step: 'archetype', stepIndex: 2, name: 'Psyker' },
    { line: 'ow', step: 'speciality', stepIndex: 7, name: 'Weapon Specialist' },
];

interface ProbeItem {
    id: string;
    name: string;
    system: { step: string; stepIndex: number };
    sheet: { id: string; render: (opts: { force: boolean }) => Promise<void>; close: () => Promise<void> };
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Item: { create: (data: object) => Promise<ProbeItem | null> };
    game: { items: { get: (id: string) => ProbeItem | undefined; filter: (fn: (i: { name: string }) => boolean) => ProbeItem[] } };
}

async function storedOrigin(page: Page, id: string): Promise<{ step: string; name: string }> {
    return page.evaluate((itemId) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const item = (globalThis as unknown as ProbeWindow).game.items.get(itemId);
        return { step: item?.system.step ?? '<missing>', name: item?.name ?? '<missing>' };
    }, id);
}

test.describe.serial('origin-path sheet keeps the step on save (Tier B, #687)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(async (prefix) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            for (const item of w.game.items.filter((i) => i.name.startsWith(prefix))) {
                await item.sheet.close();
                await item.delete();
            }
        }, PREFIX);
    });

    for (const c of CASES) {
        test(`${c.line} ${c.step}: an edit in edit mode leaves the step alone`, async ({ page }) => {
            await joinOrSkip(page);
            const { id, sheetId } = await page.evaluate(
                async ({ data }) => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                    const w = globalThis as unknown as ProbeWindow;
                    const item = await w.Item.create(data);
                    if (item === null) throw new Error('Item.create returned null');
                    await item.sheet.render({ force: true });
                    return { id: item.id, sheetId: item.sheet.id };
                },
                { data: { name: `${PREFIX} ${c.line} ${c.name}`, type: 'originPath', system: { gameSystem: c.line, step: c.step, stepIndex: c.stepIndex } } },
            );
            const sheet = page.locator(`#${sheetId}`);
            await expect(sheet).toBeVisible();
            await clearScreenOverlays(page, sheetId);
            await expect(sheet.locator('select[name="system.step"]')).toHaveValue(c.step);
            await expect(sheet).toContainText(`Step ${c.stepIndex}`);

            await sheet.locator('[data-action="toggleEditMode"]').first().click();
            await expect(sheet.locator('select[name="system.step"]')).toHaveValue(c.step);
            await page.evaluate(
                ({ appId, value }) => {
                    const control = document.querySelector<HTMLInputElement>(`#${appId} [name="name"]`);
                    if (control === null) throw new Error('name not rendered');
                    control.value = value;
                    control.dispatchEvent(new Event('change', { bubbles: true }));
                },
                { appId: sheetId, value: `${PREFIX} ${c.line} ${c.name} ${RENAMED}` },
            );
            await expect.poll(async () => (await storedOrigin(page, id)).name, { message: 'the edit saved' }).toBe(`${PREFIX} ${c.line} ${c.name} ${RENAMED}`);
            expect((await storedOrigin(page, id)).step).toBe(c.step);
            await expect(sheet.locator('select[name="system.step"]')).toHaveValue(c.step);
            await snap(page, `origin-step-kept-${c.line}-${c.step}`, { selector: `#${sheetId}` });
            recordCoverage('sheet.save', `originPath.${c.line}.${c.step}`);
        });
    }
});
