import type { Page } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { packHoldingId } from './lib/pack-lookup';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B (#699): a line's standard ammunition reads like the book in its
 * compendium window. Bullets is "Bullets", not "! Default: Bullets", and the
 * document carries `system.standard`, the flag the origin-path builder reads
 * to keep it out of the equipment choices.
 *
 * Runs against the private content packs that run-e2e.sh merges in.
 */

const PACKS = [
    { label: 'rt', pack: `wh40k-rpg.${packHoldingId({ line: 'rt', category: 'ammo' }, 'eL4d1DHTGk2liwNm')}`, id: 'eL4d1DHTGk2liwNm', name: 'Bullets' },
    {
        label: 'dh2',
        pack: `wh40k-rpg.${packHoldingId({ line: 'dh2', category: 'ammo' }, 'oWd8OrE8AYBL48Mx')}`,
        id: 'oWd8OrE8AYBL48Mx',
        name: 'Backpack Ammo/Power Pack',
    },
] as const;

interface ProbeApp {
    id: string;
    close: () => Promise<void>;
}
interface ProbePack {
    render: (o: { force: boolean }) => Promise<void>;
    apps: ProbeApp[];
    getDocument: (id: string) => Promise<{ name: string; system: { standard?: boolean } } | null>;
}
interface ProbeWindow {
    game: { packs: { get: (id: string) => ProbePack | undefined } };
}

/** Open `packId`'s compendium window and return its app id plus the entry's stored name and flag. */
async function openPack(page: Page, packId: string, entryId: string): Promise<{ appId: string; name: string; standard: boolean | undefined }> {
    return page.evaluate(
        async ({ id, entry }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            const pack = w.game.packs.get(id);
            if (pack === undefined) throw new Error(`pack ${id} is not loaded`);
            const doc = await pack.getDocument(entry);
            if (doc === null) throw new Error(`entry ${entry} is not in ${id}`);
            await pack.render({ force: true });
            return { appId: pack.apps[0]?.id ?? '', name: doc.name, standard: doc.system.standard };
        },
        { id: packId, entry: entryId },
    );
}

test.describe.serial('standard ammunition names (Tier B, #699)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(
            async (ids) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const w = globalThis as unknown as ProbeWindow;
                for (const id of ids) for (const app of w.game.packs.get(id)?.apps ?? []) await app.close();
            },
            PACKS.map((p) => p.pack),
        );
    });

    for (const sample of PACKS) {
        test(`the ${sample.label} standard ammunition is named like the book and flagged standard`, async ({ page }) => {
            await joinOrSkip(page);
            const opened = await openPack(page, sample.pack, sample.id);
            expect(opened.name).toBe(sample.name);
            expect(opened.standard).toBe(true);

            const win = page.locator(`#${opened.appId}`);
            await expect(win.locator(`[data-entry-id="${sample.id}"]`)).toContainText(sample.name);
            // No entry in the window carries the old editorial prefix.
            await expect(win).not.toContainText('! Default');

            await clearScreenOverlays(page, opened.appId);
            await snap(page, `standard-ammunition-${sample.label}-pack`, { selector: `#${opened.appId}` });
        });
    }
});
