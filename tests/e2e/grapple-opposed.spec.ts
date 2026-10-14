import type { Page } from '@playwright/test';
import { popOutChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B: grapple actions are Opposed Strength tests against the other
 * participant (#450; DH2 core p. 221–222).
 *
 * The sheet's grapple roller tested the opponent's side against a copy of the
 * acting actor's own Strength and posted nothing. A grappler (Strength 45) holds
 * a cultist (Strength 25): Damage Opponent from the grapple panel posts a card
 * whose two sides are rolled against 45 and 25 respectively. Without a recorded
 * or targeted opponent the action warns and rolls nothing.
 */

const PREFIX = 'e2e-450';

interface ProbeActor {
    id: string;
    uuid: string;
    sheet: { id: string; render: (o: { force: boolean }) => Promise<void>; changeTab: (tab: string, group: string) => void };
    setFlag: (scope: string, key: string, value: object) => Promise<object>;
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Actor: { create: (data: object) => Promise<ProbeActor | null> };
    game: {
        actors: { filter: (fn: (a: { name: string }) => boolean) => ProbeActor[] };
        messages: { contents: Array<{ id: string; content: string }> };
    };
}

async function messageIds(page: Page): Promise<string[]> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
    return page.evaluate(() => (globalThis as unknown as ProbeWindow).game.messages.contents.map((m) => m.id));
}

/** Create the grappler (holding the cultist when `recordOpponent`) and open its sheet on the Overview tab. */
async function setUp(page: Page, recordOpponent: boolean): Promise<string> {
    return page.evaluate(
        async ({ prefix, record }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            const strength = (base: number): object => ({ characteristics: { strength: { base, advance: 0, modifier: 0 } } });
            const cultist = await w.Actor.create({ name: `${prefix} Cultist`, type: 'dh2-character', system: { gameSystem: 'dh2', ...strength(25) } });
            const grappler = await w.Actor.create({ name: `${prefix} Grappler`, type: 'dh2-character', system: { gameSystem: 'dh2', ...strength(45) } });
            if (cultist === null || grappler === null) throw new Error('Actor.create returned null');
            await grappler.setFlag('wh40k-rpg', 'grapple', record ? { state: 'grappling', opponentUuid: cultist.uuid } : { state: 'grappling' });
            await grappler.sheet.render({ force: true });
            grappler.sheet.changeTab('overview', 'primary');
            return grappler.sheet.id;
        },
        { prefix: PREFIX, record: recordOpponent },
    );
}

test.describe.serial('grapple Opposed Strength tests (Tier B, #450)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(async (prefix) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            for (const actor of w.game.actors.filter((a) => a.name.startsWith(prefix))) await actor.delete();
        }, PREFIX);
    });

    test('Damage Opponent rolls each side against its own Strength and posts the result', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await setUp(page, true);
        const panel = page.locator(`#${sheetId} [data-wh40k-hook="grapple-panel"]`);
        await expect(panel).toBeVisible();
        await clearScreenOverlays(page, sheetId);
        await snap(page, 'grapple-panel-grappling', { selector: `#${sheetId} [data-wh40k-hook="grapple-panel"]` });

        const before = await messageIds(page);
        await panel.locator('[data-action="grappleDamageOpponent"]').click();
        let cardId = '';
        await expect
            .poll(async () => {
                const ids = await messageIds(page);
                cardId = ids.find((id) => !before.includes(id)) ?? '';
                return cardId;
            })
            .not.toBe('');
        const html = await page.evaluate(
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            (id) => (globalThis as unknown as ProbeWindow).game.messages.contents.find((m) => m.id === id)?.content ?? '',
            cardId,
        );
        expect(html).toContain('data-wh40k-hook="grapple-card"');
        expect(html).toMatch(/against Strength 45/);
        expect(html).toMatch(/against Strength 25/);
        expect(html).toContain(`${PREFIX} Cultist`);
        const popout = await popOutChatMessage(page, cardId);
        await expect(page.locator(`${popout} [data-grapple-side="opponent"]`)).toContainText('Strength 25');
        await snap(page, 'grapple-damage-opponent-card', { selector: popout });
        recordCoverage('action', 'grappleDamageOpponent');
    });

    test('with no opponent recorded or targeted it warns and rolls nothing', async ({ page }) => {
        await joinOrSkip(page);
        const sheetId = await setUp(page, false);
        const before = await messageIds(page);
        await page.locator(`#${sheetId} [data-action="grappleBreakFree"]`).click();
        // The sheet's toast (or Foundry's notification) names what is missing.
        await expect(page.getByText('Target the combatant in the grapple with you').first()).toBeVisible();
        expect(await messageIds(page)).toEqual(before);
    });
});
