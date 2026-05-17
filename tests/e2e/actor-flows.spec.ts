import { expect, test } from '@playwright/test';

const GAME_SYSTEMS = ['bc', 'dh1e', 'dh2e', 'dw', 'ow', 'rt', 'im'] as const;

test.describe('actor flows (Tier B)', () => {
    for (const gameSystem of GAME_SYSTEMS) {
        test(`creates a character actor in gameSystem='${gameSystem}'`, async ({ page }) => {
            const joined = await joinAsGM(page);
            test.skip(!joined, 'seed world has no Gamemaster user yet — populate tests/e2e/fixtures/seed-world/data/users.db to enable');
            const id = await page.evaluate(async (sys: string) => {
                const Actor = (
                    globalThis as unknown as {
                        Actor?: { create?: (data: object) => Promise<{ id?: string } | null> };
                    }
                ).Actor;
                if (!Actor?.create) return null;
                const actor = await Actor.create({
                    name: `${sys} Test`,
                    type: 'character',
                    system: { gameSystem: sys },
                });
                return actor?.id ?? null;
            }, gameSystem);
            expect(id).not.toBeNull();
        });
    }
});

async function joinAsGM(page: import('@playwright/test').Page): Promise<boolean> {
    await page.goto('/join');
    const select = page.locator('select[name="userid"]');
    // Seed world ships without a Users database, so the join dropdown is
    // initially empty. Until tests/e2e/fixtures/seed-world/data/users.db is
    // populated with a default Gamemaster user, skip the assertion rather
    // than waste 30s waiting for /game.
    if (!(await select.count())) return false;
    const optionCount = await select.locator('option:not([value=""])').count();
    if (optionCount === 0) return false;
    await select.selectOption({ label: /Gamemaster/i });
    await page.click('button[name="join"]');
    await page.waitForURL(/\/game/);
    return true;
}
