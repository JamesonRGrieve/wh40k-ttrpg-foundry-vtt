/**
 * #628 / #629 — locked compendium sheets, in the built Storybook.
 *
 * #628: a Black Crusade NPC opened from a compendium renders its composed,
 * locked sheet with no BC Overview panel. #629: a locked compendium weapon
 * keeps "Show Details" usable while its editing controls stay disabled. The
 * stories' play functions assert the same; this spec fails if a play throws.
 */
import { expect, test } from '@playwright/test';

test.describe('locked compendium sheets (#628, #629)', () => {
    test('a locked BC compendium NPC sheet renders without BC Overview panels', async ({ page }) => {
        await page.goto('/iframe.html?id=dev-actor-npcsheet-locked-compendium--asphodel-kroot-warrior');
        const name = page.locator('input[name="name"]').first();
        await expect(name).toHaveValue('Asphodel Kroot Warrior');
        await expect(name).toBeDisabled();
        await expect(page.getByText('GM Tools')).toBeVisible();
        await expect(page.locator('.wh40k-bc-alignment-panel')).toHaveCount(0);
        await expect(page.locator('.sb-errordisplay')).toBeHidden();
    });

    test('a locked compendium weapon keeps Show Details usable', async ({ page }) => {
        await page.goto('/iframe.html?id=dev-item-sheets-weaponsheet--locked-compendium-show-details');
        await expect(page.locator('button[data-action="toggleBody"]')).toBeEnabled();
        await expect(page.locator('input[name="name"]').first()).toBeDisabled();
        await expect(page.locator('.sb-errordisplay')).toBeHidden();
    });
});
