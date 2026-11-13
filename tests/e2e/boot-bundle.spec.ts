import type { Page, Response as PlaywrightResponse } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the bundled client build (#705). The system ships one
 * minified ES module (`module/wh40k-rpg.js`, built by esbuild), so boot fetches
 * that one script and no per-file modules.
 *
 * - `boot-fetches-one-module`: one JS request under `/systems/wh40k-rpg/module/`
 *   while joining the world. The request count, bytes and time to `ready` are
 *   attached to the test as annotations, for the before/after measurement.
 * - `class-names-survive-minify`: Foundry builds sheet ids from class names
 *   (`wh40k-rpg.DarkHeresy2PlayerSheet`), and worlds store those ids, so
 *   minifying must keep them (`keepNames`).
 * - `module-map-shares-instances`: the bundle's `modules` export, and the
 *   per-file URLs the fixture serves as shims over it, return the live
 *   instances the system booted with.
 *
 * - `templates-load-without-requests` (#708): the bundle registers every template
 *   before `init`, so neither boot nor opening a character sheet asks the server
 *   for one of the system's templates (Foundry's `template` socket request;
 *   Foundry's own core UI templates still load that way).
 *
 * Each flow records under `boot-bundle.flow`. Keys MUST match BOOT_BUNDLE_FLOWS
 * in scripts/e2e-coverage.mjs.
 */

const BOOT_BUNDLE_FLOWS = ['boot-fetches-one-module', 'class-names-survive-minify', 'module-map-shares-instances', 'templates-load-without-requests'] as const;
type FlowName = (typeof BOOT_BUNDLE_FLOWS)[number];

const MODULE_PATH = '/systems/wh40k-rpg/module/';

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

interface BootRequest {
    url: string;
    bytes: number;
}

/** Record every system JS module the page fetches until `stop()`. */
function watchModuleRequests(page: Page): { requests: BootRequest[]; stop: () => Promise<void> } {
    const requests: BootRequest[] = [];
    const pending: Array<Promise<void>> = [];
    const onResponse = (response: PlaywrightResponse): void => {
        const url = new URL(response.url());
        if (!url.pathname.startsWith(MODULE_PATH) || !url.pathname.endsWith('.js')) return;
        pending.push(
            response
                .body()
                .then((body) => {
                    requests.push({ url: url.pathname, bytes: body.length });
                })
                .catch(() => {
                    requests.push({ url: url.pathname, bytes: 0 });
                }),
        );
    };
    page.on('response', onResponse);
    return {
        requests,
        stop: async (): Promise<void> => {
            page.off('response', onResponse);
            await Promise.all(pending);
        },
    };
}

async function probeBundle(page: Page): Promise<FlowResult[]> {
    return page.evaluate(async (modulePath): Promise<FlowResult[]> => {
        const out: FlowResult[] = [];
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            CONFIG: { Actor: { sheetClasses: Record<string, Record<string, { id: string; cls: { name: string } }>> } };
            game: { settings: { get: (ns: string, key: string) => boolean } };
        };

        // 2. sheet ids and class names keep their source names
        const sheets = Object.values(g.CONFIG.Actor.sheetClasses).flatMap((byId) => Object.values(byId));
        const ours = sheets.filter((s) => s.id.startsWith('wh40k-rpg.'));
        const mangled = ours.filter((s) => s.cls.name.length < 4 || s.id !== `wh40k-rpg.${s.cls.name}`).map((s) => `${s.id}/${s.cls.name}`);
        const hasCharacter = ours.some((s) => s.id === 'wh40k-rpg.DarkHeresy2PlayerSheet');
        out.push({
            name: 'class-names-survive-minify',
            ok: ours.length > 0 && mangled.length === 0 && hasCharacter,
            detail: `${ours.length} system sheets; DH2 player sheet ${hasCharacter ? 'found' : 'missing'}; mangled ${mangled.slice(0, 5).join(', ')}`,
        });

        // 3. the entry's module map, and a per-file shim, hold the booted instances
        const entry = (await import(/* @vite-ignore */ `${modulePath}wh40k-rpg.js`)) as {
            modules: Partial<Record<string, { WH40KSettings?: { isResyncOnReadyEnabled: () => boolean } }>>;
        };
        const settingsFromMap = entry.modules['wh40k-rpg-settings']?.WH40KSettings;
        const shim = (await import(/* @vite-ignore */ `${modulePath}wh40k-rpg-settings.js`)) as { WH40KSettings?: object };
        const sameInstance = settingsFromMap !== undefined && shim.WH40KSettings === settingsFromMap;
        const readsLiveSetting = settingsFromMap?.isResyncOnReadyEnabled() === g.game.settings.get('wh40k-rpg', 'resync-on-ready');
        out.push({
            name: 'module-map-shares-instances',
            ok: sameInstance && readsLiveSetting,
            detail: `${Object.keys(entry.modules).length} modules; shim shares instance ${sameInstance}; reads live setting ${readsLiveSetting}`,
        });
        return out;
    }, MODULE_PATH);
}

/** Foundry logs this for every template it fetches over the socket and compiles (`getTemplate`). */
const FETCHED_TEMPLATE = /Retrieved and compiled template (systems\/wh40k-rpg\/\S+)/;

/** Record the system templates Foundry fetches from now on (its own core UI templates still load that way). */
function watchTemplateFetches(page: Page): string[] {
    const fetched: string[] = [];
    page.on('console', (message) => {
        const match = FETCHED_TEMPLATE.exec(message.text());
        if (match?.[1] !== undefined) fetched.push(match[1]);
    });
    return fetched;
}

/** No system template fetched during boot, nor while a fresh DH2 character sheet renders its parts. */
async function probeTemplateRequests(page: Page, fetched: readonly string[]): Promise<FlowResult> {
    const atBoot = fetched.length;
    const parts = await page.evaluate(async (): Promise<number> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            Actor: {
                create: (
                    data: object,
                ) => Promise<{ delete: () => Promise<void>; sheet: { rendered: boolean; render: (o: object) => Promise<void>; element: HTMLElement } } | null>;
            };
        };
        const actor = await g.Actor.create({ name: 'probe-template-requests', type: 'dh2-character', system: { gameSystem: 'dh2' } });
        if (actor === null) return -1;
        try {
            await actor.sheet.render({ force: true });
            await globalThis.wh40kE2E.waitFor(() => actor.sheet.rendered, 'character sheet render', globalThis.wh40kE2E.scaledMs(15_000));
            return actor.sheet.element.querySelectorAll('[data-application-part]').length;
        } finally {
            await actor.delete();
        }
    });
    return {
        name: 'templates-load-without-requests',
        ok: fetched.length === 0 && parts > 0,
        detail: `${atBoot} system templates fetched at boot, ${fetched.length - atBoot} opening a sheet (${parts} parts): ${fetched.slice(0, 5).join(', ')}`,
    };
}

test.describe.serial('the bundled client build (Tier B, #705)', () => {
    test.setTimeout(scaledMs(180_000));
    test('boot loads one minified module that keeps class names and shares its instances', async ({ page }, testInfo) => {
        // Time to `ready`, measured in the /game document from its navigation start.
        await page.addInitScript(() => {
            const started = performance.now();
            const timer = setInterval(() => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's `game` global is injected by the licensed app; no shipped types
                const foundryGame = (globalThis as unknown as { game?: { ready?: boolean } }).game;
                if (foundryGame?.ready === true) {
                    clearInterval(timer);
                    (globalThis as typeof globalThis & { wh40kReadyMs?: number }).wh40kReadyMs = Math.round(performance.now() - started);
                }
            }, 10);
        });
        const watch = watchModuleRequests(page);
        const fetchedTemplates = watchTemplateFetches(page);
        await joinOrSkip(page);
        await watch.stop();

        const bootRequests = watch.requests;
        const bootBytes = bootRequests.reduce((sum, r) => sum + r.bytes, 0);
        const readyMs = await page.evaluate(() => (globalThis as typeof globalThis & { wh40kReadyMs?: number }).wh40kReadyMs ?? -1);
        const measurement = `${bootRequests.length} JS requests, ${(bootBytes / 1024).toFixed(0)} KB, ready after ${readyMs} ms`;
        testInfo.annotations.push({ type: 'boot', description: measurement });
        process.stdout.write(`[boot-bundle] ${measurement}\n`);

        const onlyEntry = bootRequests.length === 1 && bootRequests[0]?.url === `${MODULE_PATH}wh40k-rpg.js`;
        const results: FlowResult[] = [
            {
                name: 'boot-fetches-one-module',
                ok: onlyEntry,
                detail: `${measurement}: ${bootRequests
                    .slice(0, 5)
                    .map((r) => r.url)
                    .join(', ')}`,
            },
            ...(await probeBundle(page)),
            await probeTemplateRequests(page, fetchedTemplates),
        ];

        const fired = new Map(results.map((r) => [r.name, r]));
        const failures: string[] = [];
        for (const flow of BOOT_BUNDLE_FLOWS) {
            const result = fired.get(flow);
            if (result?.ok === true) recordCoverage('boot-bundle.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
