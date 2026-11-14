import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * A fitted modification changes the weapon's clip (Tier B, #740).
 *
 * A playtester wanted a bigger Hellgun Capacitor. A modification's clip change
 * used to be neither editable nor applied: fitting cached only damage,
 * penetration, to-hit, range and weight. This fits a world modification with
 * +10 clip to a 20-round weapon. The weapon's clip max is then 30, on its data
 * and on its sheet, and the sheet lists the effect. Raising the modification
 * to +15 after fitting reaches the weapon, because a loaded modification is
 * read live.
 */

const PREFIX = 'e2e-740';

interface ProbeItem {
    id: string;
    uuid: string;
    system: { effectiveClipMax: number; modifications: Array<{ cachedModifiers: { clip: number } }> };
    sheet: { id: string; render: (options: { force: boolean }) => Promise<object>; close: () => Promise<object> };
    update: (data: object) => Promise<object>;
    prepareData: () => void;
    delete: () => Promise<object>;
}

interface ProbeGlobal {
    Item: { create: (data: object) => Promise<ProbeItem | null> };
    game: { items: { get: (id: string) => ProbeItem | undefined; filter: (fn: (item: { name: string }) => boolean) => ProbeItem[] } };
}

test.describe.serial('a modification changes the clip (Tier B, #740)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(async (prefix) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const g = globalThis as unknown as ProbeGlobal;
            for (const item of g.game.items.filter((i) => i.name.startsWith(prefix))) {
                await item.sheet.close();
                await item.delete();
            }
        }, PREFIX);
    });

    test('a fitted +10 clip modification gives a 20-round weapon 30, and an edit after fitting applies', async ({ page }) => {
        await joinOrSkip(page);
        const ids = await page.evaluate(async (prefix) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const g = globalThis as unknown as ProbeGlobal;
            const capacitor = await g.Item.create({
                name: `${prefix} Capacitor`,
                type: 'weaponModification',
                system: { category: 'magazine', modifiers: { clip: 10 } },
            });
            const weapon = await g.Item.create({
                name: `${prefix} Hellpistol`,
                type: 'weapon',
                system: { class: 'pistol', clip: { max: 20, value: 20 }, attack: { range: { value: 35 } } },
            });
            if (capacitor === null || weapon === null) throw new Error('create failed');
            // The entry the weapon sheet's fitting writes (rules/weapon-modification.ts modificationEntry).
            await weapon.update({
                'system.modifications': [
                    {
                        uuid: capacitor.uuid,
                        name: `${prefix} Capacitor`,
                        active: true,
                        category: 'magazine',
                        cachedModifiers: {
                            damage: 0,
                            penetration: 0,
                            toHit: 0,
                            range: 0,
                            weight: 0,
                            clip: 10,
                            rangeMultiplier: 1,
                            rateOfFire: { single: 0, semi: 0, full: 0 },
                        },
                    },
                ],
            });
            return { capacitorId: capacitor.id, weaponId: weapon.id };
        }, PREFIX);

        const clipMax = async (): Promise<number> =>
            page.evaluate((id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const weapon = (globalThis as unknown as ProbeGlobal).game.items.get(id);
                weapon?.prepareData();
                return weapon?.system.effectiveClipMax ?? -1;
            }, ids.weaponId);
        expect(await clipMax(), 'the fitted +10 clip raises 20 to 30').toBe(30);

        const sheetId = await page.evaluate(async (id) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const weapon = (globalThis as unknown as ProbeGlobal).game.items.get(id);
            await weapon?.sheet.render({ force: true });
            return weapon?.sheet.id ?? '';
        }, ids.weaponId);
        const sheet = page.locator(`#${sheetId}`);
        await expect(sheet).toContainText('20/30');
        await expect(sheet).toContainText('Clip +10');
        await clearScreenOverlays(page, sheetId);
        await snap(page, 'weapon-modification-clip-fitted', { selector: `#${sheetId}` });

        await page.evaluate(async (id) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            await (globalThis as unknown as ProbeGlobal).game.items.get(id)?.update({ 'system.modifiers.clip': 15 });
        }, ids.capacitorId);
        expect(await clipMax(), 'the edit to +15 after fitting reaches the weapon').toBe(35);
        recordCoverage('weapon-modification.flow', 'modification-clip');
    });
});
