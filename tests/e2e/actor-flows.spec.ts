import { GAME_SYSTEM_IDS, joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

test.describe('actor flows (Tier B)', () => {
    for (const gameSystem of GAME_SYSTEM_IDS) {
        test(`creates a character actor in gameSystem='${gameSystem}'`, async ({ page }) => {
            const joined = await joinAsGM(page);
            test.skip(!joined, 'no Gamemaster option appeared in the join select within 30s');
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

