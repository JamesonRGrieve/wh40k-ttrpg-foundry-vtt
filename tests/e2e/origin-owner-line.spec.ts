import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { addCompendiumItems, cleanupProbes, openProbeSheet, snapElement } from './occult-sheet-flow';

/**
 * Tier B for #690: an owned origin's sheet follows its owning actor's line.
 *
 * RT's Void Born is a stub of DH2's Voidborn, so its own `gameSystem` is DH2's. The
 * sheet took its step options and grant fields from that, so an RT character's
 * Void Born showed DH2's "Blessed by Emperor". It now uses the owning actor's line,
 * by the rule the variant resolver follows: RT's steps, and Fate, without the
 * Emperor's Blessing.
 */

const RT_VOID_BORN = 'Compendium.wh40k-rpg.rt-core-origins-homeworlds.Item.DH2VdBrn00000006';
/** Rogue Trader's origin steps, in builder order (rt-config.ts `getOriginPathStepKeys`). */
const RT_STEPS = ['homeWorld', 'birthright', 'lureOfTheVoid', 'trialsAndTravails', 'motivation', 'career', 'lineage', 'eliteAdvance'];

interface ProbeSheet {
    id: string;
    render: (opts: { force: boolean }) => Promise<void>;
}
interface ProbeActor {
    items: { get: (id: string) => { sheet: ProbeSheet } | undefined };
}
interface ProbeWindow {
    game: { actors: { get: (id: string) => ProbeActor | undefined } };
}

test.describe.serial('owned origin follows its owner’s line (Tier B, #690)', () => {
    test.afterEach(async ({ page }) => {
        await cleanupProbes(page);
    });

    test('an RT character’s Void Born shows RT’s steps and Fate, without the Emperor’s Blessing', async ({ page }) => {
        await joinOrSkip(page);
        const { actorId } = await openProbeSheet(page, { name: 'Void Born Explorer', type: 'rt-character', system: { gameSystem: 'rt' } });
        const [originId] = await addCompendiumItems(page, actorId, [RT_VOID_BORN]);
        const sheetId = await page.evaluate(
            async ({ actor, item }) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const origin = (globalThis as unknown as ProbeWindow).game.actors.get(actor)?.items.get(item);
                if (origin === undefined) throw new Error(`origin ${item} missing`);
                await origin.sheet.render({ force: true });
                return origin.sheet.id;
            },
            { actor: actorId, item: originId },
        );
        const sheet = page.locator(`#${sheetId}`);
        await expect(sheet).toBeVisible();
        await expect(sheet.locator('select[name="system.step"]')).toHaveValue('homeWorld');
        expect(await sheet.locator('select[name="system.step"] option').evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value))).toEqual(
            RT_STEPS,
        );
        await expect(sheet.locator('input[name="system.grants.fateThreshold"]')).toHaveCount(1);
        await expect(sheet.locator('input[name="system.grants.blessedByEmperor"]')).toHaveCount(0);
        await snapElement(page, 'rt-owned-voidborn-no-emperor-blessing', `#${sheetId}`, sheetId);
        recordCoverage('sheet.render', 'originPath.ownerLine.rt');
    });
});
