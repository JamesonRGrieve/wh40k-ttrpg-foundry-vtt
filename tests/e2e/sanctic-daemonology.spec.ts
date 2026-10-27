import type { Page } from '@playwright/test';
import { scanContrast } from './lib/contrast';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import {
    addCompendiumItems,
    cleanupProbes,
    forceDice,
    messageIds,
    openProbeSheet,
    type ProbeActorData,
    readActorSystem,
    showSheetTab,
    snapElement,
    snapMessage,
    waitForMessage,
} from './occult-sheet-flow';

/** A card block whose whole text is a cost line, as the packs' old descriptions were (content#30). */
const BARE_XP_LINE = />\s*\d+\s*xp\s*</i;

/** Sacrifice — a Malefic Daemonology power (DH2 Enemies Beyond), not an attack. */
const SACRIFICE_UUID = 'Compendium.wh40k-rpg.dh2-beyond-items-psychic-powers.Item.fs2LEOnlo15rJYiN';
/** Psychic Communion — a Sanctic Daemonology power, not an attack. */
const COMMUNION_UUID = 'Compendium.wh40k-rpg.dh2-beyond-items-psychic-powers.Item.r2CakaLPtwzotW0W';
/** The Sanctic Purity talent (#131). */
const SANCTIC_PURITY_UUID = 'Compendium.wh40k-rpg.dh2-beyond-items-talents.Item.2DuNNAkyTTMgGzJb';

/** Dice uniform giving a d100 of 05: a pass, and not a double, so no Phenomena. */
const ROLL_05 = 0.955;
/** Dice uniform giving a d100 of 11: a pass AND a double, so Phenomena trigger. */
const ROLL_11 = 0.895;

/** A psychic power's row in the Combat tab's psychic panel (the Powers tab was folded into Combat). */
const POWER_ROW = (itemId: string): string => `section.tab[data-tab="combat"] [data-item-type="psychicPower"][data-item-id="${itemId}"]`;

/** A DH2 psyker: Psy Rating 3, every characteristic 50, two Fate. */
function psyker(name: string): ProbeActorData {
    const characteristics = Object.fromEntries(
        ['weaponSkill', 'ballisticSkill', 'strength', 'toughness', 'agility', 'intelligence', 'perception', 'willpower', 'fellowship'].map((key) => [
            key,
            { base: 50 },
        ]),
    );
    return { name, type: 'dh2-character', system: { gameSystem: 'dh2', psy: { rating: 3 }, characteristics, corruption: 0, fate: { max: 2, value: 2 } } };
}

/** Click a power's row in the Combat tab's psychic panel (the row is the Focus Power control) and roll the unified dialog. */
async function castFromSheet(page: Page, sheetId: string, itemId: string, label: string): Promise<void> {
    // The row's own hover-revealed invoke button never becomes visible (its group-hover
    // variant is mis-prefixed, reported to the panel's owner), so click the row, which
    // carries the same data-action, at its leading edge clear of the inner controls.
    await page
        .locator(`#${sheetId} ${POWER_ROW(itemId)}`)
        .first()
        .click({ position: { x: 8, y: 8 } });
    const form = page.locator('form.unified-roll-dialog').last();
    await expect(form).toBeVisible();
    const formId = (await form.getAttribute('id')) ?? '';
    await snapElement(page, label, `#${formId}`, formId);
    await form.locator('[data-action="systemRoll"]').click();
}

/**
 * Tier B coverage of the Sanctic Daemonology discipline (GitHub #130 —
 * beyond.md L1813–2090).
 *
 * Drives the deployed `sanctic-daemonology` rules module to resolve a
 * pushed manifestation, renders the manifestation chat card via
 * Foundry's runtime `renderTemplate`, injects it into a live
 * `.wh40k-rpg` host that stays in the DOM while `snap()` runs, and
 * asserts the discipline's defining contrast: a successful Sanctic
 * power inflicts NO corruption while still firing Phenomena on a push.
 */

test.describe.serial('SancticDaemonology (Tier B)', () => {
    test('renders the manifestation card with zero corruption and snaps', async ({ page }) => {
        await joinOrSkip(page);

        const result = await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `foundry` global + `fromUuid` are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                foundry?: { applications?: { handlebars?: { renderTemplate?: (path: string, ctx: object) => Promise<string> } } };
                fromUuid?: (uuid: string) => Promise<{ name?: string } | null>;
            };
            let error: string | null = null;
            let rendered = false;
            let corruption: number | null = null;
            let phenomenaFires = false;
            let canFateNegate = false;
            let hasSystemAttr = false;
            let hasWh40kClass = false;

            interface SancticResult {
                powerId: string;
                effectivePR: number;
                focusModifier: number;
                corruption: number;
                phenomenaFires: boolean;
                phenomenaModifier: number;
                canSoulBindIgnore: boolean;
                canFateNegate: boolean;
            }
            interface SancticModule {
                // eslint-disable-next-line no-restricted-syntax -- boundary: deployed rules module input is heterogeneous content payload; consumer interface is opaque
                resolveSancticManifestation?: (input: unknown) => SancticResult;
            }

            try {
                const moduleUrl = '/systems/wh40k-rpg/module/rules/sanctic-daemonology.js';
                const mod = (await import(moduleUrl)) as SancticModule;
                const resolve = mod.resolveSancticManifestation;
                if (typeof resolve !== 'function') {
                    return {
                        rendered,
                        corruption,
                        phenomenaFires,
                        canFateNegate,
                        hasSystemAttr,
                        hasWh40kClass,
                        error: 'resolveSancticManifestation export missing',
                    };
                }

                // Identify the power by its compendium UUID; the resolver
                // echoes it back and the display name is read from the
                // compendium at runtime (the migrated content home).
                const cleansingFlameUuid = 'Compendium.wh40k-rpg.dh2-beyond-items-psychic-powers.Item.HoHmYJ5qyQq6h5r2';
                const r = resolve({
                    powerId: cleansingFlameUuid,
                    mode: 'push',
                    basePR: 4,
                    pushLevel: 2,
                    success: true,
                    mitigation: { emperorsAnathema: true },
                });
                corruption = r.corruption;
                phenomenaFires = r.phenomenaFires;
                canFateNegate = r.canFateNegate;

                const powerDoc = g.fromUuid ? await g.fromUuid(r.powerId) : null;
                const powerName = powerDoc?.name ?? r.powerId;

                const renderTemplateFn = g.foundry?.applications?.handlebars?.renderTemplate;
                if (typeof renderTemplateFn !== 'function') {
                    return {
                        rendered,
                        corruption,
                        phenomenaFires,
                        canFateNegate,
                        hasSystemAttr,
                        hasWh40kClass,
                        error: 'renderTemplate API unavailable',
                    };
                }

                const html = await renderTemplateFn('systems/wh40k-rpg/templates/chat/sanctic-daemonology-chat.hbs', {
                    gameSystem: 'dh2',
                    powerName,
                    modeKey: 'WH40K.SancticDaemonology.Mode.Push',
                    effectivePR: r.effectivePR,
                    focusModifier: r.focusModifier >= 0 ? `+${r.focusModifier}` : `${r.focusModifier}`,
                    phenomenaFires: r.phenomenaFires,
                    phenomenaModifier: r.phenomenaModifier,
                    canSoulBindIgnore: r.canSoulBindIgnore,
                    canFateNegate: r.canFateNegate,
                });

                // Inject into a persistent host so snap() (called
                // outside this evaluate) captures the live card.
                // Closing/removing here would leave the shot empty.
                // Painted with the sheet window surface, so the card reads as it does on a sheet.
                const host = globalThis.wh40kE2E.panelHost({ html, id: '__c9_sd_host', width: 420, side: 'left', zIndex: 100000, capture: false });

                const card = host.querySelector('[data-wh40k-hook="sd-card"]');
                rendered = card instanceof HTMLElement;
                if (rendered && card) {
                    hasSystemAttr = card.getAttribute('data-wh40k-system') === 'dh2';
                    // The card root sits under the `.wh40k-rpg` host so
                    // the important-scoped Tailwind utilities cascade.
                    hasWh40kClass = card.closest('.wh40k-rpg') !== null;
                }
            } catch (err) {
                error = String(err instanceof Error ? err.message : err);
            }

            return {
                rendered,
                corruption,
                phenomenaFires,
                canFateNegate,
                hasSystemAttr,
                hasWh40kClass,
                error,
            };
        });

        await clearScreenOverlays(page);
        await snap(page, 'sanctic-daemonology', { selector: '#__c9_sd_host [data-wh40k-hook="sd-card"]' });

        // Card captured; tear down the host so it doesn't leak into
        // the next serial test's DOM.
        await page.evaluate(() => {
            document.getElementById('__c9_sd_host')?.remove();
        });

        expect(result.error, `sanctic probe error: ${result.error ?? ''}`).toBeNull();
        expect(result.rendered, 'sanctic chat card did not render').toBe(true);
        // The defining contrast: Sanctic never inflicts corruption.
        expect(result.corruption, 'Sanctic manifestation must cost 0 corruption').toBe(0);
        // A pushed success still forces a Phenomena draw.
        expect(result.phenomenaFires, 'pushed Sanctic success should fire Phenomena').toBe(true);
        // Emperor's Anathema (#131) mitigation surfaces on the card.
        expect(result.canFateNegate, "Emperor's Anathema Fate-negation should be offered").toBe(true);
        // Outside-sheet cascade + per-system anchors are present.
        expect(result.hasSystemAttr, 'card should carry data-wh40k-system').toBe(true);
        expect(result.hasWh40kClass, 'card should sit under a .wh40k-rpg ancestor').toBe(true);

        recordCoverage('chat.render', 'SancticDaemonology');
    });
});

/*
 * Real casts from the character sheet: Powers tab → Focus Power → unified roll
 * dialog → Roll → the psychic card, with dice faces fixed through Foundry's
 * `CONFIG.Dice.randomUniform`.
 */
test.describe.serial('Malefic Corruption and Sanctic Purity casts (Tier B)', () => {
    let before: string[] = [];

    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
        before = await messageIds(page);
    });

    test.afterEach(async ({ page }) => {
        await cleanupProbes(page, before);
    });

    test('a manifested Malefic power charges Corruption equal to the Psy Rating used (a92810cbc)', async ({ page }) => {
        const { actorId, sheetId } = await openProbeSheet(page, psyker('Malefic Psyker'));
        const powerId = (await addCompendiumItems(page, actorId, [SACRIFICE_UUID])).at(0);
        if (powerId === undefined) throw new Error('Sacrifice was not embedded');
        await showSheetTab(page, actorId, 'combat');
        await snapElement(
            page,
            'malefic-power-on-sheet',
            `#${sheetId} section.tab[data-tab="combat"] .wh40k-panel:has(.wh40k-combat-psyker-controls)`,
            sheetId,
        );

        await forceDice(page, ROLL_05);
        await castFromSheet(page, sheetId, powerId, 'malefic-cast-dialog');

        const card = await waitForMessage(page, before, 'Malefic Daemonology');
        const charged = /\+(\d+) Corruption \(Psy Rating (\d+) used\)/.exec(card.content);
        expect(charged, 'the card prints the Malefic Corruption row').not.toBeNull();
        const [, corruption, pr] = charged ?? [];
        expect(corruption).toBe(pr);
        await expect.poll(async () => readActorSystem(page, actorId, 'corruption')).toBe(Number(corruption));
        // content#30: the card shows the power's printed text, not a leftover "100xp" cost line.
        expect(card.content).not.toMatch(BARE_XP_LINE);
        await snapMessage(page, 'malefic-cast-card-corruption', card.id);
        // In the 300px chat log the controls wrap instead of clipping the last button.
        const controls = page.locator(`#sidebar .chat-log .message[data-message-id="${card.id}"] [data-wh40k-hook="psychic-card-controls"]`);
        await expect(controls).toBeVisible();
        const overflow = await controls.evaluate((row) => {
            const right = row.getBoundingClientRect().right;
            return [...row.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().right > right + 1 || b.scrollWidth > b.clientWidth + 1).length;
        });
        expect(overflow, 'no control overflows the card').toBe(0);
        await clearScreenOverlays(page);
        await snap(page, 'psychic-action-card-controls', { selector: `#sidebar .chat-log .message[data-message-id="${card.id}"]` });
        recordCoverage('chat.render', 'psychic-action-chat.malefic');
    });

    test('Sanctic Purity offers to spend Fate on triggered Phenomena; accepting negates them (7fc6b6332)', async ({ page }) => {
        const { actorId, sheetId } = await openProbeSheet(page, psyker('Sanctic Psyker'));
        const powerId = (await addCompendiumItems(page, actorId, [COMMUNION_UUID, SANCTIC_PURITY_UUID])).at(0);
        if (powerId === undefined) throw new Error('Psychic Communion was not embedded');
        await showSheetTab(page, actorId, 'combat');

        await forceDice(page, ROLL_11);
        await castFromSheet(page, sheetId, powerId, 'sanctic-cast-dialog');

        // The doubled 11 triggers Phenomena; the talent's offer is a confirmation.
        const offer = page.locator('.confirmation-dialog').last();
        await expect(offer).toBeVisible();
        const offerId = (await offer.getAttribute('id')) ?? '';
        await snapElement(page, 'sanctic-purity-offer', `#${offerId}`, offerId);
        await offer.locator('[data-action="confirm"]').click();

        const negated = await waitForMessage(page, before, 'Phenomena Negated');
        await expect.poll(async () => readActorSystem(page, actorId, 'fate.value')).toBe(1);
        expect(negated.content).toMatch(/2\s*(→|&rarr;)\s*1/);
        await snapMessage(page, 'sanctic-purity-negated-card', negated.id);
        // The DH2 variant keeps its dark panel, so the gold title is legible (it was gold on a tan wash).
        const negatedRoot = `#sidebar .chat-log .message[data-message-id="${negated.id}"] [data-wh40k-surface="dark"]`;
        await expect(page.locator(negatedRoot)).toBeVisible();
        expect(await scanContrast(page, negatedRoot)).toEqual([]);

        const cast = await waitForMessage(page, [...before, negated.id], 'Phenomena roll is suppressed');
        // A Sanctic power costs no Corruption.
        expect(cast.content).not.toContain('Malefic Daemonology');
        expect(await readActorSystem(page, actorId, 'corruption')).toBe(0);
        expect(cast.content).not.toMatch(BARE_XP_LINE);
        await snapMessage(page, 'sanctic-cast-card-negated', cast.id);
        recordCoverage('chat.render', 'sanctic-purity-negated-chat');
    });
});
