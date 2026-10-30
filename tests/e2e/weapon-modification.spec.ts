import type { Page } from '@playwright/test';
import { popOutChatMessage, showChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of fitting and removing a weapon modification personally
 * (#136), driven from the weapon sheet the way a player does it:
 *
 *   - DH2: Fit a modification rolls Trade (Armourer) at the parts'
 *     Availability (the Red-Dot Laser Sight is Scarce, −10); a success fits it
 *     and uses up the parts. The fitted row's screwdriver removes it with a
 *     Tech-Use test at the same modifier; a success returns the parts.
 *   - A DH2 supplement: a xenos weapon first needs the GM's ruling that
 *     the maker is known and a Hard Forbidden Lore test; the next fitting then
 *     carries the alien-nature (−20) and lore-insight (+5 per DoS) rows.
 *   - Deathwatch prints no fitting test, so a DW owner's weapon sheet offers none.
 *
 * Every d100 is pinned through `CONFIG.Dice.randomUniform` (Foundry maps a
 * uniform `u` to `ceil((1 − u) × faces)`, so 0.955 rolls 05), so the outcomes
 * do not depend on the dice.
 */

/**
 * The parts, taken from the DH2 weapon-mods compendium as DH2
 * prints them (Scarce). The compendium mods were once typed
 * `weapon.modification`, which no Item type registers, so an actor dropped them
 * on embedding (#136); the spec now uses the compendium document itself.
 */
const MOD_NAME = 'Red-Dot Laser Sight';
const MOD_UUID = compendiumUuid({ line: 'dh2', category: 'weapon-mods' }, '9dd13b0f5d3d2b15');
/** Uniform that rolls a d100 of 05: a success on any target above 5. */
const SUCCESS_UNIFORM = 0.955;
const ROLL_DIALOG = '.unified-roll-dialog';

/** What the spec stashes on the page between evaluates: its actors, and Foundry's own die generator while it is pinned. */
interface ProbeStash {
    actorIds: string[];
    savedUniform: (() => number) | null;
    /** Notification texts, recorded once the dice are pinned. */
    notices?: string[];
}

interface Setup {
    error: string | null;
    actorId: string;
    weaponId: string;
    sheetId: string;
}

/**
 * A character of `line` carrying one weapon (typed `xenos` when asked) and the
 * Red-Dot Laser Sight parts, dropped from the compendium; opens the weapon's sheet.
 */
async function setup(page: Page, line: 'dh2' | 'dw', xenos: boolean): Promise<Setup> {
    return page.evaluate(
        async ({ gameSystem, xenosWeapon, modUuid }): Promise<Setup> => {
            interface ItemDoc {
                id: string;
                type: string;
                sheet: { id: string; render: (force: boolean) => Promise<object> };
            }
            interface ActorDoc {
                id: string;
                createEmbeddedDocuments: (type: string, data: object[]) => Promise<ItemDoc[]>;
                items: { get: (id: string) => ItemDoc | undefined };
            }
            interface CompendiumItem {
                type: string;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (Actor, fromUuid, game) have no browser-side types
            const g = globalThis as unknown as {
                Actor: { create: (data: object) => Promise<ActorDoc | null> };
                fromUuid: (uuid: string) => Promise<CompendiumItem | null>;
                game: { items: { fromCompendium: (doc: object) => object } };
                __weaponModProbe?: ProbeStash;
            };
            try {
                const stash: ProbeStash = g.__weaponModProbe ?? { actorIds: [], savedUniform: null };
                g.__weaponModProbe = stash;
                // The parts' compendium document: a fitted entry points back at it, and a removal returns a copy of it.
                const source = await g.fromUuid(modUuid);
                if (source === null) return { error: `compendium parts ${modUuid} not found`, actorId: '', weaponId: '', sheetId: '' };
                if (source.type !== 'weaponModification') {
                    return { error: `compendium parts are typed "${source.type}", not weaponModification`, actorId: '', weaponId: '', sheetId: '' };
                }
                const actor = await g.Actor.create({
                    name: `Modification Probe (${gameSystem}${xenosWeapon ? ', xenos' : ''})`,
                    type: `${gameSystem}-character`,
                    system: {
                        gameSystem,
                        characteristics: { intelligence: { base: 40 } },
                        skills: {
                            trade: { entries: [{ name: 'Armourer', advance: 2 }] },
                            techUse: { advance: 1 },
                            forbiddenLore: { entries: [{ name: 'Xenos', advance: 1 }] },
                        },
                    },
                });
                if (actor === null) return { error: 'Actor.create returned null', actorId: '', weaponId: '', sheetId: '' };
                stash.actorIds.push(actor.id);
                const embedded = await actor.createEmbeddedDocuments('Item', [
                    {
                        name: xenosWeapon ? 'Probe Shuriken Catapult' : 'Probe Autogun',
                        type: 'weapon',
                        system: { class: 'basic', type: xenosWeapon ? 'xenos' : 'solid-projectile', equipped: true },
                    },
                    g.game.items.fromCompendium(source),
                ]);
                if (!embedded.some((item) => item.type === 'weaponModification')) {
                    return {
                        error: `the parts did not embed (embedded ${embedded.map((i) => i.type).join(', ')})`,
                        actorId: actor.id,
                        weaponId: '',
                        sheetId: '',
                    };
                }
                // By type, not position: the created documents need not come back in the order given.
                const weapon = embedded.find((item) => item.type === 'weapon');
                const weaponItem = weapon === undefined ? undefined : actor.items.get(weapon.id);
                if (weaponItem === undefined) return { error: 'the weapon was not embedded', actorId: actor.id, weaponId: '', sheetId: '' };
                await weaponItem.sheet.render(true);
                return { error: null, actorId: actor.id, weaponId: weaponItem.id, sheetId: weaponItem.sheet.id };
            } catch (err) {
                return { error: err instanceof Error ? err.message : String(err), actorId: '', weaponId: '', sheetId: '' };
            }
        },
        { gameSystem: line, xenosWeapon: xenos, modUuid: MOD_UUID },
    );
}

async function teardown(page: Page): Promise<void> {
    await page.evaluate(async () => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` / `CONFIG` globals have no browser-side types
        const g = globalThis as unknown as {
            game: {
                actors: { get: (id: string) => { delete: () => Promise<object> } | undefined };
            };
            __weaponModProbe?: ProbeStash;
            CONFIG: { Dice: { randomUniform: () => number } };
        };
        const stash = g.__weaponModProbe;
        if (stash?.savedUniform != null) g.CONFIG.Dice.randomUniform = stash.savedUniform;
        for (const id of stash?.actorIds ?? []) {
            // eslint-disable-next-line no-await-in-loop -- sequential teardown of the probe's own actors (their sheets close with them)
            await g.game.actors.get(id)?.delete();
        }
        g.__weaponModProbe = undefined;
    });
}

/** Pin every die to `uniform` until {@link teardown} restores Foundry's generator. */
async function pinDice(page: Page, uniform: number): Promise<void> {
    await page.evaluate((u) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `CONFIG` global has no browser-side types
        const g = globalThis as unknown as {
            CONFIG: { Dice: { randomUniform: () => number } };
            ui: { notifications: { notify: (message: string, type?: string) => object } };
            __weaponModProbe?: ProbeStash;
        };
        const prior = g.__weaponModProbe;
        const notices = prior?.notices ?? [];
        if (prior?.notices === undefined) {
            // Keep every notification text, so a fitting that stops before its roll dialog says why.
            const notify = g.ui.notifications.notify.bind(g.ui.notifications);
            g.ui.notifications.notify = (message: string, type?: string): object => {
                notices.push(message);
                return notify(message, type);
            };
        }
        g.__weaponModProbe = {
            actorIds: prior?.actorIds ?? [],
            savedUniform: prior?.savedUniform ?? g.CONFIG.Dice.randomUniform,
            notices,
        };
        g.CONFIG.Dice.randomUniform = (): number => u;
    }, uniform);
}

/** The notifications shown since the dice were first pinned. */
async function recordedNotices(page: Page): Promise<string> {
    return page.evaluate(() => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: reading the probe stash on globalThis across evaluate calls
        const g = globalThis as unknown as { __weaponModProbe?: ProbeStash };
        return (g.__weaponModProbe?.notices ?? []).join(' | ');
    });
}

async function messageIds(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        (globalThis as unknown as { game: { messages: { contents: Array<{ id: string }> } } }).game.messages.contents.map((m) => m.id),
    );
}

/** Snap the open roll dialog, then roll it, and return the new card's id and HTML. */
async function rollFromDialog(page: Page, label: string): Promise<{ id: string; html: string }> {
    const dialog = page.locator(ROLL_DIALOG).last();
    try {
        await expect(dialog).toBeVisible();
    } catch (err) {
        throw new Error(`no roll dialog for ${label}; notifications: ${await recordedNotices(page)}`, { cause: err });
    }
    const dialogId = (await dialog.getAttribute('id')) ?? '';
    await clearScreenOverlays(page, dialogId);
    expect(await snap(page, label, { selector: `#${dialogId}` }), `${label} screenshot`).not.toBeNull();
    const before = await messageIds(page);
    await page.locator(`#${dialogId} [data-action="systemRoll"]`).click();
    let id = '';
    await expect
        .poll(async () => {
            id = await page.evaluate(
                (seen) =>
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
                    (globalThis as unknown as { game: { messages: { contents: Array<{ id: string }> } } }).game.messages.contents.find(
                        (m) => !seen.includes(m.id),
                    )?.id ?? '',
                [...before],
            );
            return id;
        })
        .not.toBe('');
    const card = page.locator(await showChatMessage(page, id));
    await expect(card).toBeVisible();
    return { id, html: await card.innerHTML({ timeout: 10_000 }) };
}

async function snapCard(page: Page, label: string, id: string): Promise<void> {
    const selector = await popOutChatMessage(page, id);
    expect(await snap(page, label, { selector }), `${label} screenshot`).not.toBeNull();
}

/** Re-open the weapon sheet (the card snap closed it) and snap it. */
async function snapWeaponSheet(page: Page, probe: Setup, label: string): Promise<void> {
    await page.evaluate(
        async ({ actorId, weaponId }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
            const g = globalThis as unknown as {
                game: {
                    actors: {
                        get: (
                            id: string,
                        ) => { items: { get: (id: string) => { sheet: { render: (force: boolean) => Promise<object> } } | undefined } } | undefined;
                    };
                };
            };
            await g.game.actors.get(actorId)?.items.get(weaponId)?.sheet.render(true);
        },
        { actorId: probe.actorId, weaponId: probe.weaponId },
    );
    await expect(page.locator(`#${probe.sheetId}`)).toBeVisible();
    await showWeaponDetails(page, probe.sheetId);
    await clearScreenOverlays(page, probe.sheetId);
    expect(await snap(page, label, { selector: `#${probe.sheetId}` }), `${label} screenshot`).not.toBeNull();
}

/** The weapon sheet opens with its details body collapsed; the modification controls live in it. */
async function showWeaponDetails(page: Page, sheetId: string): Promise<void> {
    const sheet = page.locator(`#${sheetId}`);
    if ((await sheet.locator('.wh40k-weapon-body.collapsed').count()) > 0) await sheet.locator('[data-action="toggleBody"]').click();
    await expect(sheet.locator('.wh40k-weapon-body.collapsed')).toHaveCount(0);
}

async function partsCount(page: Page, actorId: string): Promise<number> {
    return page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as {
            game: { actors: { get: (i: string) => { items: { filter: (fn: (i: { type: string }) => boolean) => object[] } } | undefined } };
        };
        return g.game.actors.get(id)?.items.filter((i) => i.type === 'weaponModification').length ?? -1;
    }, actorId);
}

test.describe.serial('Weapon personal modification (Tier B, #136)', () => {
    test('DH2: fit the Red-Dot Laser Sight from the weapon sheet, then remove it and keep the parts', async ({ page }) => {
        await joinOrSkip(page);
        try {
            const probe = await setup(page, 'dh2', false);
            expect(probe.error, probe.error ?? '').toBeNull();
            const sheet = page.locator(`#${probe.sheetId}`);
            await showWeaponDetails(page, probe.sheetId);
            const fit = sheet.locator('[data-action="fitModification"]');
            await expect(fit).toBeVisible();
            await clearScreenOverlays(page, probe.sheetId);
            expect(await snap(page, 'weapon-sheet-fit-offered', { selector: `#${probe.sheetId}` })).not.toBeNull();

            expect(await partsCount(page, probe.actorId), 'the compendium parts arrive as a weaponModification item').toBe(1);
            await pinDice(page, SUCCESS_UNIFORM);
            await fit.click();
            const fitted = await rollFromDialog(page, 'weapon-mod-fit-roll-dialog');
            expect(fitted.html).toContain('Modification Availability');
            expect(fitted.html).toContain(`${MOD_NAME} is fitted to Probe Autogun`);
            await snapCard(page, 'weapon-mod-fit-card', fitted.id);
            expect(await partsCount(page, probe.actorId), 'a success uses up the parts').toBe(0);

            await snapWeaponSheet(page, probe, 'weapon-sheet-after-fit');
            const unfit = sheet.locator('[data-action="unfitModification"]');
            await expect(unfit).toHaveCount(1);

            await unfit.click();
            const removed = await rollFromDialog(page, 'weapon-mod-remove-roll-dialog');
            expect(removed.html).toContain('with its parts intact');
            await snapCard(page, 'weapon-mod-remove-card', removed.id);
            expect(await partsCount(page, probe.actorId), 'a successful removal returns the parts').toBe(1);
            await snapWeaponSheet(page, probe, 'weapon-sheet-after-remove');
            await expect(sheet.locator('[data-action="unfitModification"]')).toHaveCount(0);
            recordCoverage('weapon-modification.flow', 'dh2-fit-and-remove');
        } finally {
            await teardown(page);
        }
    });

    test('DH2 xenos weapon: the Forbidden Lore step first, then a fitting with the xenos rows', async ({ page }) => {
        await joinOrSkip(page);
        try {
            const probe = await setup(page, 'dh2', true);
            expect(probe.error, probe.error ?? '').toBeNull();
            await pinDice(page, SUCCESS_UNIFORM);
            await showWeaponDetails(page, probe.sheetId);
            await page.locator(`#${probe.sheetId} [data-action="fitModification"]`).click();

            const makerQuestion = page.locator('dialog.application, .application.dialog').filter({ hasText: 'which alien race built' }).last();
            await expect(makerQuestion).toBeVisible();
            const questionId = (await makerQuestion.getAttribute('id')) ?? '';
            await clearScreenOverlays(page, questionId);
            expect(await snap(page, 'weapon-mod-xenos-maker-question', { selector: `#${questionId}` })).not.toBeNull();
            await makerQuestion.locator('[data-action="yes"]').click();

            const lore = await rollFromDialog(page, 'weapon-mod-xenos-lore-roll-dialog');
            expect(lore.html).toContain('Xenos');
            await snapCard(page, 'weapon-mod-xenos-lore-card', lore.id);

            await snapWeaponSheet(page, probe, 'weapon-sheet-xenos-before-fit');
            await page.locator(`#${probe.sheetId} [data-action="fitModification"]`).click();
            const fitted = await rollFromDialog(page, 'weapon-mod-xenos-fit-roll-dialog');
            expect(fitted.html).toContain('Xenos device: alien nature');
            expect(fitted.html).toContain('Forbidden Lore insight');
            expect(fitted.html).toContain(`${MOD_NAME} is fitted to Probe Shuriken Catapult`);
            await snapCard(page, 'weapon-mod-xenos-fit-card', fitted.id);
            recordCoverage('weapon-modification.flow', 'dh2-xenos-lore-then-fit');
        } finally {
            await teardown(page);
        }
    });

    test('DW prints no fitting test: the weapon sheet offers no personal fitting', async ({ page }) => {
        await joinOrSkip(page);
        try {
            const probe = await setup(page, 'dw', false);
            expect(probe.error, probe.error ?? '').toBeNull();
            const sheet = page.locator(`#${probe.sheetId}`);
            await expect(sheet).toBeVisible();
            await showWeaponDetails(page, probe.sheetId);
            await expect(sheet.locator('.wh40k-weapon-body'), 'the details body, where a DH2 sheet offers the fitting, is open').toBeVisible();
            await clearScreenOverlays(page, probe.sheetId);
            expect(await snap(page, 'weapon-sheet-dw-no-fitting', { selector: `#${probe.sheetId}` })).not.toBeNull();
            await expect(sheet.locator('[data-action="fitModification"]')).toHaveCount(0);
            recordCoverage('weapon-modification.flow', 'absent-on-dw');
        } finally {
            await teardown(page);
        }
    });
});
