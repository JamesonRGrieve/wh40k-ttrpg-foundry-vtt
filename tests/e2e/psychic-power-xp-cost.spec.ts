import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B regression for #642: the psychic power sheet's XP Cost survives a reload.
 *
 * The sheet's input bound `system.cost`, but the psychic power schema had no
 * such field, so Foundry dropped whatever was typed on save. The schema now
 * carries the book's printed XP value. This spec also checks the migration: a
 * stray acquisition-currency record (which some pack documents carry under
 * `cost`) loads as "not authored" rather than failing validation.
 *
 * Captures: game__psychic-xp-cost-before.png (empty input, no badge) and
 * game__psychic-xp-cost-after-reload.png (300 in the input and the XP badge).
 */

const NAME = 'e2e-642 psychic power';
const CURRENCY_NAME = 'e2e-642 currency-cost power';
const VALUE = '300';

interface ProbeItem {
    id: string;
    name: string;
    system: { cost: number | null };
    sheet: { id: string; render: (opts: { force: boolean }) => Promise<void>; close: () => Promise<void> };
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Item: { create: (data: object) => Promise<ProbeItem | null> };
    game: { items: { getName: (name: string) => ProbeItem | undefined; filter: (fn: (i: ProbeItem) => boolean) => ProbeItem[] } };
}

async function storedCost(page: Page, name: string): Promise<number | null | '<missing>'> {
    return page.evaluate((n) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const item = (globalThis as unknown as ProbeWindow).game.items.getName(n);
        return item === undefined ? '<missing>' : item.system.cost;
    }, name);
}

async function openSheet(page: Page): Promise<string> {
    const sheetId = await page.evaluate(async (n) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const item = (globalThis as unknown as ProbeWindow).game.items.getName(n);
        if (item === undefined) throw new Error(`${n} missing`);
        await item.sheet.render({ force: true });
        return item.sheet.id;
    }, NAME);
    await expect(page.locator(`#${sheetId} [name="system.cost"]`)).toHaveCount(1);
    return sheetId;
}

async function closeSheet(page: Page): Promise<void> {
    await page.evaluate(async (n) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        await (globalThis as unknown as ProbeWindow).game.items.getName(n)?.sheet.close();
    }, NAME);
}

async function snapSheet(page: Page, sheetId: string, label: string): Promise<void> {
    await clearScreenOverlays(page, sheetId);
    const shot = await snap(page, label, { selector: `#${sheetId}` });
    expect(shot, `snap ${label}`).not.toBeNull();
}

async function cleanup(page: Page): Promise<void> {
    await page.evaluate(async () => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        for (const item of w.game.items.filter((i) => i.name.startsWith('e2e-642'))) await item.delete();
    });
}

test('a psychic power XP cost typed on its sheet persists across a reload (#642)', async ({ page }) => {
    await joinOrSkip(page);
    await cleanup(page);
    await page.evaluate(
        async ({ name, currencyName }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            await w.Item.create({ name, type: 'psychicPower', system: { prCost: 1 } });
            // The shape some pack documents carry under `cost`: a currency record, not XP.
            await w.Item.create({ name: currencyName, type: 'psychicPower', system: { cost: { throneGelt: null } } });
        },
        { name: NAME, currencyName: CURRENCY_NAME },
    );

    // A new power has no authored cost, and a currency record migrates to the same.
    expect(await storedCost(page, NAME)).toBeNull();
    expect(await storedCost(page, CURRENCY_NAME), 'currency-shaped cost loads as not authored').toBeNull();

    const sheetId = await openSheet(page);
    await expect(page.locator(`#${sheetId} [name="system.cost"]`)).toHaveValue('');
    await expect(page.locator(`#${sheetId} .fa-gem`)).toHaveCount(0);
    await snapSheet(page, sheetId, 'psychic-xp-cost-before');

    await page.evaluate(
        ({ id, value }) => {
            const control = document.querySelector<HTMLInputElement>(`#${id} [name="system.cost"]`);
            if (control === null) throw new Error('system.cost not rendered');
            control.value = value;
            control.dispatchEvent(new Event('change', { bubbles: true }));
        },
        { id: sheetId, value: VALUE },
    );
    await expect.poll(async () => storedCost(page, NAME), { message: 'XP cost saved' }).toBe(Number(VALUE));
    await closeSheet(page);

    // Reload: the value must come back from the server, not from the client's memory.
    await page.reload();
    await joinOrSkip(page);
    expect(await storedCost(page, NAME), 'XP cost after reload').toBe(Number(VALUE));

    const reopened = await openSheet(page);
    await expect(page.locator(`#${reopened} [name="system.cost"]`)).toHaveValue(VALUE);
    // The header shows the printed cost as an XP badge.
    await expect(page.locator(`#${reopened} .fa-gem`)).toHaveCount(1);
    await snapSheet(page, reopened, 'psychic-xp-cost-after-reload');
    await closeSheet(page);

    await cleanup(page);
    recordCoverage('sheet.edit', 'PsychicPowerSheet.xpCostPersists');
});
