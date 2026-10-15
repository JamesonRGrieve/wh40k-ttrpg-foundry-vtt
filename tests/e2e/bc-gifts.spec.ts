import type { Page } from '@playwright/test';
import { emptyContentSections, shownContentSections } from './content-sections';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Black Crusade Gifts of the Gods (#180, #597) on real
 * Foundry, driven the way a GM and player use them:
 *
 *   1. A Khorne Heretic's sheet lists the Gifts with the Khorne rider applied and
 *      the merged characteristic footer; the same Gifts read for Tzeentch once the
 *      alignment changes.
 *   2. The pending acquisition roll's button rolls the dice, posts the roll to
 *      chat and stores the signed result on the Gift, which then folds into the
 *      characteristic total.
 *   3. The Gift's own sheet (opened from the panel) edits a rider's
 *      characteristic change, and the actor's panel follows.
 *
 * The Gifts are structural fixtures built in the spec, not catalogue content.
 */

const ACTOR_NAME = 'e2e-bc-gifts-heretic';
const PANEL = 'section.wh40k-bc-gifts-panel';
const FREEFORM_SETTING = 'freeform-characters';

/** A Gift whose Khorne and Tzeentch riders change different characteristics, on the Limb sub-table. */
const MIEN_GIFT = {
    name: 'Fixture Gift — Crimson Mien',
    type: 'mutation',
    system: {
        category: 'gift',
        effect: '<p>The bearer’s features twist into something feral.</p>',
        modifiers: { characteristics: { strength: 3 } },
        gift: {
            grants: [],
            subTable: 'limb',
            characteristicRolls: [],
            riders: [
                { alignment: 'khorne', description: '<p>Rage made flesh.</p>', characteristics: { strength: 5 }, skills: {}, grants: [], activeEffect: '' },
                {
                    alignment: 'tzeentch',
                    description: '<p>Ever-changing skin.</p>',
                    characteristics: { toughness: 2 },
                    skills: {},
                    grants: [],
                    activeEffect: '',
                },
            ],
        },
    },
};

/** A Gift that lowers Intelligence by a rolled 1d10+5 when gained. */
const WITLESS_GIFT = {
    name: 'Fixture Gift — Witless',
    type: 'mutation',
    system: {
        category: 'gift',
        effect: '<p>The mind dims.</p>',
        modifiers: { characteristics: {} },
        gift: { grants: [], subTable: '', riders: [], characteristicRolls: [{ characteristic: 'intelligence', formula: '1d10+5', direction: 'loss' }] },
    },
};

interface ProbeItem {
    id: string;
    name: string;
    system: { modifiers: { characteristics: Record<string, number> } };
    sheet: { id: string; render: (opts: { force: boolean }) => Promise<void>; close: () => Promise<void> };
}
interface ProbeActor {
    id: string;
    system: { characteristics: Partial<Record<string, { total: number }>> };
    items: { getName: (name: string) => ProbeItem | undefined; contents: ProbeItem[] };
    sheet: { id: string; render: (opts: { force: boolean }) => Promise<void>; close: () => Promise<void> };
    update: (data: object) => Promise<object>;
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Actor: { create: (data: object) => Promise<ProbeActor | null> };
    game: {
        actors: { getName: (name: string) => ProbeActor | undefined };
        messages: { contents: Array<{ id: string; flavor?: string }> };
        settings: { get: (ns: string, key: string) => boolean; set: (ns: string, key: string, value: boolean) => Promise<boolean> };
    };
    ui: { sidebar?: { changeTab?: (tab: string, group: string) => void; expand?: () => void } };
}

/** Create the Heretic with both Gifts and open its sheet; returns the sheet's app id. */
async function openHeretic(page: Page, alignment: string): Promise<string> {
    const sheetId = await page.evaluate(
        async ({ name, items, chaosAlignment }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals (Actor, game) have no repo types
            const w = globalThis as unknown as ProbeWindow;
            await w.game.actors.getName(name)?.delete();
            const actor = await w.Actor.create({
                name,
                type: 'bc-character',
                system: { gameSystem: 'bc', chaosAlignment, characteristics: { intelligence: { base: 40, advance: 0, modifier: 0 } } },
                items,
            });
            if (actor === null) throw new Error('Actor.create returned null');
            await actor.sheet.render({ force: true });
            return actor.sheet.id;
        },
        { name: ACTOR_NAME, items: [MIEN_GIFT, WITLESS_GIFT], chaosAlignment: alignment },
    );
    await expect(page.locator(`#${sheetId} ${PANEL}`)).toBeVisible();
    return sheetId;
}

async function actorState(page: Page): Promise<{ strength: number; toughness: number; intelligence: number; witlessRoll: number | null }> {
    return page.evaluate((name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        const actor = w.game.actors.getName(name);
        if (actor === undefined) throw new Error('probe actor missing');
        const chars = actor.system.characteristics;
        const witless = actor.items.getName('Fixture Gift — Witless')?.system.modifiers.characteristics['intelligence'];
        return {
            strength: chars['strength']?.total ?? NaN,
            toughness: chars['toughness']?.total ?? NaN,
            intelligence: chars['intelligence']?.total ?? NaN,
            witlessRoll: witless ?? null,
        };
    }, ACTOR_NAME);
}

/** The Crimson Mien Gift's stored `system`, as JSON. */
async function giftSystemJson(page: Page): Promise<string> {
    return page.evaluate((name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const item = (globalThis as unknown as ProbeWindow).game.actors.getName(name)?.items.getName('Fixture Gift — Crimson Mien');
        return item === undefined ? '' : JSON.stringify(item.system);
    }, ACTOR_NAME);
}

async function snapPanel(page: Page, sheetId: string, label: string): Promise<void> {
    await clearScreenOverlays(page, sheetId);
    const shot = await snap(page, label, { selector: `#${sheetId} ${PANEL}` });
    expect(shot, `snap ${label}`).not.toBeNull();
}

test.describe.serial('BC Gifts of the Gods (Tier B)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(
            async ({ name, setting }) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const w = globalThis as unknown as ProbeWindow;
                await w.game.actors.getName(name)?.delete();
                if (w.game.settings.get('wh40k-rpg', setting)) await w.game.settings.set('wh40k-rpg', setting, false);
            },
            { name: ACTOR_NAME, setting: FREEFORM_SETTING },
        );
    });

    test('the panel applies the rider of the current alignment and merges the changes', async ({ page }) => {
        await joinOrSkip(page);
        const baseline = await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            const bare = await w.Actor.create({ name: 'e2e-bc-gifts-baseline', type: 'bc-character', system: { gameSystem: 'bc' } });
            const chars = bare?.system.characteristics;
            const out = { strength: chars?.['strength']?.total ?? NaN, toughness: chars?.['toughness']?.total ?? NaN };
            await bare?.delete();
            return out;
        });

        const sheetId = await openHeretic(page, 'khorne');
        const panel = page.locator(`#${sheetId} ${PANEL}`);
        await expect(panel).toHaveAttribute('data-bc-current-alignment', 'khorne');
        const mien = panel.locator('[data-wh40k-hook="bc-gift-entry"]', { hasText: 'Crimson Mien' });
        await expect(mien).toHaveAttribute('data-applied-alignment', 'khorne');
        await expect(mien).toContainText('Rage made flesh.');
        await expect(mien.locator('[data-wh40k-hook="bc-gift-subtable"]')).toBeVisible();
        await expect(mien.locator('[data-wh40k-hook="bc-gift-delta"][data-delta-key="strength"]')).toHaveAttribute('data-delta-value', '8');
        await expect(panel.locator('[data-wh40k-hook="bc-gifts-merged-delta"][data-delta-key="strength"]')).toHaveAttribute('data-delta-value', '8');
        // The Khorne rider's +5 on top of the base +3 reaches the characteristic total.
        expect((await actorState(page)).strength).toBe(baseline.strength + 8);
        await snapPanel(page, sheetId, 'bc-gifts-panel-khorne');

        // Re-aligning to Tzeentch swaps the rider: Strength keeps only the base +3, Toughness gains +2.
        await page.evaluate(async (name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            await w.game.actors.getName(name)?.update({ 'system.chaosAlignment': 'tzeentch' });
        }, ACTOR_NAME);
        await expect(panel).toHaveAttribute('data-bc-current-alignment', 'tzeentch');
        await expect(mien).toHaveAttribute('data-applied-alignment', 'tzeentch');
        await expect(mien).toContainText('Ever-changing skin.');
        await expect(mien).not.toContainText('Rage made flesh.');
        await expect(panel.locator('[data-wh40k-hook="bc-gifts-merged-delta"][data-delta-key="toughness"]')).toHaveAttribute('data-delta-value', '2');
        const tzeentch = await actorState(page);
        expect(tzeentch.strength).toBe(baseline.strength + 3);
        expect(tzeentch.toughness).toBe(baseline.toughness + 2);
        await snapPanel(page, sheetId, 'bc-gifts-panel-tzeentch');

        recordCoverage('panel.render', 'BcGiftsPanel.alignmentRider');
    });

    test('the acquisition roll button rolls once, posts the roll and lowers the characteristic', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await openHeretic(page, 'khorne');
        const before = await actorState(page);
        expect(before.witlessRoll, 'no roll stored before the button is pressed').toBeNull();

        const button = page.locator(`#${sheetId} ${PANEL} [data-action="bcRollGiftCharacteristic"][data-characteristic="intelligence"]`);
        await expect(button).toContainText('1d10+5');
        await snapPanel(page, sheetId, 'bc-gifts-pending-roll');

        const messagesBefore = await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            return (globalThis as unknown as ProbeWindow).game.messages.contents.length;
        });
        await button.click();
        await expect.poll(async () => (await actorState(page)).witlessRoll).not.toBeNull();
        const after = await actorState(page);
        const rolled = after.witlessRoll ?? 0;
        // 1d10+5 as a loss: −6 to −15.
        expect(rolled).toBeLessThanOrEqual(-6);
        expect(rolled).toBeGreaterThanOrEqual(-15);
        expect(after.intelligence).toBe(before.intelligence + rolled);
        // The roll is made once: the button is gone and the result shows as a delta chip.
        await expect(button).toHaveCount(0);
        await expect(
            page.locator(`#${sheetId} ${PANEL} [data-wh40k-hook="bc-gift-entry"]`, { hasText: 'Witless' }).locator('[data-delta-key="intelligence"]'),
        ).toHaveAttribute('data-delta-value', String(rolled));
        await snapPanel(page, sheetId, 'bc-gifts-roll-resolved');

        const message = await page.evaluate((count) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            w.ui.sidebar?.expand?.();
            w.ui.sidebar?.changeTab?.('chat', 'primary');
            const posted = w.game.messages.contents.slice(count);
            return posted.length === 1 ? { id: posted[0]?.id ?? '', flavor: posted[0]?.flavor ?? '' } : null;
        }, messagesBefore);
        expect(message, 'exactly one roll message is posted').not.toBeNull();
        expect(message?.flavor).toContain('Witless');
        const card = page.locator(`#sidebar li.chat-message[data-message-id="${message?.id ?? ''}"]`);
        await expect(card).toBeVisible();
        await clearScreenOverlays(page);
        await snap(page, 'bc-gifts-roll-chat', { selector: `#sidebar li.chat-message[data-message-id="${message?.id ?? ''}"]` });

        recordCoverage('action', 'bcRollGiftCharacteristic');
    });

    test('editing a rider on the Gift sheet updates the Heretic’s panel (#597)', async ({ page }) => {
        await joinOrSkip(page);
        // The mutation sheet is freeform-gated: a GM turns freeform editing on to edit a world Gift.
        await page.evaluate(async (setting) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            await (globalThis as unknown as ProbeWindow).game.settings.set('wh40k-rpg', setting, true);
        }, FREEFORM_SETTING);
        const sheetId = await openHeretic(page, 'khorne');
        const baseStrength = (await actorState(page)).strength;

        // Open the Gift from its panel entry.
        await page.locator(`#${sheetId} ${PANEL} [data-action="itemEdit"]`, { hasText: 'Crimson Mien' }).click();
        const itemSheetId = await page.evaluate((name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            return (globalThis as unknown as ProbeWindow).game.actors.getName(name)?.items.getName('Fixture Gift — Crimson Mien')?.sheet.id ?? '';
        }, ACTOR_NAME);
        const itemSheet = page.locator(`#${itemSheetId}`);
        await expect(itemSheet.locator('[data-gift-panel]')).toBeVisible();
        await expect(itemSheet.locator('[data-gift-rider]')).toHaveCount(2);
        // #597: read-only, no section heading sits over nothing (the fixture has no Description or Drawback).
        expect(await emptyContentSections(page, itemSheetId)).toEqual([]);
        const shown = await shownContentSections(page, itemSheetId);
        expect(shown).not.toContain('WH40K.Item.Tabs.Description');
        expect(shown).not.toContain('WH40K.Mutation.Drawback');
        // snap() alone: closing the other windows would close the Heretic's sheet, checked below.
        await snap(page, 'bc-gifts-mutation-sheet-read-only', { selector: `#${itemSheetId}` });

        await itemSheet.locator('[data-action="toggleEditMode"]').click();
        const khorneStrength = itemSheet.locator('[name="system.gift.riders.0.characteristics.strength"]');
        await expect(khorneStrength).toHaveValue('5');
        await khorneStrength.fill('10');
        await khorneStrength.dispatchEvent('change');

        // The edit is saved on the Gift (#612: the sheet's form used to drop it), and it is still a Gift.
        await expect.poll(async () => giftSystemJson(page)).toContain('"strength":10');
        const saved = await giftSystemJson(page);
        expect(saved, saved).toContain('"category":"gift"');

        // Base +3 and the edited Khorne +10: the panel and the characteristic follow.
        await expect(page.locator(`#${sheetId} ${PANEL} [data-wh40k-hook="bc-gifts-merged-delta"][data-delta-key="strength"]`)).toHaveAttribute(
            'data-delta-value',
            '13',
        );
        await expect.poll(async () => (await actorState(page)).strength).toBe(baseStrength + 5);
        await expect(khorneStrength).toHaveValue('10');
        await snap(page, 'bc-gifts-mutation-sheet-edited', { selector: `#${itemSheetId}` });

        await page.evaluate((name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            void (globalThis as unknown as ProbeWindow).game.actors.getName(name)?.items.getName('Fixture Gift — Crimson Mien')?.sheet.close();
        }, ACTOR_NAME);
        await snapPanel(page, sheetId, 'bc-gifts-panel-after-edit');

        recordCoverage('sheet.edit', 'MutationSheet.giftRider');
    });
});
