import type { Page } from '@playwright/test';
import { popOutChatMessage, showChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of calling a Reinforcement Character into play (DH2 core
 * pp. 294–295, #77), driven the way the GM does it: the RC is imported from its
 * compendium, its NPC sheet shows the GM-only Reinforcement panel, the panel's
 * Call button opens the call dialog, and the GM picks the caller, the
 * contributions and the Peer discount in that dialog.
 *
 *   - The Thrice-Bound Daemonhost (Enemies Beyond p. 38) needs a caller with
 *     Forbidden Lore (Daemonology) at Trained: a caller without it is refused,
 *     one with it calls the Daemonhost and gains 1d5 Corruption.
 *   - The Eldar Ranger (Enemies Without, Influence Minimum 55, Cost 7, Peer
 *     (Craftworld Eldar) −2) is called with the Peer discount and another
 *     Acolyte paying part of the cost.
 *
 * The callers are DH2 characters owned by a player user, as the dialog only
 * offers player-owned Acolytes.
 */

const DIALOG = '.reinforcement-call-dialog';
const BEYOND_PACK = 'wh40k-rpg.dh2-beyond-actors-reinforcements';
const WITHOUT_PACK = 'wh40k-rpg.dh2-without-actors-reinforcements';
const CALLERS = { lore: 'RC Probe Ibnad', noLore: 'RC Probe Magnus' } as const;

interface Setup {
    error: string | null;
    loreId: string;
    noLoreId: string;
}

/** A player user owning two DH2 Acolytes, one with Forbidden Lore (Daemonology) at Trained. Stashes ids and the Subtlety for {@link teardown}. */
async function setupCallers(page: Page): Promise<Setup> {
    return page.evaluate(async (names): Promise<Setup> => {
        interface Doc {
            id: string;
            delete: () => Promise<object>;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (Actor, User, game.settings) have no browser-side types
        const g = globalThis as unknown as {
            Actor: { create: (data: object) => Promise<Doc | null> };
            User: { create: (data: object) => Promise<Doc | null> };
            game: { settings: { get: (s: string, k: string) => number } };
            __rcProbe?: { docs: Doc[]; subtlety: number };
        };
        const docs: Doc[] = [];
        g.__rcProbe = { docs, subtlety: g.game.settings.get('wh40k-rpg', 'warband-subtlety') };
        try {
            const player = await g.User.create({ name: 'RC Probe Player', role: 1 });
            if (player === null) return { error: 'User.create returned null', loreId: '', noLoreId: '' };
            docs.push(player);
            const acolyte = async (name: string, lore: boolean): Promise<Doc | null> => {
                const actor = await g.Actor.create({
                    name,
                    type: 'dh2-character',
                    ownership: { default: 0, [player.id]: 3 },
                    system: {
                        gameSystem: 'dh2',
                        influence: 60,
                        corruption: 0,
                        ...(lore ? { skills: { forbiddenLore: { entries: [{ name: 'Daemonology', advance: 2 }] } } } : {}),
                    },
                });
                if (actor !== null) docs.unshift(actor);
                return actor;
            };
            const withLore = await acolyte(names.lore, true);
            const withoutLore = await acolyte(names.noLore, false);
            if (withLore === null || withoutLore === null) return { error: 'Actor.create returned null', loreId: '', noLoreId: '' };
            return { error: null, loreId: withLore.id, noLoreId: withoutLore.id };
        } catch (err) {
            return { error: err instanceof Error ? err.message : String(err), loreId: '', noLoreId: '' };
        }
    }, CALLERS);
}

/** Import an RC from its compendium, open its NPC sheet on the NPC tab, and return the sheet id. */
async function openRcSheet(page: Page, packId: string, name: string): Promise<{ error: string | null; actorId: string; sheetId: string; diag?: string }> {
    return page.evaluate(
        async ({ pack, rcName }) => {
            interface ActorDoc {
                id: string;
                type: string;
                system: { gameSystem?: string; isReinforcement?: boolean };
                delete: () => Promise<object>;
                sheet: { id: string; render: (force: boolean) => Promise<object>; changeTab: (tab: string, group: string) => void };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
            const g = globalThis as unknown as {
                game: {
                    packs: {
                        get: (
                            id: string,
                        ) => { index: { find: (fn: (e: { _id: string; name: string }) => boolean) => { _id: string } | undefined } } | undefined;
                    };
                    actors: { importFromCompendium: (pack: object, id: string) => Promise<ActorDoc | null> };
                };
                __rcProbe?: { docs: Array<{ delete: () => Promise<object> }> };
            };
            const compendium = g.game.packs.get(pack);
            const entry = compendium?.index.find((e) => e.name === rcName);
            if (compendium === undefined || entry === undefined) return { error: `${rcName} not found in ${pack}`, actorId: '', sheetId: '' };
            const actor = await g.game.actors.importFromCompendium(compendium, entry._id);
            if (actor === null) return { error: `importing ${rcName} returned null`, actorId: '', sheetId: '' };
            g.__rcProbe?.docs.unshift(actor);
            try {
                await actor.sheet.render(true);
            } catch (err) {
                return { error: `sheet render threw: ${err instanceof Error ? err.stack ?? err.message : String(err)}`, actorId: actor.id, sheetId: '' };
            }
            const root = document.getElementById(actor.sheet.id);
            if (root === null) return { error: `no #${actor.sheet.id} after render`, actorId: actor.id, sheetId: '' };
            actor.sheet.changeTab('npc', 'primary');
            const tabs = Array.from(root.querySelectorAll<HTMLElement>('[data-tab]'), (el) => el.dataset['tab'] ?? '');
            const diag = `type=${actor.type} gameSystem=${String(actor.system.gameSystem)} isReinforcement=${String(actor.system.isReinforcement)} tabs=${[
                ...new Set(tabs),
            ].join(',')}`;
            return { error: null, actorId: actor.id, sheetId: actor.sheet.id, diag };
        },
        { pack: packId, rcName: name },
    );
}

async function teardown(page: Page): Promise<void> {
    await page.evaluate(async () => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (game.settings) have no browser-side types
        const g = globalThis as unknown as {
            game: { settings: { set: (s: string, k: string, v: number) => Promise<number> } };
            __rcProbe?: { docs: Array<{ delete: () => Promise<object> }>; subtlety: number };
        };
        const probe = g.__rcProbe;
        if (probe === undefined) return;
        for (const doc of probe.docs) {
            // eslint-disable-next-line no-await-in-loop -- sequential teardown of the probe's own documents (actors before their owning user)
            await doc.delete();
        }
        await g.game.settings.set('wh40k-rpg', 'warband-subtlety', probe.subtlety);
        g.__rcProbe = undefined;
    });
}

async function actorStat(page: Page, id: string, path: 'influence' | 'corruption'): Promise<number> {
    return page.evaluate(
        ({ actorId, key }) =>
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
            (globalThis as unknown as { game: { actors: { get: (i: string) => { system: Record<string, number> } | undefined } } }).game.actors.get(actorId)
                ?.system[key] ?? Number.NaN,
        { actorId: id, key: path },
    );
}

/** Wait for a new Reinforcement card after `before`, show the chat log and snap it. Returns its HTML. */
async function snapNewCard(page: Page, before: readonly string[], label: string): Promise<string> {
    let id = '';
    await expect
        .poll(async () => {
            id = await page.evaluate(
                (seen) =>
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
                    (globalThis as unknown as { game: { messages: { contents: Array<{ id: string; content: string }> } } }).game.messages.contents.find(
                        (m) => !seen.includes(m.id) && m.content.includes('rc-call-chat'),
                    )?.id ?? '',
                [...before],
            );
            return id;
        })
        .not.toBe('');
    const html = await page.locator(await showChatMessage(page, id)).innerHTML({ timeout: 10_000 });
    const selector = await popOutChatMessage(page, id);
    await expect(page.locator(selector)).toBeVisible();
    expect(await snap(page, label, { selector }), `${label} screenshot`).not.toBeNull();
    return html;
}

/** Snap the call dialog alone: every other floating window is closed, keeping the dialog by its app id. */
async function snapDialog(page: Page, label: string): Promise<void> {
    const id = (await page.locator(DIALOG).getAttribute('id')) ?? '';
    expect(id, 'the call dialog has an app id').not.toBe('');
    await clearScreenOverlays(page, id);
    expect(await snap(page, label, { selector: `#${id}` }), `${label} screenshot`).not.toBeNull();
}

async function messageIds(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        (globalThis as unknown as { game: { messages: { contents: Array<{ id: string }> } } }).game.messages.contents.map((m) => m.id),
    );
}

test.describe.serial('Reinforcement Character call (Tier B, #77)', () => {
    test('Thrice-Bound Daemonhost: a caller without Forbidden Lore (Daemonology) is refused; one with it calls it and gains Corruption', async ({ page }) => {
        await joinOrSkip(page);
        try {
            const callers = await setupCallers(page);
            expect(callers.error, callers.error ?? '').toBeNull();
            const rc = await openRcSheet(page, BEYOND_PACK, 'Thrice-Bound Daemonhost');
            expect(rc.error, rc.error ?? '').toBeNull();

            const panel = page.locator(`#${rc.sheetId} [data-wh40k-hook="rc-panel"]`);
            await expect(panel, rc.diag).toBeVisible();
            await expect(panel.locator('[data-wh40k-hook="rc-caller-skill"]')).toContainText('Daemonology');
            await expect(panel.locator('[data-wh40k-hook="rc-caller-corruption"]')).toContainText('1d5');
            await clearScreenOverlays(page, rc.actorId);
            expect(await snap(page, 'rc-panel-daemonhost', { selector: `#${rc.sheetId} [data-wh40k-hook="rc-panel"]` })).not.toBeNull();

            await panel.locator('[data-action="callReinforcement"]').click();
            const dialog = page.locator(DIALOG);
            await expect(dialog.locator('[data-wh40k-hook="rc-call"]')).toBeVisible();
            await dialog.locator('select[name="callerId"]').selectOption(callers.noLoreId);
            await expect(dialog.locator('[data-wh40k-hook="rc-problem"]')).toContainText('does not have the skill');
            await expect(dialog.locator('button[data-action="callReinforcement"]')).toBeDisabled();
            await snapDialog(page, 'rc-dialog-daemonhost-caller-refused');

            await dialog.locator('select[name="callerId"]').selectOption(callers.loreId);
            await expect(dialog.locator('[data-wh40k-hook="rc-problem"]')).toHaveCount(0);
            await expect(dialog.locator('[data-wh40k-hook="rc-caller-pays"]')).toHaveText('5');
            await snapDialog(page, 'rc-dialog-daemonhost-caller-met');

            const before = await messageIds(page);
            await dialog.locator('button[data-action="callReinforcement"]').click();
            await expect(dialog).toHaveCount(0);
            const html = await snapNewCard(page, before, 'rc-card-daemonhost-corruption');
            expect(html).toContain(CALLERS.lore);
            expect(html).toContain('data-wh40k-hook="rc-chat-corruption"');
            expect(await actorStat(page, callers.loreId, 'influence')).toBe(55);
            const corruption = await actorStat(page, callers.loreId, 'corruption');
            expect(corruption, 'the caller gains 1d5 Corruption').toBeGreaterThanOrEqual(1);
            expect(corruption).toBeLessThanOrEqual(5);
            recordCoverage('reinforcement.flow', 'daemonhost-caller-terms');
        } finally {
            await teardown(page);
        }
    });

    test('Enemies Without Eldar Ranger: the Peer discount and a contribution split the cost', async ({ page }) => {
        await joinOrSkip(page);
        try {
            const callers = await setupCallers(page);
            expect(callers.error, callers.error ?? '').toBeNull();
            const rc = await openRcSheet(page, WITHOUT_PACK, 'Eldar Ranger');
            expect(rc.error, rc.error ?? '').toBeNull();

            const panel = page.locator(`#${rc.sheetId} [data-wh40k-hook="rc-panel"]`);
            await expect(panel, rc.diag).toContainText('Craftworld Eldar');
            await expect(panel.locator('[data-wh40k-hook="rc-caller-terms"]')).toHaveCount(0);
            await clearScreenOverlays(page, rc.actorId);
            expect(await snap(page, 'rc-panel-eldar-ranger', { selector: `#${rc.sheetId} [data-wh40k-hook="rc-panel"]` })).not.toBeNull();

            await panel.locator('[data-action="callReinforcement"]').click();
            const dialog = page.locator(DIALOG);
            await dialog.locator('select[name="callerId"]').selectOption(callers.loreId);
            await expect(dialog.locator('[data-wh40k-hook="rc-final-cost"]')).toHaveText('7');
            await dialog.locator('input[name="peerApplied"]').check();
            await expect(dialog.locator('[data-wh40k-hook="rc-final-cost"]')).toHaveText('5');
            const contribution = dialog.locator(`input[name="contribution.${callers.noLoreId}"]`);
            await contribution.fill('2');
            await contribution.press('Tab');
            await expect(dialog.locator('[data-wh40k-hook="rc-caller-pays"]')).toHaveText('3');
            await snapDialog(page, 'rc-dialog-eldar-ranger-peer-contribution');

            const before = await messageIds(page);
            await dialog.locator('button[data-action="callReinforcement"]').click();
            const html = await snapNewCard(page, before, 'rc-card-eldar-ranger');
            expect(html).toContain('Eldar Ranger');
            expect(html).not.toContain('rc-chat-corruption');
            expect(await actorStat(page, callers.loreId, 'influence')).toBe(57);
            expect(await actorStat(page, callers.noLoreId, 'influence')).toBe(58);
            recordCoverage('reinforcement.flow', 'enemies-without-peer-contribution');
        } finally {
            await teardown(page);
        }
    });
});
