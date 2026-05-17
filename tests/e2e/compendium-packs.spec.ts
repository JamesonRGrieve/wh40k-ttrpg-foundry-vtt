import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Materializes every compendium pack shipped with the system. `pack.getDocuments()`
 * is the higher-coverage probe over `getIndex()` because it instantiates each
 * document through its DataModel — exercising `defineSchema`, `migrateData`,
 * `prepareBaseData`, and `prepareDerivedData` on every item/actor in the pack.
 *
 * Strategy: partitioned by pack-name prefix (one test() per source line —
 * `bc`, `dh1`, `dh2`, `dw`, `hb`, `ow`, `rt`). Each test loads its packs in
 * batches of 6 via Promise.all inside a single page.evaluate, so wall time
 * stays bounded while a failure in one source line doesn't black out the rest.
 *
 * Per-pack errors are collected (one bad pack does not kill the sweep) and
 * asserted at the end of the test with the full failure list. Successful
 * pack reads record coverage under the `compendium.pack-read` dimension.
 */

interface PackResult {
    id: string;
    documentCount: number | null;
    error: string | null;
}

const BATCH_SIZE = 6;

async function loadPackBatch(
    page: import('@playwright/test').Page,
    packIds: string[],
): Promise<PackResult[]> {
    return page.evaluate(
        async ({ packIds, batchSize }) => {
            const game = (
                globalThis as unknown as {
                    game?: {
                        packs?: {
                            get: (id: string) => {
                                getDocuments: () => Promise<Array<unknown>>;
                            } | undefined;
                        };
                    };
                }
            ).game;
            const results: Array<{ id: string; documentCount: number | null; error: string | null }> = [];
            if (!game?.packs) {
                for (const id of packIds) {
                    results.push({ id, documentCount: null, error: 'game.packs unavailable' });
                }
                return results;
            }
            for (let i = 0; i < packIds.length; i += batchSize) {
                const slice = packIds.slice(i, i + batchSize);
                const sliceResults = await Promise.all(
                    slice.map(async (id) => {
                        const pack = game.packs!.get(id);
                        if (!pack) {
                            return { id, documentCount: null, error: 'pack not found' };
                        }
                        try {
                            const docs = await pack.getDocuments();
                            return { id, documentCount: docs.length, error: null };
                        } catch (err) {
                            return {
                                id,
                                documentCount: null,
                                error: String((err as Error)?.message ?? err),
                            };
                        }
                    }),
                );
                for (const r of sliceResults) results.push(r);
            }
            return results;
        },
        { packIds, batchSize: BATCH_SIZE },
    );
}

async function listPackIds(page: import('@playwright/test').Page): Promise<string[]> {
    return page.evaluate(() => {
        const game = (
            globalThis as unknown as {
                game?: { packs?: { keys: () => IterableIterator<string> } };
            }
        ).game;
        return game?.packs ? Array.from(game.packs.keys()) : [];
    });
}

/**
 * Pack ID format is `wh40k-rpg.<prefix>-<rest>`. The prefix segment (left of
 * the first hyphen in the local name) identifies the source line.
 */
function prefixOf(packId: string): string {
    const localName = packId.includes('.') ? packId.slice(packId.indexOf('.') + 1) : packId;
    const dash = localName.indexOf('-');
    return dash === -1 ? localName : localName.slice(0, dash);
}

// Source-line partitions. Mirrors the prefixes present in src/system.json.
const PACK_PREFIXES = ['bc', 'dh1', 'dh2', 'dw', 'hb', 'ow', 'rt'] as const;

test.describe.serial('compendium packs (Tier B)', () => {
    let allPackIds: string[] = [];

    test.beforeAll(async ({ browser }) => {
        const page = await browser.newPage();
        const joined = await joinAsGM(page);
        if (!joined) {
            await page.close();
            return;
        }
        allPackIds = await listPackIds(page);
        await page.close();
    });

    for (const prefix of PACK_PREFIXES) {
        test(`every '${prefix}-*' compendium pack materializes via getDocuments()`, async ({ page }) => {
            const joined = await joinAsGM(page);
            test.skip(!joined, 'GM join failed');
            const packIds = allPackIds.filter((id) => prefixOf(id) === prefix);
            test.skip(packIds.length === 0, `no '${prefix}-*' packs declared in manifest`);
            const results = await loadPackBatch(page, packIds);
            const failures: string[] = [];
            for (const r of results) {
                if (r.error !== null || r.documentCount === null) {
                    failures.push(`${r.id}: ${r.error ?? 'no documents returned'}`);
                    continue;
                }
                recordCoverage('compendium.pack-read', r.id);
            }
            expect(
                failures,
                `${failures.length}/${packIds.length} '${prefix}-*' packs failed to materialize:\n  - ${failures.join('\n  - ')}`,
            ).toEqual([]);
        });
    }
});
