import type { Page } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B (#699): sub-headings inside the talent and NPC-template sheets' panels
 * read as one family with the panel titles. They were bare h4s in Foundry's h4
 * face (Modesto Condensed, 24px), larger and showier than the titles above
 * them. Every sub-heading must now be in the panel title's font, and no larger.
 */

interface ProbeDoc {
    id: string;
    sheet: { id: string; render: (o: object) => Promise<object>; close: () => Promise<object> };
    delete: () => Promise<object>;
}
interface ProbeGlobals {
    Item: { create: (data: object) => Promise<ProbeDoc | null> };
    game: { items: { get: (id: string) => ProbeDoc | undefined } };
}

interface HeadingFonts {
    titleFamily: string;
    titleSize: number;
    headings: Array<{ text: string; family: string; size: number }>;
}

/** The fonts of the open tab's panel title and of every sub-heading on it. */
async function headingFonts(page: Page, sheetId: string): Promise<HeadingFonts> {
    return page.evaluate((id) => {
        const root = document.getElementById(id);
        const visible = (el: Element): boolean => el instanceof HTMLElement && el.offsetParent !== null;
        const title = Array.from(root?.querySelectorAll('[data-item-section] > header h3') ?? []).find(visible);
        const titleStyle = title === undefined ? null : getComputedStyle(title);
        return {
            titleFamily: titleStyle?.fontFamily ?? '',
            titleSize: Number.parseFloat(titleStyle?.fontSize ?? '0'),
            headings: Array.from(root?.querySelectorAll('[data-item-subheading]') ?? [])
                .filter(visible)
                .map((el) => {
                    const style = getComputedStyle(el);
                    return { text: el.textContent.trim(), family: style.fontFamily, size: Number.parseFloat(style.fontSize) };
                }),
        };
    }, sheetId);
}

function expectPanelFamily(fonts: HeadingFonts, expected: string[]): void {
    expect(fonts.headings.map((h) => h.text)).toEqual(expected);
    expect(fonts.titleFamily).toContain('Signika');
    for (const heading of fonts.headings) {
        expect(heading.family, `${heading.text}: sub-heading font`).toBe(fonts.titleFamily);
        expect(heading.size, `${heading.text}: sub-heading larger than its panel title`).toBeLessThanOrEqual(fonts.titleSize);
    }
}

async function openSheet(page: Page, data: object): Promise<{ itemId: string; sheetId: string }> {
    return page.evaluate(async (createData) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
        const g = globalThis as unknown as ProbeGlobals;
        const doc = await g.Item.create(createData);
        if (doc === null) throw new Error('Item.create returned null');
        await doc.sheet.render({ force: true });
        return { itemId: doc.id, sheetId: doc.sheet.id };
    }, data);
}

async function closeAndDelete(page: Page, itemId: string): Promise<void> {
    await page.evaluate(async (id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
        const doc = (globalThis as unknown as ProbeGlobals).game.items.get(id);
        await doc?.sheet.close();
        await doc?.delete();
    }, itemId);
}

test.describe.serial('item sheet sub-headings (Tier B, #699)', () => {
    test("the talent sheet's sub-headings match its panel titles", async ({ page }) => {
        await joinOrSkip(page);
        const { itemId, sheetId } = await openSheet(page, {
            name: 'e2e-699 Subheading Talent',
            type: 'talent',
            system: {
                grants: {
                    skills: [{ name: 'Awareness', level: 'trained' }],
                    talents: [{ name: 'Ambidextrous' }],
                    specialAbilities: [{ name: 'Unrelenting', description: '<p>Ignores the first Fatigue.</p>' }],
                },
                modifiers: { characteristics: { strength: 5 } },
            },
        });
        try {
            const sheet = page.locator(`#${sheetId}`);
            await expect(sheet).toBeVisible();
            await clearScreenOverlays(page, sheetId);
            expectPanelFamily(await headingFonts(page, sheetId), ['Unrelenting']);

            await sheet.locator('nav [data-tab="effects"]').first().click();
            expectPanelFamily(await headingFonts(page, sheetId), ['Characteristics', 'Skills', 'Talents']);
            // #701: the effects summary strip is a styled row inset with the sheet's padding (it sat flush
            // to the window edge as bare text): pills with a background and their counts.
            const banner = sheet.locator('[data-wh40k-hook="talent-effects-banner"]');
            const strip = await banner.evaluate((el) => {
                const root = el.closest('.application');
                const left = el.getBoundingClientRect().left - (root?.getBoundingClientRect().left ?? 0);
                const pills = Array.from(el.querySelectorAll('[data-wh40k-hook="talent-effect-pill"]'), (pill) => ({
                    text: pill.textContent.replace(/\s+/gu, ' ').trim(),
                    background: getComputedStyle(pill).backgroundColor,
                }));
                return { left, border: getComputedStyle(el).borderTopStyle, pills };
            });
            expect(strip.left, 'the strip is inset from the window edge').toBeGreaterThanOrEqual(8);
            expect(strip.border).toBe('solid');
            expect(strip.pills.map((pill) => pill.text)).toEqual(['Modifiers 1', 'Grants 1+1']);
            expect(strip.pills.every((pill) => pill.background !== 'rgba(0, 0, 0, 0)')).toBe(true);
            await snap(page, 'talent-sheet-subheadings', { selector: `#${sheetId}` });
        } finally {
            await closeAndDelete(page, itemId);
        }
    });

    test("the NPC template's Preview sub-headings match its panel titles", async ({ page }) => {
        await joinOrSkip(page);
        const { itemId, sheetId } = await openSheet(page, { name: 'e2e-699 Subheading Template', type: 'npcTemplate' });
        try {
            const sheet = page.locator(`#${sheetId}`);
            await expect(sheet).toBeVisible();
            await clearScreenOverlays(page, sheetId);
            await sheet.locator('nav [data-tab="preview"]').first().click();
            const fonts = await headingFonts(page, sheetId);
            expectPanelFamily(
                fonts,
                fonts.headings.map((h) => h.text),
            );
            expect(fonts.headings.map((h) => h.text)).toEqual(expect.arrayContaining(['Characteristics', 'Vital Stats']));
            await snap(page, 'npc-template-preview-subheadings', { selector: `#${sheetId}` });
        } finally {
            await closeAndDelete(page, itemId);
        }
    });
});
