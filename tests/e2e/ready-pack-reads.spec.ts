import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the system's `ready` work (#706). Every compendium read
 * the client makes between Foundry's `ready` hook and the world-time widget
 * appearing (the end of `HooksManager.ready`) is recorded by wrapping the
 * client database backend at `setup`.
 *
 * - `ready-indexes-each-pack-once`: no pack's index is requested more than once.
 *   Readers go through `readPackIndex` (`utils/pack-index.ts`), which asks once
 *   for every field the pack's readers need and shares a request in flight.
 * - `ready-reads-no-pack-documents`: the index builders and the skill tooltips
 *   read pack indexes, not whole documents. In a world whose actors own
 *   compendium items, the hydration join and origin reapplication do read whole
 *   documents; the seed world has none, so any document read here is a reader
 *   that should be using the index.
 * - `skill-tooltips-from-index`: the skill tooltip cache, now filled from the DH2
 *   skills pack's index rows, holds every skill with its per-line `uses` resolved
 *   to a string (the pack authors it as `{ dh2: … }`).
 *
 * The counts and the ready time are attached as annotations, for the before and
 * after measurement. Each flow records under `ready-pack-reads.flow`. Keys MUST
 * match READY_PACK_READS_FLOWS in scripts/e2e-coverage.mjs.
 */

const READY_PACK_READS_FLOWS = ['ready-indexes-each-pack-once', 'ready-reads-no-pack-documents', 'skill-tooltips-from-index'] as const;
type FlowName = (typeof READY_PACK_READS_FLOWS)[number];

const WIDGET_ID = 'wh40k-world-time-widget';

interface PackRead {
    pack: string;
    index: boolean;
    ids: number;
    stack: string;
}

interface GameSettingsLike {
    get: (ns: string, key: string) => string;
    set: (ns: string, key: string, value: string) => Promise<object>;
}

interface ReadyLog {
    reads: PackRead[];
    readyMs: number;
    widgetMs: number;
}

/** Install the recorder before Foundry boots; it arms itself at `setup`. */
async function installRecorder(page: Page): Promise<void> {
    await page.addInitScript((widgetId: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            Hooks?: { once: (hook: string, fn: () => void) => void };
            CONFIG: {
                DatabaseBackend: {
                    _getDocuments: (
                        cls: object,
                        operation: { pack?: string; index?: boolean; query?: { _id?: { $in?: string[] } } },
                        user: object,
                    ) => Promise<object[]>;
                };
            };
            wh40kReadyLog?: ReadyLog;
        };
        const log: ReadyLog = { reads: [], readyMs: -1, widgetMs: -1 };
        g.wh40kReadyLog = log;
        let armed = false;
        const arm = (): void => {
            g.Hooks?.once('setup', () => {
                const backend = g.CONFIG.DatabaseBackend;
                const original = backend._getDocuments.bind(backend);
                backend._getDocuments = async (cls, operation, user) => {
                    if (operation.pack !== undefined && log.readyMs >= 0 && log.widgetMs < 0) {
                        log.reads.push({
                            pack: operation.pack,
                            index: operation.index === true,
                            ids: operation.query?._id?.$in?.length ?? -1,
                            stack: (new Error().stack ?? '').split('\n').slice(2, 7).join(' | '),
                        });
                    }
                    return original(cls, operation, user);
                };
            });
            g.Hooks?.once('ready', () => {
                log.readyMs = performance.now();
                const timer = setInterval(() => {
                    if (document.getElementById(widgetId) !== null) {
                        clearInterval(timer);
                        log.widgetMs = performance.now();
                    }
                }, 10);
            });
        };
        const waitForHooks = setInterval(() => {
            if (armed || g.Hooks === undefined) return;
            armed = true;
            clearInterval(waitForHooks);
            arm();
        }, 1);
    }, WIDGET_ID);
}

test.describe.serial('compendium reads on ready (Tier B, #706)', () => {
    test.setTimeout(scaledMs(180_000));
    test('ready indexes each pack once and reads no whole pack documents for its indexes', async ({ page }, testInfo) => {
        await installRecorder(page);
        await joinOrSkip(page);
        // Measure a DH2 world (the canonical default line), whatever an earlier spec left
        // the world on: the line decides which skills pack the tooltips read (#706).
        const previousLine = await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const settings = (globalThis as unknown as { game: { settings: GameSettingsLike } }).game.settings;
            const before = settings.get('wh40k-rpg', 'primary-game-system');
            await settings.set('wh40k-rpg', 'primary-game-system', 'dh2');
            return before;
        });
        await page.reload();
        await page.waitForFunction(() => (globalThis as typeof globalThis & { wh40kReadyLog?: ReadyLog }).wh40kReadyLog?.widgetMs !== -1, undefined, {
            timeout: scaledMs(60_000),
        });
        const log = await page.evaluate(() => (globalThis as typeof globalThis & { wh40kReadyLog?: ReadyLog }).wh40kReadyLog ?? null);
        await page.evaluate(async (line: string) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            await (globalThis as unknown as { game: { settings: GameSettingsLike } }).game.settings.set('wh40k-rpg', 'primary-game-system', line);
        }, previousLine);
        expect(log, 'the ready recorder was not installed').not.toBeNull();
        if (log === null) return;

        const indexReads = log.reads.filter((r) => r.index);
        const docReads = log.reads.filter((r) => !r.index);
        const perPack = new Map<string, number>();
        for (const read of indexReads) perPack.set(read.pack, (perPack.get(read.pack) ?? 0) + 1);
        const repeated = [...perPack].filter(([, n]) => n > 1).map(([pack, n]) => `${pack}×${n}`);
        const measurement = `${indexReads.length} index reads over ${perPack.size} packs, ${docReads.length} document reads, ready → widget ${Math.round(
            log.widgetMs - log.readyMs,
        )} ms`;
        testInfo.annotations.push({ type: 'ready', description: measurement });
        process.stdout.write(`[ready-pack-reads] ${measurement}\n`);
        for (const read of docReads.slice(0, 5)) process.stdout.write(`[ready-pack-reads] doc ${read.pack} ids=${read.ids} ${read.stack}\n`);
        const repeatedPacks = new Set([...perPack].filter(([, n]) => n > 1).map(([pack]) => pack));
        for (const read of indexReads.filter((r) => repeatedPacks.has(r.pack))) process.stdout.write(`[ready-pack-reads] index ${read.pack} ${read.stack}\n`);

        const results: Array<{ name: FlowName; ok: boolean; detail: string }> = [
            { name: 'ready-indexes-each-pack-once', ok: repeated.length === 0, detail: `re-indexed: ${repeated.slice(0, 10).join(', ')}` },
            {
                name: 'ready-reads-no-pack-documents',
                ok: docReads.length === 0,
                detail: `document reads: ${docReads
                    .slice(0, 10)
                    .map((r) => r.pack)
                    .join(', ')}`,
            },
        ];
        const tooltips = await page.evaluate(() => {
            type TooltipGlobals = { game: { wh40k: { tooltips?: { skillDescriptions: Map<string, Record<string, string | boolean | string[]>> } } } };
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as TooltipGlobals;
            const cache = g.game.wh40k.tooltips?.skillDescriptions;
            const entries = cache === undefined ? [] : [...cache.values()];
            const unresolved = entries.filter((e) => typeof e['uses'] !== 'string' || typeof e['descriptor'] !== 'string').map((e) => String(e['name']));
            return { count: entries.length, unresolved, withUses: entries.filter((e) => e['uses'] !== '').length };
        });
        results.push({
            name: 'skill-tooltips-from-index',
            ok: tooltips.count >= 20 && tooltips.unresolved.length === 0 && tooltips.withUses > 0,
            detail: `${tooltips.count} skills cached, ${tooltips.withUses} with uses; unresolved ${tooltips.unresolved.slice(0, 5).join(', ')}`,
        });
        const fired = new Map(results.map((r) => [r.name, r]));
        const failures: string[] = [];
        for (const flow of READY_PACK_READS_FLOWS) {
            const result = fired.get(flow);
            if (result?.ok === true) recordCoverage('ready-pack-reads.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
