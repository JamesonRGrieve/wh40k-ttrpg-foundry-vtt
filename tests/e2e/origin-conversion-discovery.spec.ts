import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B for content#38: a homebrew conversion reaches DH2 with no stub.
 *
 * Fortress World is official in Only War and Rogue Trader and carries a homebrew
 * DH2 branch. DH2's packs hold no stub of it and its `gameSystems` leaves DH2
 * out, so DH2's compendium browser does not list it. The DH2 origin-path builder
 * discovers it from the OW pack and renders it with the adapted-homebrew
 * (shuffle) badge. The test opens the builder on a DH2 character, checks the
 * Fortress World card lists once with the badge, and checks no DH2 pack in the
 * compendium browser's results holds it.
 */

const BUILDER_MODULE_URL = '/systems/wh40k-rpg/module/applications/character-creation/origin-path-builder.js';
const BROWSER_MODULE_URL = '/systems/wh40k-rpg/module/applications/compendium-browser.js';
const FORTRESS_ID = 'a51ce4de508a699d';

interface ProbeActor {
    id: string;
    delete: () => Promise<void>;
}
interface ProbeBuilder {
    id: string;
    allOrigins?: Array<{ name?: string; uuid?: string | null }>;
    currentStepIndex: number;
    render: (force?: boolean) => Promise<void>;
    close: () => Promise<void>;
}
interface ProbeWindow {
    Actor: { create: (data: object) => Promise<ProbeActor | null> };
    game: { actors: { get: (id: string) => ProbeActor | undefined } };
    wh40kE2E: { pollUntil: (fn: () => boolean) => Promise<void>; settle: (ms: number) => Promise<void> };
    e2eConversionBuilder?: ProbeBuilder;
}

test.describe.serial('Homebrew conversions are discovered, not stubbed (Tier B, content#38)', () => {
    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
    });

    test('the DH2 builder lists Fortress World once, with the adapted-homebrew badge', async ({ page }) => {
        const opened = await page.evaluate(
            async ({ moduleUrl, fortressId }) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const w = globalThis as unknown as ProbeWindow;
                const actor = await w.Actor.create({ name: 'e2e-conversion-probe', type: 'dh2-character', system: { gameSystem: 'dh2' } });
                if (actor === null) throw new Error('Actor.create returned null');
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import of the built builder module
                const mod = (await import(moduleUrl)) as { default: new (actor: ProbeActor, options: object) => ProbeBuilder };
                const builder = new mod.default(actor, {});
                builder.currentStepIndex = 0;
                await builder.render(true);
                await w.wh40kE2E.pollUntil(() => (builder.allOrigins?.length ?? 0) > 0);
                await builder.render();
                await w.wh40kE2E.settle(150);
                w.e2eConversionBuilder = builder;
                const fortress = (builder.allOrigins ?? []).filter((o) => (o.uuid ?? '').endsWith(fortressId));
                return { builderId: builder.id, actorId: actor.id, fortress: fortress.map((o) => o.uuid ?? '') };
            },
            { moduleUrl: BUILDER_MODULE_URL, fortressId: FORTRESS_ID },
        );
        expect(opened.fortress, 'Fortress World lists once, from the OW pack').toEqual([
            compendiumUuid({ line: 'ow', category: 'origins-homeworlds' }, FORTRESS_ID),
        ]);

        const card = page.locator(`#${opened.builderId} [data-action="selectOriginCard"][data-origin-uuid$="${FORTRESS_ID}"]`);
        await expect(card).toHaveCount(1);
        await expect(card.locator('i.fa-shuffle')).toHaveCount(1);
        // Show only adapted conversions (#295 filter), so the screenshot shows Fortress World among them.
        const toggle = (category: string): ReturnType<typeof page.locator> =>
            page.locator(`#${opened.builderId} [data-action="toggleProvenanceFilter"][data-category="${category}"]`);
        await toggle('raw').click();
        await toggle('homebrew').click();
        await expect(card.locator('i.fa-shuffle')).toBeVisible();
        await clearScreenOverlays(page, opened.builderId);
        expect(await snap(page, 'origin-conversion-dh2-builder-fortress-world', { selector: `#${opened.builderId}` })).not.toBeNull();

        await page.evaluate(async (actorId) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            await w.e2eConversionBuilder?.close();
            await w.game.actors.get(actorId)?.delete();
        }, opened.actorId);
        recordCoverage('origin.builder', 'conversion.discovered.dh2');
    });

    test('no DH2 pack in the compendium browser holds Fortress World', async ({ page }) => {
        const dh2Hits = await page.evaluate(
            async ({ moduleUrl, fortressId }) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import of the built compendium browser module
                const mod = (await import(moduleUrl)) as {
                    RTCompendiumBrowser: new (options: object) => { _getFilteredResults: () => Promise<Array<{ packId: string; _id: string; name: string }>> };
                };
                const browser = new mod.RTCompendiumBrowser({});
                const results = await browser._getFilteredResults();
                return results.filter((r) => r._id === fortressId).map((r) => r.packId);
            },
            { moduleUrl: BROWSER_MODULE_URL, fortressId: FORTRESS_ID },
        );
        expect({ dh2: dh2Hits.filter((packId) => packId.startsWith('wh40k-rpg.dh2-')), anyLine: dh2Hits.length > 0 }).toEqual({ dh2: [], anyLine: true });
        recordCoverage('compendium-browser.flow', 'conversion.not-in-dh2');
    });
});
