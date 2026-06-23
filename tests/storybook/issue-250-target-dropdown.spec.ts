/**
 * Issue #250 — the weapon Roll Test panel's Select Target control is now a
 * dropdown of the active Combat's combatants (sourced from game.combat.combatants),
 * not Foundry canvas token-targeting. Screenshots the dropdown and asserts the
 * combatant options render with the currently-targeted combatant preselected.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const SHOT_DIR = resolve(__dirname, '..', '..', '.e2e-screenshots');
const SHOT = resolve(SHOT_DIR, 'issue-250-target-dropdown.png');

test('issue #250: weapon panel renders a combatant target dropdown', async ({ page }) => {
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.goto('/iframe.html?id=prompts-unifiedrolldialog--weapon-target-dropdown&viewMode=story');
    await page.waitForSelector('select[name="targetCombatantId"]', { timeout: 10_000 });
    await page.screenshot({ path: SHOT, fullPage: true });

    const options = await page.locator('select[name="targetCombatantId"] option').allInnerTexts();
    expect(options.length).toBe(4); // "No target" + 3 combatants
    const joined = options.join(' | ');
    expect(joined).toContain('Cultist Alpha');
    expect(joined).toContain('Hybrid Aberrant');
    // The currently-targeted combatant is preselected.
    await expect(page.locator('select[name="targetCombatantId"]')).toHaveValue('c1');
});
