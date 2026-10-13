import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the requisition / armoury work on real Foundry (#192,
 * #496, #136):
 *
 *   1. The OW Logistics Test dialog opens on the squad's SAVED battlefront
 *      (`system.logisticsFront`) and saves a picker change back to the actor.
 *   2. The Inquisition Armoury request card for an OW buyer, priced through the
 *      Logistics Test with its Table 6-2 / 6-6 rows and no rating loss.
 *   3. The armoury card for a DH2 buyer whose failure prints the Influence loss
 *      row (DoF beyond Fellowship bonus, core p. 269).
 *   4. The DH2 weapon-modification parts row (+30, core p. 162).
 *
 * The cards go through the production `gateArmouryTrade` hook handler (the real
 * roll, rule resolution, template render and ChatMessage.create). Targets are
 * chosen so the outcome does not depend on the d100.
 */

const ARMOURY_MODULE = '/systems/wh40k-rpg/module/integrations/armoury-requisition.js';
const DIALOG_MODULE = '/systems/wh40k-rpg/module/applications/prompts/logistics-test-dialog.js';

interface CardProbe {
    messageId: string | null;
    html: string;
    error: string | null;
}

interface CardRequest {
    gameSystem: string;
    system: {
        logisticsRating?: number;
        influence?: number;
        characteristics?: { fellowship: { bonus: number } };
    };
    item: { name: string; type: string; availability: string; craftsmanship: string };
}

/** Run one armoury trade through the production hook handler and return the posted card. */
async function postArmouryCard(page: Page, request: CardRequest): Promise<CardProbe> {
    return page.evaluate(
        async ({ moduleUrl, req }): Promise<CardProbe> => {
            interface ChatMessageLike {
                id?: string;
                content?: string;
            }
            interface ArmouryModule {
                gateArmouryTrade: (seller: object, buyer: object, prices: object, userId: string, speaker: () => object) => false | undefined;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (game, ChatMessage) have no browser-side types
            const g = globalThis as unknown as {
                game: { user: { id: string }; messages: { contents: ChatMessageLike[] } };
                ChatMessage: { getSpeaker: (o?: object) => object };
            };
            try {
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import of the compiled system module; shape declared via ArmouryModule
                const mod = (await import(moduleUrl)) as unknown as ArmouryModule;
                const before = new Set(g.game.messages.contents.map((m) => m.id));
                const seller = { flags: { 'wh40k-rpg': { inquisitionArmoury: true }, 'item-piles': { data: { infiniteQuantity: true } } } };
                const buyer = { system: { gameSystem: req.gameSystem, ...req.system }, update: async (): Promise<object> => Promise.resolve({}) };
                const prices = {
                    buyerReceive: [
                        {
                            type: 'item',
                            quantity: 1,
                            item: {
                                name: req.item.name,
                                type: req.item.type,
                                system: { availability: req.item.availability, craftsmanship: req.item.craftsmanship, quantity: 1 },
                            },
                        },
                    ],
                };
                mod.gateArmouryTrade(seller, buyer, prices, g.game.user.id, () => g.ChatMessage.getSpeaker());
                const found = await globalThis.wh40kE2E.pollUntil(() => g.game.messages.contents.some((m) => !before.has(m.id)));
                const msg = found ? g.game.messages.contents.find((m) => !before.has(m.id)) : undefined;
                return { messageId: msg?.id ?? null, html: msg?.content ?? '', error: found ? null : 'no armoury card was posted' };
            } catch (err) {
                return { messageId: null, html: '', error: err instanceof Error ? err.message : String(err) };
            }
        },
        { moduleUrl: ARMOURY_MODULE, req: request },
    );
}

/** How long to wait for a posted card to show in the sidebar before failing (not the 10-minute test budget). */
const CARD_VISIBLE_TIMEOUT_MS = 30_000;

/**
 * Snap a posted chat card by its message id. The fresh test world starts with
 * the sidebar COLLAPSED, so the chat log is in the DOM but nothing in it is
 * visible: expand the sidebar on the chat tab and scroll the card into view.
 */
async function snapCard(page: Page, label: string, messageId: string): Promise<string | null> {
    const selector = `#sidebar [data-message-id="${messageId}"]`;
    await page.evaluate(async (sel) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `ui` global has no browser-side types
        const sidebar = (globalThis as unknown as { ui?: { sidebar?: { expand?: () => void; changeTab?: (tab: string, group: string) => void } } }).ui?.sidebar;
        sidebar?.expand?.();
        sidebar?.changeTab?.('chat', 'primary');
        await globalThis.wh40kE2E.pollUntil(() => document.querySelector(sel) !== null);
        document.querySelector(sel)?.scrollIntoView({ block: 'center' });
    }, selector);
    await clearScreenOverlays(page);
    await page.waitForSelector(selector, { state: 'visible', timeout: CARD_VISIBLE_TIMEOUT_MS });
    return snap(page, label, { selector });
}

async function deleteMessage(page: Page, id: string | null): Promise<void> {
    if (id === null) return;
    await page.evaluate(async (messageId) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { messages: { get: (i: string) => { delete: () => Promise<object> } | undefined } } };
        await g.game.messages.get(messageId)?.delete();
    }, id);
}

test.describe.serial('Requisition and armoury (Tier B)', () => {
    test('OW Logistics dialog opens on the saved front and saves a change back (#496)', async ({ page }) => {
        await joinOrSkip(page);

        const result = await page.evaluate(
            async ({ moduleUrl }) => {
                interface ActorDoc {
                    id: string;
                    system: { logisticsFront?: Record<string, string> };
                    delete: () => Promise<object>;
                }
                interface DialogInstance {
                    id: string;
                    element: HTMLElement | null;
                }
                interface DialogModule {
                    default: { show: (actor: ActorDoc) => DialogInstance };
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `Actor` global has no browser-side types
                const g = globalThis as unknown as { Actor: { create: (data: object) => Promise<ActorDoc | null> }; __reqArmouryActor?: ActorDoc };
                const actor = await g.Actor.create({
                    name: 'Logistics Front Probe',
                    type: 'ow-character',
                    system: {
                        gameSystem: 'ow',
                        logisticsRating: 30,
                        logisticsFront: { troopCount: 'regiments', timeInFront: 'under3Months', frontActive: 'years5plus', warCondition: 'nearVictorious' },
                    },
                });
                if (actor === null) return { error: 'Actor.create returned null', selected: {}, saved: null, dialogId: null };
                g.__reqArmouryActor = actor;
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import of the compiled system module; shape declared via DialogModule
                const mod = (await import(moduleUrl)) as unknown as DialogModule;
                const dialog = mod.default.show(actor);
                await globalThis.wh40kE2E.pollUntil(() => dialog.element?.querySelector('[data-axis="warCondition"]') != null);
                const selectedOn = (axis: string): string | null =>
                    dialog.element?.querySelector(`[data-axis="${axis}"] [data-selected="on"]`)?.getAttribute('data-value') ?? null;
                const selected = {
                    troopCount: selectedOn('troopCount'),
                    timeInFront: selectedOn('timeInFront'),
                    frontActive: selectedOn('frontActive'),
                    warCondition: selectedOn('warCondition'),
                };
                // Change the war conditions in the dialog: the actor must keep the new front.
                dialog.element?.querySelector<HTMLButtonElement>('[data-axis="warCondition"] [data-value="faltering"]')?.click();
                await globalThis.wh40kE2E.pollUntil(() => actor.system.logisticsFront?.['warCondition'] === 'faltering');
                return { error: null, selected, saved: actor.system.logisticsFront?.['warCondition'] ?? null, dialogId: dialog.id };
            },
            { moduleUrl: DIALOG_MODULE },
        );

        expect(result.error, `dialog probe error: ${result.error ?? ''}`).toBeNull();
        expect(result.selected).toEqual({ troopCount: 'regiments', timeInFront: 'under3Months', frontActive: 'years5plus', warCondition: 'nearVictorious' });
        expect(result.saved, 'a picker change must persist to system.logisticsFront').toBe('faltering');

        await clearScreenOverlays(page, result.dialogId ?? undefined);
        const shot = await snap(page, 'ow-logistics-dialog-saved-front', { selector: `#${result.dialogId ?? ''}` });
        expect(shot).not.toBeNull();

        await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: reading the probe actor stashed on globalThis across evaluate calls
            const g = globalThis as unknown as { __reqArmouryActor?: { delete: () => Promise<object> } };
            await g.__reqArmouryActor?.delete();
            g.__reqArmouryActor = undefined;
        });
        recordCoverage('dialog.render', 'LogisticsTestDialog.savedFront');
    });

    test('OW armoury card: priced through the Logistics Test, Table 6-2 rows, no rating loss (#496)', async ({ page }) => {
        await joinOrSkip(page);
        // Rating 0 and a Rare item (Company −30, Violent Impasse −10) clamp the target to 0: always a failure.
        const card = await postArmouryCard(page, {
            gameSystem: 'ow',
            system: { logisticsRating: 0 },
            item: { name: 'Hellgun', type: 'weapon', availability: 'rare', craftsmanship: 'common' },
        });
        expect(card.error, card.error ?? '').toBeNull();
        expect(card.html).toContain('data-requisition-outcome="denied"');
        expect(card.html).toContain('War Conditions');
        expect(card.html).toContain('Table 6-2');
        expect(card.html).not.toContain('falls from');
        const shot = await snapCard(page, 'armoury-card-ow-logistics', card.messageId ?? '');
        expect(shot).not.toBeNull();
        await deleteMessage(page, card.messageId);
        recordCoverage('chat.render', 'armoury-requisition.ow');
    });

    test('DH2 armoury card: a failure prints the Influence loss row (core p. 269, #496)', async ({ page }) => {
        await joinOrSkip(page);
        // 20 Influence − 50 (Near Unique) clamps to 0: always fails, and every DoF is beyond a Fellowship bonus of 0.
        const card = await postArmouryCard(page, {
            gameSystem: 'dh2',
            system: { influence: 20, characteristics: { fellowship: { bonus: 0 } } },
            item: { name: 'Plasma Gun', type: 'weapon', availability: 'near-unique', craftsmanship: 'common' },
        });
        expect(card.error, card.error ?? '').toBeNull();
        expect(card.html).toContain('data-requisition-outcome="denied"');
        expect(card.html).toContain('Influence falls from 20 to');
        const shot = await snapCard(page, 'armoury-card-dh2-influence-loss', card.messageId ?? '');
        expect(shot).not.toBeNull();
        await deleteMessage(page, card.messageId);
        recordCoverage('chat.render', 'armoury-requisition.dh2-loss');
    });

    test('DH2 armoury card: weapon-modification parts print their +30 row (core p. 162, #136)', async ({ page }) => {
        await joinOrSkip(page);
        const card = await postArmouryCard(page, {
            gameSystem: 'dh2',
            system: { influence: 40, characteristics: { fellowship: { bonus: 4 } } },
            item: { name: 'Red-Dot Laser Sight', type: 'weaponModification', availability: 'rare', craftsmanship: 'common' },
        });
        expect(card.error, card.error ?? '').toBeNull();
        expect(card.html).toContain('Modification parts, to fit personally');
        expect(card.html).toContain('+30');
        const shot = await snapCard(page, 'armoury-card-dh2-modification-parts', card.messageId ?? '');
        expect(shot).not.toBeNull();
        // The long label once squeezed the value column so "+30" wrapped to "+3" / "0": the value must stay on one line.
        const valueLines = await page.evaluate((id) => {
            const rows = Array.from(document.querySelectorAll(`#sidebar [data-message-id="${id}"] [data-wh40k-tooltip="modifier"]`));
            const row = rows.find((r) => r.textContent.includes('Modification parts'));
            return row?.lastElementChild?.getClientRects().length ?? 0;
        }, card.messageId ?? '');
        expect(valueLines, 'the +30 value renders on a single line').toBe(1);
        await deleteMessage(page, card.messageId);
        recordCoverage('chat.render', 'armoury-requisition.dh2-parts');
    });
});
