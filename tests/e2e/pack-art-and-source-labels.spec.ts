import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { foundryTestDataDir } from './lib/data-dir';
import { joinOrSkip } from './lib/join';
import { closeApp, openPackDocument, type PackDocumentRef } from './lib/pack-document';
import { packHoldingName } from './lib/pack-lookup';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B for three pack/sheet fixes, in a real Foundry with the private content
 * packs merged in by run-e2e.sh:
 *
 *  - #229: item sheets show the structured `system.source` through the one
 *    `sourceLabel` formatter — the psychic power sheet printed "[object Object]".
 *    Compendium documents are locked, so their sheets show the read-only label.
 *  - #626: pack art that was an extensionless Fandom `…/revision/latest?cb=…`
 *    URL now points at the extension-bearing file. Foundry rejected the old
 *    form at world launch (~1,744 "does not have a valid file extension"
 *    warnings in the server log) and swapped in its default icon, so the spec
 *    asserts the launch logged none, and that a sample of repointed actor and
 *    item art actually loads.
 *  - #627: portraits under `packs/images` that the content test reported missing
 *    (they were present; its resolver looked in the wrong tree) load in Foundry.
 *
 * Every surface is captured to .e2e-screenshots/ (game__pack-art-*.png) for review.
 */

const PORT = Number(process.env['FOUNDRY_TEST_PORT'] ?? 30001);

/** Foundry's message when an image FilePathField's value has no image extension. */
const EXTENSION_WARNING = 'does not have a valid file extension';

/** The log line Foundry writes when a world launch finishes. */
const LAUNCH_COMPLETE = '"message":"Launching World | Complete';

/** A `sourceLabel`-formatted reference: "<book>, p.<page>". */
const SOURCE_REFERENCE = /, p\.\d+/;

/**
 * A pack document to open, by pack id and document name. Art is shown on the
 * document's own sheet (an actor's portrait) or, for items whose sheets carry
 * no picture, as the thumbnail in the compendium window searched to the name.
 * `reveal` is a sheet action to click first when the sheet starts collapsed.
 */
interface Sample extends PackDocumentRef {
    label: string;
    reveal?: string;
}

/** Item sheets whose source reference must render as a label (#229). */
const SOURCE_SHEETS: readonly Sample[] = [
    { label: 'source-psychic-power', pack: packHoldingName({ line: 'bc', category: 'psychic-powers' }, 'Fire Barrage'), name: 'Fire Barrage', view: 'sheet' },
    // The weapon sheet opens on its compact stat summary; its details (with Acquisition → Source) are behind "Show Details".
    {
        label: 'source-weapon',
        pack: packHoldingName({ line: 'dh2', category: 'weapons' }, 'Bolt Pistol'),
        name: 'Bolt Pistol',
        view: 'sheet',
        reveal: 'toggleBody',
    },
    { label: 'source-talent', pack: packHoldingName({ line: 'dh2', category: 'talents' }, 'Adamantium Faith'), name: 'Adamantium Faith', view: 'sheet' },
];

/** Actors and items whose Fandom art was repointed to the file URL (#626). */
const FANDOM_SAMPLES: readonly Sample[] = [
    { label: 'fandom-actor-astropath', pack: packHoldingName({ line: 'dh2', category: 'actors-bestiary' }, 'Astropath'), name: 'Astropath', view: 'sheet' },
    { label: 'fandom-actor-apex-noble', pack: packHoldingName({ line: 'dh2', category: 'actors-bestiary' }, 'Apex Noble'), name: 'Apex Noble', view: 'sheet' },
    {
        label: 'fandom-actor-dark-eldar-grotesque',
        pack: packHoldingName({ line: 'dh2', category: 'actors-bestiary' }, 'Dark Eldar Grotesque'),
        name: 'Dark Eldar Grotesque',
        view: 'sheet',
    },
    // A Black Crusade NPC: its sheet crashed on open until #628.
    {
        label: 'fandom-actor-asphodel-kroot-warrior',
        pack: packHoldingName({ line: 'bc', category: 'actors-bestiary' }, 'Asphodel Kroot Warrior'),
        name: 'Asphodel Kroot Warrior',
        view: 'sheet',
    },
    { label: 'fandom-item-bolt-pistol', pack: packHoldingName({ line: 'dh2', category: 'weapons' }, 'Bolt Pistol'), name: 'Bolt Pistol', view: 'compendium' },
    { label: 'fandom-item-autocannon', pack: packHoldingName({ line: 'dh2', category: 'weapons' }, 'Autocannon'), name: 'Autocannon', view: 'compendium' },
    {
        label: 'fandom-item-archeotech-laspistol',
        pack: packHoldingName({ line: 'rt', category: 'weapons' }, 'Archeotech Laspistol'),
        name: 'Archeotech Laspistol',
        view: 'compendium',
    },
];

/** Actors whose `packs/images` portraits the content test wrongly reported missing (#627). */
const LOCAL_PORTRAIT_SAMPLES: readonly Sample[] = [
    {
        label: 'portrait-horror-of-tzeentch',
        pack: packHoldingName({ line: 'dh2', category: 'actors-bestiary' }, 'Horror of Tzeentch'),
        name: 'Horror of Tzeentch',
        view: 'sheet',
    },
    {
        label: 'portrait-screamer',
        pack: packHoldingName({ line: 'dh2', category: 'actors-bestiary' }, 'Screamer of Tzeentch'),
        name: 'Screamer of Tzeentch',
        view: 'sheet',
    },
    {
        label: 'portrait-nexene-turnkey',
        pack: packHoldingName({ line: 'dh2', category: 'actors-bestiary' }, 'Nexene Turnkey'),
        name: 'Nexene Turnkey',
        view: 'sheet',
    },
];

/**
 * The server's debug log lines from the most recent world launch: everything
 * after the previous `Launching World | Complete` up to the last one. Foundry
 * rotates the debug log at 10 MB, so every `debug.*.log` is read in write order.
 */
function lastLaunchLines(): string[] {
    const logs = resolve(foundryTestDataDir(PORT), 'Logs');
    const files = readdirSync(logs)
        .filter((f) => f.startsWith('debug.') && f.endsWith('.log'))
        .map((f) => resolve(logs, f))
        .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
    const lines = files.flatMap((f) => readFileSync(f, 'utf8').split('\n'));
    const completes = lines.flatMap((line, i) => (line.includes(LAUNCH_COMPLETE) ? [i] : []));
    const end = completes.at(-1);
    if (end === undefined) return [];
    const start = completes.at(-2) ?? -1;
    return lines.slice(start + 1, end + 1);
}

/**
 * Put the sample's art (or source label) on screen: run its `reveal` action,
 * and in a compendium window search to its name so its entry is the one shown.
 */
async function presentSample(page: Page, sample: Sample, appId: string): Promise<void> {
    const app = page.locator(`#${appId}`);
    // A real click: the view-only toggle stays enabled on a locked compendium sheet (#629).
    if (sample.reveal !== undefined) await app.locator(`[data-action="${sample.reveal}"]`).first().click();
    if (sample.view === 'compendium') await app.locator('input[name="search"]').fill(sample.name);
    await page.waitForTimeout(scaledMs(1_500));
}

interface ImgLoad {
    loaded: boolean;
    naturalWidth: number;
}

/** Load `src` in the page the way a sheet's portrait does and report whether it decoded. */
async function loadsInPage(page: Page, src: string): Promise<ImgLoad> {
    return page.evaluate(
        async ({ url, settleMs }) =>
            new Promise<ImgLoad>((done) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                const finish = (): void => done({ loaded: img.naturalWidth > 0, naturalWidth: img.naturalWidth });
                img.addEventListener('load', finish, { once: true });
                img.addEventListener('error', finish, { once: true });
                setTimeout(finish, settleMs);
                img.src = url;
            }),
        { url: src, settleMs: scaledMs(20_000) },
    );
}

/** The visible text of a rendered application. */
async function appText(page: Page, appId: string): Promise<string> {
    return page.locator(`#${appId}`).innerText();
}

/** Open each sample's sheet, check its art decodes, capture it, close it; returns the failures. */
async function checkArtSamples(page: Page, samples: readonly Sample[], expectPrefix: string): Promise<string[]> {
    const failures: string[] = [];
    for (const sample of samples) {
        const opened = await openPackDocument(page, sample);
        if (opened.appId === null || opened.img === null) {
            failures.push(`${sample.label}: ${opened.detail ?? 'sheet did not open'}`);
            continue;
        }
        if (!opened.img.startsWith(expectPrefix)) failures.push(`${sample.label}: img ${opened.img} is not ${expectPrefix}…`);
        const load = await loadsInPage(page, opened.img);
        if (!load.loaded) failures.push(`${sample.label}: ${opened.img} did not load`);
        await presentSample(page, sample, opened.appId);
        await snap(page, `pack-art-${sample.label}`, { selector: `#${opened.appId}`, closeWindows: true, keepWindow: opened.appId });
        await closeApp(page, opened.appId);
    }
    return failures;
}

/** Open each sheet, check its source renders as a formatted reference, capture it, close it; returns the failures. */
async function checkSourceSheets(page: Page, samples: readonly Sample[]): Promise<string[]> {
    const failures: string[] = [];
    for (const sample of samples) {
        const opened = await openPackDocument(page, sample);
        if (opened.appId === null) {
            failures.push(`${sample.label}: ${opened.detail ?? 'sheet did not open'}`);
            continue;
        }
        await presentSample(page, sample, opened.appId);
        const text = await appText(page, opened.appId);
        if (text.includes('[object Object]')) failures.push(`${sample.label}: renders [object Object]`);
        if (SOURCE_REFERENCE.exec(text) === null) failures.push(`${sample.label}: no formatted "Book, p.N" reference`);
        // Bring the reference into view so the capture shows it (the weapon's sits below the fold).
        else await page.locator(`#${opened.appId}`).getByText(SOURCE_REFERENCE).last().scrollIntoViewIfNeeded();
        await snap(page, `pack-art-${sample.label}`, { selector: `#${opened.appId}`, closeWindows: true, keepWindow: opened.appId });
        await closeApp(page, opened.appId);
    }
    return failures;
}

test.describe.serial('pack art and source labels (#229, #626, #627, Tier B)', () => {
    test.setTimeout(scaledMs(300_000));

    test('the world launch logs no image-extension validation warnings (#626)', async ({ page }) => {
        await joinOrSkip(page);
        const launch = lastLaunchLines();
        expect(launch.length, 'a completed world launch in the server debug log').toBeGreaterThan(0);
        const warnings = launch.filter((line) => line.includes(EXTENSION_WARNING));
        expect(
            warnings.map((w) => w.slice(0, 400)),
            'image-extension validation warnings at world launch',
        ).toEqual([]);
    });

    test('item sheets show their source reference as a label, never [object Object] (#229)', async ({ page }) => {
        await joinOrSkip(page);
        expect(await checkSourceSheets(page, SOURCE_SHEETS)).toEqual([]);
    });

    test('repointed Fandom actor and item art loads (#626)', async ({ page }) => {
        await joinOrSkip(page);
        expect(await checkArtSamples(page, FANDOM_SAMPLES, 'https://static.wikia.nocookie.net/')).toEqual([]);
    });

    test('packs/images portraits load (#627)', async ({ page }) => {
        await joinOrSkip(page);
        expect(await checkArtSamples(page, LOCAL_PORTRAIT_SAMPLES, 'systems/wh40k-rpg/packs/images/')).toEqual([]);
    });
});
