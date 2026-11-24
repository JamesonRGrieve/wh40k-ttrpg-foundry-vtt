import type { Page } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B, every item sheet: its tabs switch, and its content scrolls.
 *
 * A playtester (2026-11-24) found the Ship Component sheet cut off below Power
 * (Used) with no scrollbar, and its Effects tab would not open. The scrolling
 * section sat in a wrapper with no height, so it never overflowed and the sheet's
 * outer `overflow: hidden` just clipped it.
 *
 * For each Item type the system registers: create one, open its sheet at its
 * default size, and on every tab:
 * - clicking the tab's button makes that tab the visible one;
 * - after scrolling every scrollable ancestor to its end, the tab's last field
 *   sits inside the window (none is clipped out of reach).
 */

interface SheetLike {
    id: string;
    element: HTMLElement;
    render: (o: object) => Promise<SheetLike>;
    close: () => Promise<void>;
}

interface ItemGlobal {
    Item: { create: (data: object) => Promise<{ id: string; sheet: SheetLike; delete: () => Promise<object | undefined> } | null> };
    game: { documentTypes: { Item: string[] } };
}

interface TypeReport {
    type: string;
    tabs: string[];
    failures: string[];
}

/** Open one item type's sheet, walk its tabs, and report what fails. */
async function checkType(page: Page, type: string): Promise<TypeReport> {
    return page.evaluate(async (itemType) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as ItemGlobal;
        const failures: string[] = [];
        const item = await g.Item.create({ name: `e2e scroll ${itemType}`, type: itemType });
        if (item === null) return { type: itemType, tabs: [], failures: ['could not create'] };
        try {
            const sheet = await item.sheet.render({ force: true });
            await globalThis.wh40kE2E.settle(300);
            const buttons = [...sheet.element.querySelectorAll<HTMLElement>('nav.tabs [data-tab][data-group]')];
            const tabs = buttons.map((b) => b.dataset['tab'] ?? '');
            // A sheet with no tab strip is one panel: check it as the window's content.
            const targets = buttons.length > 0 ? buttons : [null];
            for (const button of targets) {
                const tab = button?.dataset['tab'] ?? '(single)';
                if (button !== null) {
                    button.click();
                    // eslint-disable-next-line no-await-in-loop -- each tab switch must render before it is read
                    await globalThis.wh40kE2E.settle(200);
                }
                // A panel is found as the sheet's tab binder finds it (api/sheet-tabs.ts): a
                // `[data-tab]` child of the content container, or a `.tab` panel of the group.
                const group = button?.dataset['group'] ?? '';
                const panel =
                    button === null
                        ? sheet.element.querySelector<HTMLElement>('.window-content')
                        : (sheet.element.querySelector<HTMLElement>(`.wh40k-tab-content > [data-tab="${tab}"]`) ??
                          sheet.element.querySelector<HTMLElement>(`.tab[data-tab="${tab}"][data-group="${group}"]`));
                if (panel === null) {
                    failures.push(`${tab}: no panel`);
                    continue;
                }
                if (button !== null && (!panel.classList.contains('active') || panel.getClientRects().length === 0)) {
                    failures.push(`${tab}: its button did not open it`);
                    continue;
                }
                // The other tabs' panels are hidden, not stacked under it.
                const shownOthers = tabs.filter((other) => {
                    if (other === tab) return false;
                    const otherPanel =
                        sheet.element.querySelector<HTMLElement>(`.wh40k-tab-content > [data-tab="${other}"]`) ??
                        sheet.element.querySelector<HTMLElement>(`.tab[data-tab="${other}"][data-group="${group}"]`);
                    return otherPanel !== null && otherPanel.getClientRects().length > 0;
                });
                if (button !== null && shownOthers.length > 0) failures.push(`${tab}: other tabs still shown (${shownOthers.join(', ')})`);
                // A number box is sized to its value, never stretched across the window
                // (operator, 2026-11-24: "Full width fields for numbers?").
                const windowWidth = sheet.element.getBoundingClientRect().width;
                const wide = [...panel.querySelectorAll<HTMLInputElement>('input[type="number"]')]
                    .filter((input) => input.getClientRects().length > 0 && input.getBoundingClientRect().width > windowWidth / 2)
                    .map((input) => `${input.name} ${Math.round(input.getBoundingClientRect().width)}px`);
                if (wide.length > 0) failures.push(`${tab}: full-width number boxes ${wide.join(', ')}`);
                // The tab's last visible field.
                const fields = [...panel.querySelectorAll<HTMLElement>('input, select, textarea, button, prose-mirror, multi-checkbox')].filter(
                    (el) => el.getClientRects().length > 0,
                );
                const last = fields.at(-1);
                if (last === undefined) continue;
                for (let el: HTMLElement | null = last.parentElement; el !== null && el !== sheet.element; el = el.parentElement) {
                    el.scrollTop = el.scrollHeight;
                }
                // eslint-disable-next-line no-await-in-loop -- the scroll must apply before the field is measured
                await globalThis.wh40kE2E.settle(100);
                const windowBox = sheet.element.getBoundingClientRect();
                const box = last.getBoundingClientRect();
                if (box.bottom > windowBox.bottom + 1)
                    failures.push(`${tab}: last field ${Math.round(box.bottom - windowBox.bottom)}px below the window, out of reach`);
            }
            await sheet.close();
            return { type: itemType, tabs, failures };
        } finally {
            await item.delete();
        }
    }, type);
}

test('every item sheet: tabs switch and content scrolls into reach', async ({ page }) => {
    test.setTimeout(20 * 60_000);
    await joinOrSkip(page);
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
    const types = await page.evaluate(() => (globalThis as unknown as ItemGlobal).game.documentTypes.Item.filter((t) => t !== 'base'));
    expect(types).toContain('shipComponent');
    const reports: TypeReport[] = [];
    for (const type of types) {
        // eslint-disable-next-line no-await-in-loop -- one sheet open at a time keeps the measurements independent
        reports.push(await checkType(page, type));
    }

    // The sheet the playtester reported, scrolled to its end, on its Effects tab.
    const shipSheet = await page.evaluate(async () => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const item = await (globalThis as unknown as ItemGlobal).Item.create({ name: 'Xenos Habitats', type: 'shipComponent' });
        const sheet = await item?.sheet.render({ force: true });
        await globalThis.wh40kE2E.settle(300);
        const body = sheet?.element.querySelector<HTMLElement>('[data-item-sheet-body] section');
        if (body) body.scrollTop = body.scrollHeight;
        return sheet?.id ?? '';
    });
    await snap(page, 'item-sheet-ship-component-scrolled', { selector: `#${shipSheet}`, closeWindows: true, keepWindow: shipSheet });
    await page.locator(`#${shipSheet} nav.tabs [data-tab="effects"]`).click();
    await snap(page, 'item-sheet-ship-component-effects-tab', { selector: `#${shipSheet}`, closeWindows: true, keepWindow: shipSheet });

    const failed = reports.filter((r) => r.failures.length > 0).map((r) => `${r.type} [${r.tabs.join(', ')}]: ${r.failures.join('; ')}`);
    expect(failed, `item sheets with an unreachable field, a dead tab or a full-width number box:\n${failed.join('\n')}`).toEqual([]);
});
