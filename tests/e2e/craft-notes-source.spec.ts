import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { cleanupProbes, openProbeSheet, snapElement } from './occult-sheet-flow';

/**
 * Tier B: the craft sheet's Notes tab shows and edits its Source through the shared
 * Source control (#229), the same book and page inputs the item sheets use, read
 * from the structured `system.source`.
 */

const BOOK = 'Dark Heresy 2e Core';
const PAGE = '247';
const SOURCE_PANEL = 'section.tab[data-tab="notes"]';

test.describe.serial('craft Notes tab Source control (Tier B, #229)', () => {
    test.afterEach(async ({ page }) => {
        await cleanupProbes(page);
    });

    test('a DH2 vehicle shows its book and page through the shared control', async ({ page }) => {
        await joinOrSkip(page);
        const { sheetId } = await openProbeSheet(
            page,
            { name: 'Chimera', type: 'dh2-vehicle', system: { gameSystem: 'dh2', source: { book: BOOK, page: PAGE } } },
            'notes',
        );
        const notes = page.locator(`#${sheetId} ${SOURCE_PANEL}`);
        await expect(notes.locator('input[name="system.source.book"]')).toHaveValue(BOOK);
        await expect(notes.locator('input[name="system.source.page"]')).toHaveValue(PAGE);
        await expect(notes.locator('input[name="system.source.book"]')).toHaveAttribute('aria-label', /.+/);
        await snapElement(page, 'craft-notes-source', `#${sheetId} ${SOURCE_PANEL}`, sheetId);
        recordCoverage('sheet.tab', 'craft.notes.source');
    });
});
