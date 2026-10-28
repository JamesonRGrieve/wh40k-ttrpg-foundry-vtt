import type { Page } from '@playwright/test';
import { showChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of Navigator powers rolled by the RAW engine (dd17cf9c6, RT
 * core §"Using Navigator Powers") on real Foundry:
 *
 *   1. The power's sheet sets the Navigator's mastery (Novice / Adept / Master).
 *   2. The Use Power button on the sheet's Combat tab (#194) rolls the power's own
 *      characteristic + the mastery bonus + the power's difficulty; the card prints
 *      each component with its source, for a success and for a failure.
 *   3. An opposed power against one targeted token rolls both sides and prints the
 *      opposed breakdown.
 *
 * Targets are set at the extremes (0 and 100) so each outcome does not depend on
 * the d100, except a natural 100 on the success roll, which is re-rolled.
 */

const ACTOR_NAME = 'e2e-navigator';
const OPPONENT_NAME = 'e2e-navigator-opponent';
const SCENE_NAME = 'e2e-navigator-scene';
const POWER_NAME = 'e2e Fixture Power';
const CARD = '.wh40k-navpwr-card';
/** The panel root (its drop zone repeats the panel's root class, so match the panel id). */
const PANEL = 'div[data-panel-id="navigator-powers"]';

interface ProbeItem {
    id: string;
    system: { mastery: string };
    sheet: { id: string; render: (opts: { force: boolean }) => Promise<void>; close: () => Promise<void> };
}
interface ProbeActor {
    id: string;
    items: { getName: (name: string) => ProbeItem | undefined };
    sheet: { id: string; render: (opts: { force: boolean }) => Promise<void> };
    getTokenDocument: (data: object) => Promise<{ toObject: () => object }>;
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Actor: { create: (data: object) => Promise<ProbeActor | null> };
    Scene: {
        create: (
            data: object,
        ) => Promise<{ view: () => Promise<void>; createEmbeddedDocuments: (t: string, d: object[]) => Promise<Array<{ id: string }>> } | null>;
    };
    game: {
        actors: { getName: (name: string) => ProbeActor | undefined };
        scenes: { getName: (name: string) => { delete: () => Promise<void> } | undefined };
        messages: { contents: Array<{ id: string; content: string }> };
        user: { targets: { size: number } };
        paused: boolean;
        togglePause: (state: boolean) => void;
    };
    canvas: { ready: boolean; tokens?: { placeables: Array<{ id: string; setTarget: (on: boolean, opts: object) => void }> } };
    ui: { sidebar?: { changeTab?: (tab: string, group: string) => void; expand?: () => void } };
}

/** Create the Navigator with one power; `perception` sets the tested characteristic, `power` overrides the power's test. */
async function createNavigator(page: Page, perception: number, testOverrides: object): Promise<void> {
    await page.evaluate(
        async ({ name, power, base, powerTest }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            await w.game.actors.getName(name)?.delete();
            await w.Actor.create({
                name,
                type: 'rt-character',
                system: { gameSystem: 'rt', characteristics: { perception: { base, advance: 0, modifier: 0 } } },
                items: [
                    {
                        name: power,
                        type: 'navigatorPower',
                        system: {
                            test: { characteristic: 'perception', modifier: 0, opposed: false, opposedCharacteristic: '', ...powerTest },
                            mastery: 'novice',
                            levels: {
                                novice: { effect: '<p>Novice effect.</p>' },
                                adept: { effect: '<p>Adept effect.</p>' },
                                master: { effect: '<p>Master effect.</p>' },
                            },
                        },
                    },
                ],
            });
        },
        { name: ACTOR_NAME, power: POWER_NAME, base: perception, powerTest: testOverrides },
    );
}

/** Open the Navigator's sheet on its Combat tab, where the Navigator powers panel lives (#194); returns the sheet's app id. */
async function openCombatTab(page: Page): Promise<string> {
    const sheetId = await page.evaluate(async (name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const actor = (globalThis as unknown as ProbeWindow).game.actors.getName(name);
        if (actor === undefined) throw new Error('navigator missing');
        await actor.sheet.render({ force: true });
        return actor.sheet.id;
    }, ACTOR_NAME);
    await page.locator(`#${sheetId} [data-action="tab"][data-tab="combat"]`).first().click();
    const where = await page.evaluate((id) => {
        const tab = document.querySelector(`#${id} section.tab[data-tab="combat"]`);
        return `combat tab active=${String(tab?.classList.contains('active'))} powerPanels=${String(
            tab?.querySelector('.wh40k-combat-power-panels') !== null,
        )} rows=${tab?.querySelectorAll('[data-item-type="navigatorPower"]').length ?? -1} actions=${[
            ...(tab?.querySelectorAll('[data-item-type="navigatorPower"] [data-action]') ?? []),
        ]
            .map((b) => b.getAttribute('data-action'))
            .join(',')}`;
    }, sheetId);
    await expect(page.locator(`#${sheetId} ${PANEL} [data-action="rollPower"]`), where).toBeVisible();
    return sheetId;
}

/** Press the power's Use Power button on the Combat tab and return the posted card's message id. */
async function usePower(page: Page, sheetId: string): Promise<string> {
    const before = await page.evaluate(() => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        return (globalThis as unknown as ProbeWindow).game.messages.contents.length;
    });
    await page.locator(`#${sheetId} ${PANEL} [data-action="rollPower"]`).click();
    const posted = await page.evaluate(async (count) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        const card = (): { id: string; content: string } | undefined =>
            w.game.messages.contents.slice(count).find((m) => m.content.includes('wh40k-navpwr-card'));
        await globalThis.wh40kE2E.pollUntil(() => card() !== undefined);
        w.ui.sidebar?.expand?.();
        w.ui.sidebar?.changeTab?.('chat', 'primary');
        const newer = w.game.messages.contents.slice(count);
        return { id: card()?.id ?? '', seen: newer.map((m) => m.content.slice(0, 160)).join(' | ') };
    }, before);
    expect(posted.id, `no Navigator power card among the new messages: ${posted.seen}`).not.toBe('');
    const id = posted.id;
    await expect(page.locator(`#sidebar li.chat-message[data-message-id="${id}"] ${CARD}`)).toBeVisible();
    return id;
}

async function snapCard(page: Page, id: string, label: string): Promise<void> {
    await clearScreenOverlays(page);
    const shot = await snap(page, label, { selector: await showChatMessage(page, id) });
    expect(shot, `snap ${label}`).not.toBeNull();
}

test.describe.serial('Navigator powers (Tier B)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(
            async ({ names, scene }) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const w = globalThis as unknown as ProbeWindow;
                for (const name of names) await w.game.actors.getName(name)?.delete();
                await w.game.scenes.getName(scene)?.delete();
            },
            { names: [ACTOR_NAME, OPPONENT_NAME], scene: SCENE_NAME },
        );
    });

    test('the power sheet sets the mastery and a Master success prints the target formula', async ({ page }) => {
        await joinOrSkip(page);
        await createNavigator(page, 80, {});

        const itemSheetId = await page.evaluate(
            async ({ name, power }) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const item = (globalThis as unknown as ProbeWindow).game.actors.getName(name)?.items.getName(power);
                await item?.sheet.render({ force: true });
                return item?.sheet.id ?? '';
            },
            { name: ACTOR_NAME, power: POWER_NAME },
        );
        const mastery = page.locator(`#${itemSheetId} select[name="system.mastery"]`);
        await expect(mastery).toHaveValue('novice');
        await mastery.selectOption('master');
        await expect
            .poll(async () =>
                page.evaluate(
                    ({ name, power }) =>
                        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                        (globalThis as unknown as ProbeWindow).game.actors.getName(name)?.items.getName(power)?.system.mastery ?? '',
                    { name: ACTOR_NAME, power: POWER_NAME },
                ),
            )
            .toBe('master');
        await clearScreenOverlays(page, itemSheetId);
        await snap(page, 'navigator-power-sheet-mastery', { selector: `#${itemSheetId}` });

        // The power sits on the Navigator's Combat tab with its Use Power button (#194).
        const sheetId = await openCombatTab(page);
        await clearScreenOverlays(page, sheetId);
        await snap(page, 'navigator-powers-combat-tab', { selector: `#${sheetId} ${PANEL}` });

        // Perception 80 + Master +20 = 100: only a natural 100 fails, so re-roll that one case.
        let id = '';
        for (let attempt = 0; attempt < 3; attempt += 1) {
            id = await usePower(page, sheetId);
            const manifested = await page.locator(`#sidebar li.chat-message[data-message-id="${id}"] ${CARD} .fa-eye`).count();
            if (manifested > 0) break;
        }
        const card = page.locator(`#sidebar li.chat-message[data-message-id="${id}"] ${CARD}`);
        await expect(card.locator('.fa-eye')).toHaveCount(1);
        await expect(card).toContainText('80');
        await expect(card).toContainText('+20');
        await expect(card).toContainText('Master effect.');
        await expect(card.locator('[data-wh40k-tooltip="modifier"]').first()).toBeVisible();
        await expect(card.locator('[data-action="rollNavigatorMutation"]')).toHaveCount(0);
        await snapCard(page, id, 'navigator-power-success-card');
        recordCoverage('chat.render', 'navigator-power.success');
    });

    test('a failure prints the difficulty row and offers the mutation check', async ({ page }) => {
        await joinOrSkip(page);
        // Perception 10 at Novice with a −30 difficulty clamps the target to 0: always a failure.
        await createNavigator(page, 10, { modifier: -30 });
        const id = await usePower(page, await openCombatTab(page));
        const card = page.locator(`#sidebar li.chat-message[data-message-id="${id}"] ${CARD}`);
        await expect(card.locator('.fa-eye-slash')).toHaveCount(1);
        await expect(card).toContainText('-30');
        await expect(card).toContainText(POWER_NAME);
        await expect(card.locator('[data-action="rollNavigatorMutation"]')).toBeVisible();
        await expect(card.locator('[data-breakdown-row="floor"]')).toContainText('-20');
        await snapCard(page, id, 'navigator-power-failure-card');
        recordCoverage('chat.render', 'navigator-power.failure');
    });

    test('an opposed power against one targeted token rolls both sides', async ({ page }) => {
        await joinOrSkip(page);
        await createNavigator(page, 50, { opposed: true, opposedCharacteristic: 'willpower' });
        const targeted = await page.evaluate(
            async ({ opponent, scene }) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const w = globalThis as unknown as ProbeWindow;
                await w.game.actors.getName(opponent)?.delete();
                const foe = await w.Actor.create({
                    name: opponent,
                    type: 'rt-npc',
                    system: { gameSystem: 'rt', characteristics: { willpower: { base: 30, advance: 0, modifier: 0 } } },
                });
                const created = await w.Scene.create({ name: scene, width: 800, height: 800 });
                if (foe === null || created === null) return false;
                const td = await foe.getTokenDocument({ x: 300, y: 300 });
                const token = (await created.createEmbeddedDocuments('Token', [td.toObject()])).at(0);
                await created.view();
                const placeable = (): { id: string; setTarget: (on: boolean, opts: object) => void } | undefined =>
                    w.canvas.tokens?.placeables.find((t) => t.id === token?.id);
                await globalThis.wh40kE2E.waitFor(
                    () => w.canvas.ready && placeable() !== undefined,
                    'opponent token drawn',
                    globalThis.wh40kE2E.scaledMs(20_000),
                );
                if (w.game.paused) w.game.togglePause(false);
                placeable()?.setTarget(true, { releaseOthers: true });
                return w.game.user.targets.size === 1;
            },
            { opponent: OPPONENT_NAME, scene: SCENE_NAME },
        );
        expect(targeted, 'exactly one opponent token is targeted').toBe(true);

        const id = await usePower(page, await openCombatTab(page));
        const card = page.locator(`#sidebar li.chat-message[data-message-id="${id}"] ${CARD}`);
        const opposed = card.locator('li', { hasText: /Opponent/ });
        await expect(opposed).toHaveCount(1);
        await expect(opposed).toContainText('/ 30');
        await expect(card.locator('li', { hasText: /Net/ })).toHaveCount(1);
        await snapCard(page, id, 'navigator-power-opposed-card');
        recordCoverage('chat.render', 'navigator-power.opposed');
    });
});
