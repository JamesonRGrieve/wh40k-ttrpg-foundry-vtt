/**
 * Regression spec for issue #198: selecting any Home World, Background, Role,
 * or Elite Advance origin card threw `TypeError: item.toObject is not a function`
 * because `_itemToSelectionData` was reached against an already-normalized
 * plain-object origin entry (no `toObject()` method) and unconditionally called
 * `.toObject()` on it. The fix routes plain-object entries through a
 * deep-clone branch.
 *
 * This spec opens the Storybook story that renders the resulting preview-panel
 * state (a normalized Void Born origin selected from the card list), asserts the
 * preview rendered without throwing, and snapshots a screenshot so the visual
 * regression is detectable.
 */
import { expect, test } from '@playwright/test';

test.describe('Issue #198 — origin path preview against normalized origin', () => {
    test('renders Void Born preview without item.toObject errors', async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on('pageerror', (err) => consoleErrors.push(err.message));
        page.on('console', (msg) => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });

        await page.goto('/iframe.html?id=character-creation-originpathbuilder--issue-198-void-born-preview');

        // The selection-panel rows produced from the normalized origin's
        // `grants` shape must be visible — this proves the data round-tripped
        // through the preview render path, not just the card render path.
        await expect(page.getByText('Void Accustomed')).toBeVisible();
        await expect(page.getByText('Pilot (Spacecraft)')).toBeVisible();

        // The crashing path: clicking the already-previewed card must not
        // produce the issue #198 error string anywhere in the console.
        await page.locator('[data-action="selectOriginCard"]').first().click();

        await page.screenshot({ path: '.e2e-screenshots/issue-198-origin-preview.png', fullPage: true });

        const toObjectErrors = consoleErrors.filter((m) => m.includes('toObject is not a function'));
        expect(toObjectErrors, `unexpected toObject errors: ${toObjectErrors.join(' | ')}`).toHaveLength(0);
    });
});
