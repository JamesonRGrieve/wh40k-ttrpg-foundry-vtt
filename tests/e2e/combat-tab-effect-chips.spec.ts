import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B: the Combat tab's Active Effects chips show each effect's name and icon (#494).
 *
 * The Combat-tab context mapped the effect name to `label` while the shared chip
 * template reads `name`, and every builder read the deprecated `icon` (empty on
 * V14), so the chips showed neither. A character with two effects opens on its
 * Combat tab; each chip names its effect and draws its icon, and the Overview tab's
 * chips match.
 */

const NAME = 'e2e-494-effects';
const EFFECTS = [
    { name: 'e2e Stunned', img: 'icons/svg/daze.svg' },
    { name: 'e2e Blessed', img: 'icons/svg/upgrade.svg' },
];

interface ProbeActor {
    sheet: { id: string; render: (o: { force: boolean }) => Promise<void>; changeTab: (tab: string, group: string) => void };
    createEmbeddedDocuments: (type: string, data: object[]) => Promise<object[]>;
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Actor: { create: (data: object) => Promise<ProbeActor | null> };
    game: { actors: { getName: (n: string) => ProbeActor | undefined } };
}

test.describe.serial('Combat-tab Active Effects chips (Tier B, #494)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(async (name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            await (globalThis as unknown as ProbeWindow).game.actors.getName(name)?.delete();
        }, NAME);
    });

    test('each chip shows its effect name and icon, on Combat and Overview', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await page.evaluate(
            async ({ name, effects }) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const w = globalThis as unknown as ProbeWindow;
                await w.game.actors.getName(name)?.delete();
                const actor = await w.Actor.create({ name, type: 'dh2-character', system: { gameSystem: 'dh2' } });
                if (actor === null) throw new Error('Actor.create returned null');
                await actor.createEmbeddedDocuments('ActiveEffect', effects);
                await actor.sheet.render({ force: true });
                actor.sheet.changeTab('combat', 'primary');
                return actor.sheet.id;
            },
            { name: NAME, effects: EFFECTS },
        );

        for (const tab of ['combat', 'overview']) {
            if (tab === 'overview') {
                await page.evaluate((name) => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                    (globalThis as unknown as ProbeWindow).game.actors.getName(name)?.sheet.changeTab('overview', 'primary');
                }, NAME);
            }
            const scope = page.locator(`#${sheetId} section.tab[data-tab="${tab}"]`);
            for (const effect of EFFECTS) {
                const chip = scope.locator('div[data-effect-id]', { hasText: effect.name });
                await expect(chip).toBeVisible();
                await expect(chip.locator('img')).toHaveAttribute('src', effect.img);
                // The icon actually loaded (a missing src paints nothing).
                await expect.poll(async () => chip.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
            }
            await clearScreenOverlays(page, sheetId);
            await snap(page, `effect-chips-${tab}-tab`, { selector: `#${sheetId} section.tab[data-tab="${tab}"] div:has(> div[data-effect-id])` });
        }
        recordCoverage('panel.render', 'OverviewActiveEffectsPanel.combat');
    });
});
