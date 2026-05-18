import { expect, test } from '@playwright/test';

/**
 * Issue #201 regression: opening a talent in a compendium threw a Handlebars
 * parse error because `{{#if (eq activeTab"overview")}}` was missing the space
 * between `activeTab` and the literal `"overview"`. The fix re-spaces every
 * such `(eq activeTab "<tab>")` reference in `src/templates/item/talent-sheet.hbs`.
 *
 * This spec drives the dedicated regression story
 * (`Item Sheets/TalentSheet — Issue 201 — Compendium Render`) in a real browser
 * and asserts that:
 *   - the story page loads without surfacing a Handlebars error overlay
 *   - the rendered talent-sheet tab navigation is visible (proves the template
 *     compiled and rendered)
 *   - all four tab buttons (overview/effects/properties/description) are
 *     present, so a future regression that re-introduces the typo to any one
 *     of the four `(eq activeTab "<tab>")` checks would fail this test.
 *
 * The full-page screenshot at `.e2e-screenshots/issue-201-talent-render.png`
 * is a visual confirmation captured alongside the assertions; the directory
 * is gitignored by `.e2e-screenshots/` (see other tests under tests/storybook
 * for the convention) and the file is recreated on every run.
 */
test('issue #201: talent sheet renders cleanly from compendium-mode story', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => {
        errors.push(err.message);
    });
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    });

    await page.goto('/iframe.html?id=item-sheets-talent-sheet--compendium-render&viewMode=story');

    // Wait for the rendered template root. A parse error would have prevented
    // the tab nav from rendering at all.
    const tabNav = page.locator('nav.wh40k-tabs[data-group="primary"]').first();
    await expect(tabNav).toBeVisible();

    // Every tab button must be present. Re-introducing the `activeTab"<tab>"`
    // typo on any single tab would make the whole template fail to compile and
    // this query would time out.
    for (const tab of ['overview', 'effects', 'properties', 'description']) {
        await expect(page.locator(`button[data-tab="${tab}"]`)).toBeVisible();
        await expect(page.locator(`div[data-tab="${tab}"]`).first()).toHaveCount(1);
    }

    // The talent's display name is rendered (header input), independent proof
    // the body of the template — not just the tab strip — survived compilation.
    await expect(page.locator('input[value="Mighty Shot"]').first()).toBeVisible();

    await page.screenshot({ path: '.e2e-screenshots/issue-201-talent-render.png', fullPage: true });

    // No uncaught errors should have surfaced during render. A Handlebars
    // parse failure throws inside the story render and shows up here.
    const handlebarsErrors = errors.filter((msg) => /Parse error|Handlebars|Expecting/i.test(msg));
    expect(handlebarsErrors, `expected no Handlebars errors, got:\n${handlebarsErrors.join('\n')}`).toEqual([]);
});
