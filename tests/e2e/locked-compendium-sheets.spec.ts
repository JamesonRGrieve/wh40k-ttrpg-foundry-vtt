import type { Page } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { closeApp, openPackDocument, type PackDocumentRef } from './lib/pack-document';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B for two locked-compendium-sheet fixes, in a real Foundry with the
 * private content packs merged in by run-e2e.sh:
 *
 *  - #628: every Black Crusade compendium NPC sheet crashed on open with
 *    "advances is not iterable". NPCSheet inherited the character's per-system
 *    panel table and built the BC Alignment panel from a ledger only the
 *    character DataModel has. Every `bc-npc` in every BC pack is opened here,
 *    and a sample from several packs is captured.
 *  - #629: a locked compendium sheet disabled every button, its view-only
 *    toggles included, so a viewer could not open a weapon's details. The
 *    weapon's "Show Details" is clicked for real and the expanded sheet captured.
 *
 * Captures land in .e2e-screenshots/ (game__locked-*.png) for review.
 */

/** BC NPCs from several packs, captured with their sheets open. */
const BC_NPC_SAMPLES: ReadonlyArray<PackDocumentRef & { label: string }> = [
    { label: 'bc-npc-asphodel-kroot-warrior', pack: 'bc-blood-actors-bestiary', name: 'Asphodel Kroot Warrior', view: 'sheet' },
    { label: 'bc-npc-bloodletter', pack: 'bc-core-actors-bestiary', name: 'Bloodletter', view: 'sheet' },
    { label: 'bc-npc-axsenaea', pack: 'bc-core-actors-npcs', name: "Ax'senaea", view: 'sheet' },
    { label: 'bc-npc-glimmerclaw', pack: 'bc-excess-actors-mounts', name: 'Glimmerclaw', view: 'sheet' },
    { label: 'bc-npc-beast-of-nurgle', pack: 'bc-decay-actors-bestiary', name: 'Beast of Nurgle', view: 'sheet' },
];

/** A compendium weapon whose details sit behind "Show Details". */
const LOCKED_WEAPON: PackDocumentRef = { pack: 'dh2-core-items-weapons', name: 'Bolt Pistol', view: 'sheet' };

/** The number of `bc-npc` actors across the BC packs when this spec was written (263). */
const MIN_BC_NPCS = 250;

interface SweepResult {
    opened: number;
    failures: string[];
}

/** Open, then close, the sheet of every `bc-npc` actor in every Black Crusade actor pack. */
async function openEveryBcNpcSheet(page: Page): Promise<SweepResult> {
    return page.evaluate(async (): Promise<SweepResult> => {
        interface SheetLike {
            rendered: boolean;
            element: HTMLElement | null;
            render: (o: { force: boolean }) => Promise<object>;
            close: (o: { animate: boolean }) => Promise<void>;
        }
        interface ActorLike {
            name: string;
            type: string;
            sheet: SheetLike;
        }
        interface PackLike {
            collection: string;
            documentName: string;
            getDocuments: () => Promise<ActorLike[]>;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game.packs` is injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { packs: Iterable<PackLike> } };
        const { pollUntil } = globalThis.wh40kE2E;
        const result: SweepResult = { opened: 0, failures: [] };
        for (const pack of g.game.packs) {
            if (pack.documentName !== 'Actor' || !pack.collection.startsWith('wh40k-rpg.bc-')) continue;
            for (const actor of await pack.getDocuments()) {
                if (actor.type !== 'bc-npc') continue;
                const where = `${pack.collection} / ${actor.name}`;
                try {
                    await actor.sheet.render({ force: true });
                    const rendered = await pollUntil(() => actor.sheet.rendered && actor.sheet.element?.querySelector('[data-application-part]') !== null);
                    if (rendered) result.opened += 1;
                    else result.failures.push(`${where}: sheet did not render`);
                } catch (err) {
                    result.failures.push(`${where}: ${err instanceof Error ? err.message : String(err)}`);
                }
                await actor.sheet.close({ animate: false });
            }
        }
        return result;
    });
}

test.describe.serial('locked compendium sheets (#628, #629, Tier B)', () => {
    test.setTimeout(scaledMs(600_000));

    test('every Black Crusade compendium NPC sheet opens (#628)', async ({ page }) => {
        await joinOrSkip(page);
        const sweep = await openEveryBcNpcSheet(page);
        expect(sweep.failures).toEqual([]);
        expect(sweep.opened).toBeGreaterThanOrEqual(MIN_BC_NPCS);
    });

    test('BC compendium NPC sheets from several packs render (#628)', async ({ page }) => {
        await joinOrSkip(page);
        const failures: string[] = [];
        for (const sample of BC_NPC_SAMPLES) {
            const opened = await openPackDocument(page, sample);
            if (opened.appId === null) {
                failures.push(`${sample.label}: ${opened.detail ?? 'sheet did not open'}`);
                continue;
            }
            const app = page.locator(`#${opened.appId}`);
            await expect(app.locator('input[name="name"]').first()).toHaveValue(sample.name);
            // The BC Overview panels belong to characters; an NPC sheet builds none.
            await expect(app.locator('.wh40k-bc-alignment-panel')).toHaveCount(0);
            await page.waitForTimeout(scaledMs(1_000));
            await snap(page, `locked-${sample.label}`, { selector: `#${opened.appId}`, closeWindows: true, keepWindow: opened.appId });
            await closeApp(page, opened.appId);
        }
        expect(failures).toEqual([]);
    });

    test('a locked compendium weapon expands its details through a real click (#629)', async ({ page }) => {
        await joinOrSkip(page);
        const opened = await openPackDocument(page, LOCKED_WEAPON);
        expect(opened.detail).toBeNull();
        const appId = opened.appId ?? '';
        const app = page.locator(`#${appId}`);
        const body = app.locator('.wh40k-weapon-body');
        const showDetails = app.locator('button[data-action="toggleBody"]');

        // Locked: editing controls are disabled, the view-only toggle is not.
        await expect(app.locator('input[name="name"]').first()).toBeDisabled();
        await expect(showDetails).toBeEnabled();
        await expect(body).toHaveClass(/\bcollapsed\b/);
        await snap(page, 'locked-weapon-collapsed', { selector: `#${appId}`, closeWindows: true, keepWindow: appId });

        await showDetails.click();
        await expect(body).not.toHaveClass(/\bcollapsed\b/);
        await expect(showDetails).toHaveAttribute('title', 'Hide Details');
        await app
            .getByText(/, p\.\d+/)
            .last()
            .scrollIntoViewIfNeeded();
        await page.waitForTimeout(scaledMs(1_000));
        await snap(page, 'locked-weapon-details-expanded', { selector: `#${appId}`, closeWindows: true, keepWindow: appId });
        await closeApp(page, appId);
    });
});
