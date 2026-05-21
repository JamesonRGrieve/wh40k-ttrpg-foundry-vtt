import { GAME_SYSTEM_IDS, joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

test.describe('actor flows (Tier B)', () => {
    for (const gameSystem of GAME_SYSTEM_IDS) {
        test(`creates a character actor in gameSystem='${gameSystem}'`, async ({ page }) => {
            const joined = await joinAsGM(page);
            test.skip(!joined, 'no Gamemaster option appeared in the join select within 30s');
            const id = await page.evaluate(async (sys: string) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `Actor` global is injected by the licensed app; no shipped types
                const ActorCls = (globalThis as unknown as { Actor?: { create?: (data: object) => Promise<{ id?: string } | null> } }).Actor;
                if (!ActorCls?.create) return null;
                const actor = await ActorCls.create({
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
