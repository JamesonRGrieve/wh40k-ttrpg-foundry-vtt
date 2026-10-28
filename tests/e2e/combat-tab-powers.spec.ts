import type { Page } from '@playwright/test';
import { showChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Combat tab's power panels (#194) on real Foundry.
 *
 * The character sheet's Powers tab was never reachable, so its panels moved to
 * the Combat tab: the psyker controls (Psychic Phenomena / Perils of the Warp)
 * in the psychic panel, and the rituals and ship-orders panels, each shown only
 * when the character owns items of that type. (Navigator powers are driven from
 * the same tab by navigator-powers.spec.ts.)
 */

const ACTOR_NAME = 'e2e-combat-tab-powers';

interface ProbeActor {
    sheet: { id: string; render: (opts: { force: boolean }) => Promise<void> };
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Actor: { create: (data: object) => Promise<ProbeActor | null> };
    game: { actors: { getName: (name: string) => ProbeActor | undefined }; messages: { contents: Array<{ id: string; rolls: object[] }> } };
    ui: { sidebar?: { changeTab?: (tab: string, group: string) => void; expand?: () => void } };
}

/** Create the character and open its sheet on the Combat tab; returns the sheet's app id. */
async function openCombatTab(page: Page, system: object, items: object[] = []): Promise<string> {
    const sheetId = await page.evaluate(
        async ({ name, sys, owned }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            await w.game.actors.getName(name)?.delete();
            const actor = await w.Actor.create({ name, type: 'dh2-character', system: { gameSystem: 'dh2', ...sys }, items: owned });
            if (actor === null) throw new Error('Actor.create returned null');
            return actor.sheet.id;
        },
        { name: ACTOR_NAME, sys: system, owned: items },
    );
    await showCombatTab(page);
    return sheetId;
}

/** Open the character's sheet and switch it to the Combat tab. */
async function showCombatTab(page: Page): Promise<void> {
    const sheetId = await page.evaluate(async (name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const actor = (globalThis as unknown as ProbeWindow).game.actors.getName(name);
        if (actor === undefined) throw new Error('probe character missing');
        await actor.sheet.render({ force: true });
        return actor.sheet.id;
    }, ACTOR_NAME);
    await page.locator(`#${sheetId} [data-action="tab"][data-tab="combat"]`).first().click();
    await expect(page.locator(`#${sheetId} section.tab[data-tab="combat"]`)).toHaveClass(/active/);
}

async function messageCount(page: Page): Promise<number> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
    return page.evaluate(() => (globalThis as unknown as ProbeWindow).game.messages.contents.length);
}

/** Click a psyker control on the Combat tab, then snap the chat message it posts (the sheet closes so nothing covers the card). */
async function rollAndSnap(page: Page, action: string, label: string): Promise<void> {
    await showCombatTab(page);
    const before = await messageCount(page);
    await page.locator(`.wh40k-combat-psyker-controls [data-action="${action}"]`).click();
    await expect.poll(async () => messageCount(page)).toBeGreaterThan(before);
    const id = await page.evaluate(() => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        return (globalThis as unknown as ProbeWindow).game.messages.contents.at(-1)?.id ?? '';
    });
    await clearScreenOverlays(page);
    const selector = await showChatMessage(page, id);
    await expect(page.locator(`#sidebar li.chat-message[data-message-id="${id}"]`)).toBeVisible();
    const shot = await snap(page, label, { selector });
    expect(shot, `snap ${label}`).not.toBeNull();
}

test.describe.serial('Combat tab power panels (Tier B, #194)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(async (name) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            await (globalThis as unknown as ProbeWindow).game.actors.getName(name)?.delete();
        }, ACTOR_NAME);
    });

    test('a psyker rolls Psychic Phenomena and Perils of the Warp from the Combat tab', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await openCombatTab(page, { psy: { rating: 3 } });
        const controls = page.locator(`#${sheetId} .wh40k-combat-psyker-controls`);
        await expect(controls).toBeVisible();
        await expect(controls.locator('[data-action="rollPhenomena"]')).toBeVisible();
        await expect(controls.locator('[data-action="rollPerils"]')).toBeVisible();
        await clearScreenOverlays(page, sheetId);
        await snap(page, 'combat-tab-psyker-controls', { selector: `#${sheetId} .wh40k-combat-psyker-controls` });

        await rollAndSnap(page, 'rollPhenomena', 'combat-tab-phenomena-card');
        await rollAndSnap(page, 'rollPerils', 'combat-tab-perils-card');
        recordCoverage('action', 'CharacterSheet.rollPhenomena+rollPerils');
    });

    test('hovering a psychic power row reveals its invoke button, which opens the roll', async ({ page }) => {
        await joinOrSkip(page);
        // Willpower 40, so the power's Willpower focus test has a real target (it read 0% on a blank actor).
        const sheetId = await openCombatTab(page, { psy: { rating: 3 }, characteristics: { willpower: { base: 40 } } }, [
            { name: 'e2e Fixture Power', type: 'psychicPower' },
        ]);
        const row = page.locator(`#${sheetId} [data-item-type="psychicPower"]`).first();
        const invoke = row.locator('button[data-action="rollPower"]');
        const opacity = async (): Promise<string> => invoke.evaluate((el) => getComputedStyle(el).opacity);
        // Hidden until the row is hovered: the group-hover variant must actually apply.
        await expect.poll(opacity).toBe('0');
        await row.hover();
        await expect.poll(opacity).toBe('1');
        // #412: the hover buttons sit in their own column; neither covers the PR cost, which stays visible.
        const layout = await row.evaluate((el) => {
            const pr = el.querySelector<HTMLElement>('[data-wh40k-hook="psychic-power-pr"]');
            const rect = pr?.getBoundingClientRect() ?? null;
            const covered = [...el.querySelectorAll<HTMLElement>('button')].filter((button) => {
                const b = button.getBoundingClientRect();
                return rect !== null && b.left < rect.right && b.right > rect.left && b.top < rect.bottom && b.bottom > rect.top;
            });
            return { prText: pr?.textContent.trim() ?? '', prWidth: rect?.width ?? 0, covering: covered.map((button) => button.dataset['action'] ?? '') };
        });
        expect(layout.covering, 'buttons over the PR cost').toEqual([]);
        expect(layout.prText).not.toBe('');
        expect(layout.prWidth).toBeGreaterThan(0);
        await clearScreenOverlays(page, sheetId);
        await row.hover();
        // keepTooltip leaves the pointer on the row: snap() otherwise moves it to (0, 0) (0b2561d57), which
        // un-hovers the row, so the capture lost the hover it exists to show and the hidden button took no click.
        await snap(page, 'combat-tab-psychic-row-hover', { selector: `#${sheetId} [data-item-type="psychicPower"]`, keepTooltip: true });

        // The row is still hovered after the capture, so its revealed invoke button takes the click.
        await expect.poll(opacity).toBe('1');
        await invoke.click();
        const dialog = page.locator('.unified-roll-dialog');
        await expect(dialog).toBeVisible();
        const dialogId = (await dialog.getAttribute('id')) ?? '';
        // The roll starts from the psyker's Willpower, not an empty 0%.
        await expect(dialog.locator('[data-wh40k-hook="target-base"]')).toContainText('40');
        const target = Number((await dialog.locator('.urd-target__number').getAttribute('data-value')) ?? '0');
        expect(target, 'the invoke dialog target').toBeGreaterThanOrEqual(40);
        await clearScreenOverlays(page, dialogId);
        await snap(page, 'combat-tab-psychic-invoke-dialog', { selector: `#${dialogId}` });
        await page.evaluate(async (id) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `foundry.applications.instances` has no browser-side types
            const apps = (globalThis as unknown as { foundry: { applications: { instances: Map<string, { close: () => Promise<void> }> } } }).foundry
                .applications.instances;
            await apps.get(id)?.close();
        }, dialogId);
        recordCoverage('action', 'CombatPsychicPanel.invokeOnHover');
    });

    test('owned rituals and ship orders show their panels on the Combat tab', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await openCombatTab(page, {}, [
            {
                name: 'e2e Fixture Rite',
                type: 'ritual',
                system: { test: { characteristic: 'willpower', skill: 'forbiddenLore', modifier: -10, threshold: 0 } },
            },
            { name: 'e2e Fixture Order', type: 'order', system: { test: { skill: 'command', modifier: 10 } } },
        ]);
        const panels = page.locator(`#${sheetId} .wh40k-combat-power-panels`);
        // Match the panel roots by id: each panel's drop zone repeats the root class.
        await expect(panels.locator('div[data-panel-id="rituals"]')).toContainText('e2e Fixture Rite');
        await expect(panels.locator('div[data-panel-id="orders"]')).toContainText('e2e Fixture Order');
        // #648: each test names the skill's label, not its key ("TEST command").
        await expect(panels.locator('div[data-panel-id="orders"]')).toContainText('Command +10');
        await expect(panels.locator('div[data-panel-id="orders"]')).not.toContainText('command');
        await expect(panels.locator('div[data-panel-id="rituals"]')).toContainText('Forbidden Lore -10');
        await expect(panels.locator('div[data-panel-id="rituals"]')).not.toContainText('forbiddenLore');
        await expect(panels.locator('div[data-panel-id="navigator-powers"]')).toHaveCount(0);
        await expect(panels.locator('[data-action="rollRitual"]')).toBeVisible();
        await expect(panels.locator('[data-action="rollOrder"]')).toBeVisible();
        await clearScreenOverlays(page, sheetId);
        await snap(page, 'combat-tab-rituals-orders', { selector: `#${sheetId} .wh40k-combat-power-panels` });

        // Perform Ritual rolls the ritual (it used to post only the ritual's text).
        const before = await messageCount(page);
        await panels.locator('[data-action="rollRitual"]').click();
        await expect.poll(async () => messageCount(page)).toBeGreaterThan(before);
        const posted = await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const message = (globalThis as unknown as ProbeWindow).game.messages.contents.at(-1);
            return { id: message?.id ?? '', rolls: message?.rolls.length ?? 0 };
        });
        expect(posted.rolls, 'the ritual card carries its d100 roll').toBeGreaterThan(0);
        await clearScreenOverlays(page);
        await snap(page, 'combat-tab-ritual-roll-card', { selector: await showChatMessage(page, posted.id) });
        recordCoverage('panel.render', 'CombatTab.rituals+orders');
    });

    test('a character owning none of them gets no power panels and no psyker controls', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await openCombatTab(page, {});
        await expect(page.locator(`#${sheetId} .wh40k-combat-power-panels`)).toHaveCount(0);
        await expect(page.locator(`#${sheetId} .wh40k-combat-psyker-controls`)).toHaveCount(0);
        await clearScreenOverlays(page, sheetId);
        await snap(page, 'combat-tab-no-powers', { selector: `#${sheetId}` });
        recordCoverage('panel.render', 'CombatTab.noPowers');
    });

    test('the Reactions row is Dodge and Parry only, however many items the character owns (#245)', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await openCombatTab(page, {}, [
            { name: 'Lasgun', type: 'weapon' },
            { name: 'Flak Armour', type: 'armour' },
        ]);
        const reactions = page.locator(`#${sheetId} [data-action="dodge"]`).locator('xpath=..');
        await expect(reactions.locator('button')).toHaveCount(2);
        expect(await reactions.locator('button').evaluateAll((buttons) => buttons.map((b) => (b as HTMLElement).dataset['action'] ?? ''))).toEqual([
            'dodge',
            'parry',
        ]);
        await clearScreenOverlays(page, sheetId);
        const panel = reactions.locator('xpath=ancestor::div[contains(@class, "wh40k-panel")][1]');
        await panel.evaluate((el) => {
            el.id = 'e2e-combat-actions-panel';
        });
        await snap(page, 'combat-tab-reactions-dodge-parry', { selector: '#e2e-combat-actions-panel' });
        recordCoverage('panel.render', 'CombatTab.reactions');
    });
});
