import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { packHoldingId } from './lib/pack-lookup';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B (#697): a psychic power's Attack Specials list takes a weapon quality
 * dragged from the compendium. The quality becomes a nested attack special, the
 * list shows it, its remove control deletes it, and while it is there it reaches
 * the psychic roll: Defensive puts its -10 on the power's attack.
 *
 * The drag is the compendium's own: a dragstart on the pack entry fills the
 * DataTransfer, and that DataTransfer is dropped on the power's sheet.
 */

const POWER = 'e2e-697 smite';
const QUALITY_ID = 'AcAYn4jBRGuVzHyg';
const PACK = `wh40k-rpg.${packHoldingId({ line: 'dh2', category: 'weapon-qualities' }, QUALITY_ID)}`;
const QUALITY = 'Defensive';

interface ProbeApp {
    id: string;
    render: (o: { force: boolean }) => Promise<void>;
    close: () => Promise<void>;
}
interface ProbePack {
    render: (o: { force: boolean }) => Promise<void>;
    apps: ProbeApp[];
}
interface ProbeItem {
    sheet: ProbeApp;
    items: { contents: Array<{ name: string; type: string }> };
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Item: { create: (data: object) => Promise<ProbeItem | null> };
    game: {
        items: { getName: (name: string) => ProbeItem | undefined };
        packs: { get: (id: string) => ProbePack | undefined };
    };
}

/** The power's nested items, as `type:name`. */
async function nested(page: Page): Promise<string[]> {
    return page.evaluate((name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        return w.game.items.getName(name)?.items.contents.map((i) => `${i.type}:${i.name}`) ?? [];
    }, POWER);
}

/** The attack modifiers the power's attack specials put on a psychic roll. */
async function rollSpecialModifiers(page: Page): Promise<{ specials: string[]; modifiers: Record<string, number> }> {
    return page.evaluate(async (name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        interface RollDataProbe {
            power: ProbeItem | undefined;
            attackSpecials: Array<{ name: string }>;
            specialModifiers: Record<string, number>;
        }
        const rollDataUrl = '/systems/wh40k-rpg/module/rolls/roll-data.js';
        const specialsUrl = '/systems/wh40k-rpg/module/rules/attack-specials.js';
        const { PsychicRollData } = (await import(/* @vite-ignore */ rollDataUrl)) as { PsychicRollData: new () => RollDataProbe };
        const rules = (await import(/* @vite-ignore */ specialsUrl)) as {
            updateAttackSpecials: (rd: RollDataProbe) => void;
            calculateAttackSpecialAttackBonuses: (rd: RollDataProbe) => void;
        };
        const rd = new PsychicRollData();
        rd.power = w.game.items.getName(name);
        rules.updateAttackSpecials(rd);
        rules.calculateAttackSpecialAttackBonuses(rd);
        return { specials: rd.attackSpecials.map((s) => s.name), modifiers: { ...rd.specialModifiers } };
    }, POWER);
}

/** Create the probe power and open its sheet on the Damage tab, where the Attack Specials list lives. Returns the sheet id. */
async function openPowerSheet(page: Page): Promise<string> {
    const sheetId = await page.evaluate(async (name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        const power = await w.Item.create({ name, type: 'psychicPower' });
        if (power === null) throw new Error('Item.create returned null');
        await power.sheet.render({ force: true });
        return power.sheet.id;
    }, POWER);
    await expect(page.locator(`#${sheetId}`)).toBeVisible();
    await clearScreenOverlays(page, sheetId);
    await page.locator(`#${sheetId} nav [data-tab="damage"]`).first().click();
    return sheetId;
}

/** Open the weapon-qualities compendium window and drag one entry from it onto the power sheet's Attack Specials. */
async function dragQualityFromPack(page: Page, entryId: string, sheetId: string): Promise<void> {
    const packAppId = await page.evaluate(async (packId) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        const pack = w.game.packs.get(packId);
        if (pack === undefined) throw new Error(`pack ${packId} is not loaded`);
        await pack.render({ force: true });
        return pack.apps[0]?.id ?? '';
    }, PACK);
    await expect(page.locator(`#${packAppId} [data-entry-id="${entryId}"]`)).toBeVisible();
    // The compendium's own dragstart fills the DataTransfer that is then dropped on the sheet.
    await page.evaluate(
        ({ packApp, entry, sheetApp }) => {
            const source = document.querySelector(`#${packApp} [data-entry-id="${entry}"]`);
            const target = document.querySelector(`#${sheetApp} [data-item-section="WH40K.ItemSheet.PsychicPower.AttackSpecials"]`);
            if (source === null || target === null) throw new Error('drag source or drop target missing');
            const transfer = new DataTransfer();
            source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: transfer, bubbles: true, cancelable: true }));
            target.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
        },
        { packApp: packAppId, entry: entryId, sheetApp: sheetId },
    );
}

/** Abundant: a DH2 weapon quality with no attack special a power can carry. */
const UNMAPPED_QUALITY_ID = '9fVL9IQvPHakQEKZ';

test.describe.serial('psychic power attack specials (Tier B, #697)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(
            async ({ name, packId }) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const w = globalThis as unknown as ProbeWindow;
                const power = w.game.items.getName(name);
                await power?.sheet.close();
                await power?.delete();
                for (const app of w.game.packs.get(packId)?.apps ?? []) await app.close();
            },
            { name: POWER, packId: PACK },
        );
    });

    test('a weapon quality dragged from the compendium becomes an attack special, reaches the roll, and is removed', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await openPowerSheet(page);
        const specials = page.locator(`#${sheetId} [data-item-section="WH40K.ItemSheet.PsychicPower.AttackSpecials"]`);
        await expect(specials).toContainText('No attack specials');
        expect((await rollSpecialModifiers(page)).modifiers).not.toHaveProperty(QUALITY);

        // Drag the Defensive quality out of the compendium window onto the power's sheet.
        await dragQualityFromPack(page, QUALITY_ID, sheetId);
        const ids = { sheet: sheetId };

        await expect.poll(async () => nested(page)).toEqual([`attackSpecial:${QUALITY}`]);
        const row = specials.locator('[data-nested-item-id]').filter({ hasText: QUALITY });
        await expect(row).toBeVisible();
        await expect(specials).not.toContainText('No attack specials');
        const withSpecial = await rollSpecialModifiers(page);
        expect(withSpecial.specials).toContain(QUALITY);
        expect(withSpecial.modifiers[QUALITY]).toBe(-10);
        // Frame the sheet alone: the compendium window has done its job.
        await clearScreenOverlays(page, ids.sheet);
        await snap(page, 'psychic-power-attack-special-dropped', { selector: `#${ids.sheet}` });

        // Remove it with its control, after the confirmation.
        await row.locator('[data-action="nestedItemDelete"]').click();
        const confirm = page.locator('.confirmation-dialog').last();
        await expect(confirm).toBeVisible();
        await confirm.locator('[data-action="confirm"]').click();
        await expect(confirm).toBeHidden();
        await expect.poll(async () => nested(page)).toEqual([]);
        await expect(specials).toContainText('No attack specials');
        expect((await rollSpecialModifiers(page)).modifiers).not.toHaveProperty(QUALITY);
        await snap(page, 'psychic-power-attack-special-removed', { selector: `#${ids.sheet}` });

        recordCoverage('sheet.drop', 'psychicPower.attack-special');
    });

    test('a weapon quality with no attack special is refused with a notice', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await openPowerSheet(page);
        await dragQualityFromPack(page, UNMAPPED_QUALITY_ID, sheetId);
        await expect(page.locator('#notifications .notification', { hasText: 'Abundant has no attack special a psychic power can use.' })).toBeVisible();
        expect(await nested(page)).toEqual([]);
        await expect(page.locator(`#${sheetId} [data-item-section="WH40K.ItemSheet.PsychicPower.AttackSpecials"]`)).toContainText('No attack specials');
        recordCoverage('sheet.drop', 'psychicPower.attack-special-refused');
    });
});
