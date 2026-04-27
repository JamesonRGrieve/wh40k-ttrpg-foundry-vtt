import { expect, test } from '@playwright/test';

test.describe('Storybook integration', () => {
    test('renders active effects panel actions', async ({ page }) => {
        await page.goto('/iframe.html?id=shared-components--active-effects-panel');

        await expect(page.locator('[data-action="createEffect"]').first()).toBeVisible();
        await expect(page.locator('[data-action="editEffect"]')).toHaveCount(2);
        await expect(page.getByText('Blessed Ammunition')).toBeVisible();
    });

    test('renders action roll controls in the browser', async ({ page }) => {
        await page.goto('/iframe.html?id=chat-roll-cards--action-success-with-controls');

        await expect(page.getByText('Active Qualities')).toBeVisible();
        await expect(page.locator('.roll-control__roll-damage')).toBeVisible();
        await expect(page.locator('.roll-control__refund')).toBeVisible();
    });

    test('renders weapon sheet composition with loaded ammo and effects', async ({ page }) => {
        await page.goto('/iframe.html?id=item-sheets-weapon-sheet--standard');

        await expect(page.locator('[data-action="rollDamage"]').first()).toBeVisible();
        await expect(page.getByText('Kraken Penetrator')).toBeVisible();
        await expect(page.getByText('Machine Spirit Agitation')).toBeVisible();
    });

    test('renders the composed DH2 character sheet story', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-character-sheets--dark-heresy-2-biography');

        await expect(page.locator('input[name="system.rank"]')).toBeVisible();
        await expect(page.getByText('Character Journal')).toBeVisible();
        await expect(page.locator('[data-item-id="journal-1"]').first()).toBeAttached();
    });

    test('renders the composed IM NPC sheet story', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-character-sheets--imperium-maledictum-npc');

        await expect(page.locator('input[name="system.threatLevel"]')).toBeVisible();
        await expect(page.getByText('GM Tools')).toBeVisible();
        await expect(page.getByText('Scale to Threat')).toBeVisible();
    });
});
