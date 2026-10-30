import type { Page } from '@playwright/test';
import { actorFlag, createActor, deleteDocuments, openActorSheet, prepareStage, snapWindow } from './combat-resolution-flow';
import { popOutChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { fixD100 } from './lib/dice';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B — the grapple panel on both sides of a DH2 grapple (#120; DH2
 * Grappling rules).
 *
 * The controller (`grappling`) and the target (`controlled`) each see their own
 * role's options as DH2 prints them. The controller has Damage Opponent, Throw Down
 * Opponent, Push Opponent, Ready, Stand and Use Item; the target has Break Free,
 * Slip Free and Take Control. The GM (this session's user) also sees the other
 * role's group, marked as acting for the opponent. The target wins Take Control with
 * fixed dice (05 against 99), and the roles swap on both actors. The new target then
 * takes Slip Free, a plain Acrobatics test through the roll dialog; a 05 passes, and
 * the grapple ends for both.
 *
 * Each step records a `grapple.flow` coverage key; keep GRAPPLE_FLOWS in sync with
 * the denominator in scripts/e2e-coverage.mjs.
 */

const GRAPPLE_FLOWS = ['controller-options', 'target-options', 'take-control', 'slip-free'] as const;

const PANEL = '[data-wh40k-hook="grapple-panel"]';
const OWN = `${PANEL} [data-wh40k-hook="grapple-section"][data-grapple-own="true"]`;
const OTHER = `${PANEL} [data-wh40k-hook="grapple-section"][data-grapple-own="false"]`;

const CONTROLLER_OPTIONS = ['damage-opponent', 'throw-down-opponent', 'push-opponent', 'ready', 'stand', 'use-item'];
const TARGET_OPTIONS = ['break-free', 'slip-free', 'take-control'];

/** A section's role and the options it offers, or null when it is absent. */
async function readSection(page: Page, sheetId: string, selector: string): Promise<{ role: string; options: string[] } | null> {
    return page.evaluate(
        ({ id, sel }) => {
            const section = document.getElementById(id)?.querySelector<HTMLElement>(sel);
            if (section === null || section === undefined) return null;
            return {
                role: section.dataset['grappleRole'] ?? '',
                options: Array.from(
                    section.querySelectorAll<HTMLButtonElement>('button[data-action="grappleOption"]'),
                    (b) => b.dataset['grappleOption'] ?? '',
                ),
            };
        },
        { id: sheetId, sel: selector },
    );
}

async function setGrappleFlag(page: Page, actorId: string, value: object): Promise<void> {
    await page.evaluate(
        async ({ id, flag }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
            const g = globalThis as unknown as {
                game: { actors: { get: (i: string) => { setFlag: (s: string, k: string, v: object) => Promise<object> } | undefined } };
            };
            await g.game.actors.get(id)?.setFlag('wh40k-rpg', 'grapple', flag);
        },
        { id: actorId, flag: value },
    );
}

async function messageIds(page: Page): Promise<string[]> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
    return page.evaluate(() => (globalThis as unknown as { game: { messages: { contents: Array<{ id: string }> } } }).game.messages.contents.map((m) => m.id));
}

/** The first chat message posted after `before`. */
async function newMessage(page: Page, before: readonly string[]): Promise<string> {
    let id = '';
    await expect
        .poll(async () => {
            id = (await messageIds(page)).find((m) => !before.includes(m)) ?? '';
            return id;
        })
        .not.toBe('');
    return id;
}

test.describe.serial('Grapple panel (Tier B, #120)', () => {
    test('each side sees its own options; Take Control swaps the roles; Slip Free rolls Acrobatics', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const character = (name: string): object => ({
            name,
            type: 'dh2-character',
            img: 'icons/svg/mystery-man.svg',
            system: { gameSystem: 'dh2', characteristics: { strength: { base: 40, advance: 0, modifier: 0 }, agility: { base: 40, advance: 0, modifier: 0 } } },
        });
        const controller = await createActor(page, { data: character('Grappling Enforcer') });
        const held = await createActor(page, { data: character('Held Heretic') });
        try {
            // A grapple the enforcer controls, each side naming the other (as a started grapple does).
            await setGrappleFlag(page, controller.id, { state: 'grappling', opponentUuid: `Actor.${held.id}`, thrownDown: false });
            await setGrappleFlag(page, held.id, { state: 'controlled', opponentUuid: `Actor.${controller.id}`, thrownDown: false });

            // The controller's options.
            const controllerSheet = await openActorSheet(page, controller.id, 'overview');
            await expect(page.locator(`#${controllerSheet} ${PANEL}`)).toBeVisible();
            expect(await readSection(page, controllerSheet, OWN)).toEqual({ role: 'controller', options: CONTROLLER_OPTIONS });
            // The GM also sees the target's group, for the opponent.
            expect(await readSection(page, controllerSheet, OTHER)).toEqual({ role: 'target', options: TARGET_OPTIONS });
            await page.locator(`#${controllerSheet} ${PANEL}`).scrollIntoViewIfNeeded();
            expect(await snap(page, 'grapple-controller-options', { selector: `#${controllerSheet} ${OWN}` })).not.toBeNull();
            expect(await snap(page, 'grapple-controller-panel-gm', { selector: `#${controllerSheet} ${PANEL}` })).not.toBeNull();
            recordCoverage('grapple.flow', 'controller-options');

            // The target's options.
            const heldSheet = await openActorSheet(page, held.id, 'overview');
            expect(await readSection(page, heldSheet, OWN)).toEqual({ role: 'target', options: TARGET_OPTIONS });
            await page.locator(`#${heldSheet} ${PANEL}`).scrollIntoViewIfNeeded();
            expect(await snap(page, 'grapple-target-options', { selector: `#${heldSheet} ${OWN}` })).not.toBeNull();
            await expect(page.locator(`#${heldSheet} ${OWN} [data-grapple-option="slip-free"]`)).toContainText('Acrobatics');
            recordCoverage('grapple.flow', 'target-options');

            // Take Control: 05 against the controller's 99 wins the Opposed Strength test.
            let before = await messageIds(page);
            await fixD100(page, [5, 99]);
            await page.locator(`#${heldSheet} ${OWN} [data-grapple-option="take-control"]`).click();
            await expect
                .poll(async () => actorFlag(page, held.id, 'grapple'), { message: 'the target now controls the grapple' })
                .toEqual({ state: 'grappling', opponentUuid: `Actor.${controller.id}`, thrownDown: false });
            await expect
                .poll(async () => actorFlag(page, controller.id, 'grapple'), { message: 'the old controller is now held' })
                .toEqual({ state: 'controlled', opponentUuid: `Actor.${held.id}`, thrownDown: false });
            const takeControlCard = await newMessage(page, before);
            await expect.poll(async () => readSection(page, heldSheet, OWN)).toEqual({ role: 'controller', options: CONTROLLER_OPTIONS });
            expect(await snapWindow(page, 'grapple-take-control-swap', heldSheet)).not.toBeNull();
            const takePopout = await popOutChatMessage(page, takeControlCard);
            await expect(page.locator(`${takePopout} [data-wh40k-hook="grapple-effect"]`)).toContainText('Takes control of the grapple');
            expect(await snap(page, 'grapple-take-control-card', { selector: takePopout })).not.toBeNull();
            recordCoverage('grapple.flow', 'take-control');

            // Slip Free: the new target rolls Acrobatics through the roll dialog.
            const enforcerSheet = await openActorSheet(page, controller.id, 'overview');
            expect(await readSection(page, enforcerSheet, OWN)).toEqual({ role: 'target', options: TARGET_OPTIONS });
            before = await messageIds(page);
            await page.locator(`#${enforcerSheet} ${OWN} [data-grapple-option="slip-free"]`).click();
            const dialog = page.locator('form.unified-roll-dialog').last();
            await expect(dialog).toBeVisible();
            await expect(dialog).toContainText('Acrobatics');
            expect(await snap(page, 'grapple-slip-free-acrobatics', { selector: 'form.unified-roll-dialog' })).not.toBeNull();
            await fixD100(page, [5]);
            await dialog.locator('[data-action="systemRoll"]').click();
            await expect
                .poll(async () => actorFlag(page, controller.id, 'grapple'), { message: 'Slip Free ends the grapple' })
                .toEqual({ state: 'none', opponentUuid: null, thrownDown: false });
            await expect
                .poll(async () => actorFlag(page, held.id, 'grapple'), { message: 'for both' })
                .toEqual({ state: 'none', opponentUuid: null, thrownDown: false });
            const slipCard = await newMessage(page, before);
            const slipPopout = await popOutChatMessage(page, slipCard);
            await expect(page.locator(slipPopout)).toContainText('Slips free');
            expect(await snap(page, 'grapple-slip-free-card', { selector: slipPopout })).not.toBeNull();
            recordCoverage('grapple.flow', 'slip-free');
            expect(GRAPPLE_FLOWS).toHaveLength(4);
        } finally {
            await deleteDocuments(page, { actors: [controller.id, held.id] });
        }
    });
});
