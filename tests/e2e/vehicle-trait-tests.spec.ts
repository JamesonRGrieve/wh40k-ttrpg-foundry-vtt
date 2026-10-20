import type { Page } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';
import { chatMessageIds, firstNewCard, snapChatCard, snapWindow } from './scene-probe';

/**
 * Tier B — vehicle traits as enforceable mechanics (content#28), on the REAL
 * compiled compendium: the DH2 Chimera Armoured Transport (core p. 191) with its
 * lean-embedded Amphibious / Enclosed / Rugged / Tracked Vehicle traits, whose
 * structured effects reach the craft only through the compendium join.
 *
 *   1. The Overview tab's Vehicle Tests panel lists Rugged +20 on Repair and
 *      Tracked Vehicle +10 on Difficult Terrain; the Trait Rules panel lists the
 *      Enclosed crew and Amphibious. The printed Manoeuvrability stays 0.
 *   2. With a crewman aboard, Repair opens the crewman's Tech-Use test with a
 *      Rugged row; the posted card names the trait as the row's source.
 */

const ROLL_DIALOG = '.unified-roll-dialog';
const CHIMERA_PACK = 'wh40k-rpg.dh2-core-vehicles-terracraft';
const CHIMERA_NAME = 'Chimera Armoured Transport';
const CREWMAN_NAME = 'Vehicle Trait Probe Crewman';

interface ProbeIds {
    error: string | null;
    vehicleId: string;
    crewmanId: string;
    sheetId: string;
    manoeuverability: number | null;
    testModifiers: Array<{ test: string; value: number; source: string }>;
}

/** Create the Chimera from its pack and a DH2 crewman aboard it as crew, then open the Chimera's sheet. */
async function createChimeraWithCrew(page: Page): Promise<ProbeIds> {
    return page.evaluate(
        async ({ packId, chimeraName, crewmanName }): Promise<ProbeIds> => {
            const empty: ProbeIds = { error: null, vehicleId: '', crewmanId: '', sheetId: '', manoeuverability: null, testModifiers: [] };
            interface ActorDoc {
                id: string;
                uuid: string;
                system: { manoeuverability: number | null; traitEffects?: { testModifiers: ProbeIds['testModifiers'] } };
                sheet: { id: string; render: (options: object) => Promise<object> } | null;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals (game/Actor), no repo types available in page.evaluate
            const g = globalThis as unknown as {
                game: {
                    packs: {
                        get: (id: string) =>
                            | {
                                  getIndex: () => Promise<Array<{ _id: string; name: string }>>;
                                  getDocument: (id: string) => Promise<{ toObject: () => object }>;
                              }
                            | undefined;
                    };
                };
                Actor: { create: (data: object) => Promise<ActorDoc | null> };
            };
            const pack = g.game.packs.get(packId);
            if (pack === undefined) return { ...empty, error: `pack ${packId} not found` };
            const entry = (await pack.getIndex()).find((e) => e.name === chimeraName);
            if (entry === undefined) return { ...empty, error: `${chimeraName} not in ${packId}` };
            const vehicle = await g.Actor.create((await pack.getDocument(entry._id)).toObject());
            if (vehicle === null) return { ...empty, error: 'the Chimera was not created' };
            const forty = { base: 40, advance: 0, modifier: 0 };
            const crewman = await g.Actor.create({
                name: crewmanName,
                type: 'dh2-character',
                system: { gameSystem: 'dh2', characteristics: { intelligence: forty, agility: forty, fellowship: forty } },
                flags: { 'wh40k-rpg': { aboard: { vehicleUuid: vehicle.uuid, role: 'crew' } } },
            });
            if (crewman === null) return { ...empty, vehicleId: vehicle.id, error: 'the crewman was not created' };
            const sheet = vehicle.sheet;
            if (sheet === null) return { ...empty, vehicleId: vehicle.id, crewmanId: crewman.id, error: 'the Chimera has no sheet' };
            await sheet.render({ force: true });
            return {
                error: null,
                vehicleId: vehicle.id,
                crewmanId: crewman.id,
                sheetId: sheet.id,
                manoeuverability: vehicle.system.manoeuverability,
                testModifiers: vehicle.system.traitEffects?.testModifiers ?? [],
            };
        },
        { packId: CHIMERA_PACK, chimeraName: CHIMERA_NAME, crewmanName: CREWMAN_NAME },
    );
}

/** Delete the probe actors (closing their sheets). */
async function deleteProbeActors(page: Page, ids: readonly string[]): Promise<void> {
    await page.evaluate(async (actorIds: readonly string[]) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals, no repo types available in page.evaluate
        const g = globalThis as unknown as {
            game: { actors: { get: (id: string) => { sheet: { close: () => Promise<object> } | null; delete: () => Promise<object> } | undefined } };
        };
        for (const id of actorIds) {
            const actor = g.game.actors.get(id);
            // eslint-disable-next-line no-await-in-loop -- two probe actors, torn down in order
            await actor?.sheet?.close();
            // eslint-disable-next-line no-await-in-loop -- as above
            await actor?.delete();
        }
    }, ids);
}

test.describe.serial('Vehicle traits as mechanics (Tier B, content#28)', () => {
    test.setTimeout(scaledMs(180_000));
    test.use({ actionTimeout: scaledMs(15_000) });

    test('the Chimera shows its trait test modifiers and rules, and Repair rolls with a Rugged row', async ({ page }) => {
        await joinOrSkip(page);
        const probe = await createChimeraWithCrew(page);
        try {
            expect(probe.error, probe.error ?? '').toBeNull();
            // Printed line kept: Tracked Vehicle's −10 is already in the Chimera's +0.
            expect(probe.manoeuverability).toBe(0);
            expect(probe.testModifiers).toEqual(
                expect.arrayContaining([
                    { test: 'repair', value: 20, source: 'Rugged' },
                    { test: 'difficultTerrain', value: 10, source: 'Tracked Vehicle' },
                ]),
            );

            const sheet = page.locator(`#${probe.sheetId}`);
            const testsPanel = sheet.locator('.wh40k-panel:has([data-wh40k-hook="vehicle-trait-tests"])');
            const rulesPanel = sheet.locator('.wh40k-panel:has([data-wh40k-hook="vehicle-trait-rules"])');
            await expect(testsPanel.locator('li[data-test="repair"] [data-modifier-source="Rugged"]')).toHaveText('Rugged +20');
            await expect(testsPanel.locator('li[data-test="difficultTerrain"] [data-modifier-source="Tracked Vehicle"]')).toHaveText('Tracked Vehicle +10');
            await expect(rulesPanel.locator('[data-rule="crewExposure"]')).toHaveText('Crew: Enclosed');
            await expect(rulesPanel.locator('[data-rule="amphibious"]')).toBeVisible();
            await testsPanel.scrollIntoViewIfNeeded();
            expect(
                await snap(page, 'vehicle-traits-chimera-tests-panel', {
                    selector: `#${probe.sheetId} .wh40k-panel:has([data-wh40k-hook="vehicle-trait-tests"])`,
                }),
            ).not.toBeNull();
            expect(
                await snap(page, 'vehicle-traits-chimera-rules-panel', {
                    selector: `#${probe.sheetId} .wh40k-panel:has([data-wh40k-hook="vehicle-trait-rules"])`,
                }),
            ).not.toBeNull();

            // Repair: the crewman's Tech-Use test, with Rugged's +20 as a named row.
            await testsPanel.locator('[data-action="rollVehicleTest"][data-test="repair"]').click();
            const rollDialog = page.locator(ROLL_DIALOG).first();
            await expect(rollDialog).toBeVisible();
            await expect(rollDialog).toContainText('Tech-Use');
            await expect(rollDialog).toContainText('Rugged');
            expect(await snapWindow(page, 'vehicle-traits-rugged-repair-dialog', rollDialog)).not.toBeNull();

            const before = await chatMessageIds(page);
            await rollDialog.locator('[data-action="systemRoll"]').click();
            const card = await firstNewCard(page, before);
            expect(card.content).toContain('Rugged');
            expect(card.content).toContain('Vehicle trait: Rugged');
            expect(await snapChatCard(page, 'vehicle-traits-rugged-repair-card', card.id)).not.toBeNull();
        } finally {
            await deleteProbeActors(
                page,
                [probe.crewmanId, probe.vehicleId].filter((id) => id !== ''),
            );
        }
    });
});
