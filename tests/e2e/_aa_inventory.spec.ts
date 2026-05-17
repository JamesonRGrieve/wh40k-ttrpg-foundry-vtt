import { writeFileSync, existsSync, unlinkSync, rmSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { trackerPath } from './lib/coverage-tracker';
import { joinAsGM, GAME_SYSTEM_IDS } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Runs first (alphabetically by filename). Dumps the enumerable inventory
 * of Foundry surfaces exposed by the loaded wh40k-rpg system into
 * `.e2e-inventory.json`. Truncates `.e2e-runtime-coverage.jsonl` so each
 * Tier B run computes coverage from a clean slate.
 *
 * Adding a new actor type / item type / sheet on the system side
 * automatically appears in `.e2e-inventory.json` here; if no test records
 * coverage for it, the e2e coverage percentage drops and the ratchet fails.
 */

const INVENTORY_PATH = resolve(__dirname, '..', '..', '.e2e-inventory.json');

test('dump enumerable inventory + reset coverage tracker', async ({ page }) => {
    if (existsSync(trackerPath())) unlinkSync(trackerPath());
    // Clear last run's raw v8 coverage dumps so they don't bleed into this run.
    const rawDir = resolve(__dirname, '..', '..', '.e2e-raw-coverage');
    rmSync(rawDir, { recursive: true, force: true });
    mkdirSync(rawDir, { recursive: true });

    const joined = await joinAsGM(page);
    expect(joined, 'GM join must succeed to dump the inventory').toBe(true);

    const inv = await page.evaluate(() => {
        const cfg = (
            globalThis as unknown as {
                CONFIG?: {
                    Actor?: {
                        dataModels?: Record<string, unknown>;
                        sheetClasses?: Record<string, Record<string, { id?: string }>>;
                    };
                    Item?: {
                        dataModels?: Record<string, unknown>;
                        sheetClasses?: Record<string, Record<string, { id?: string }>>;
                    };
                    statusEffects?: Array<{ id: string; name?: string }>;
                };
                game?: {
                    system?: { id?: string; version?: string };
                    release?: { version?: string; generation?: number };
                    packs?: { keys: () => IterableIterator<string> };
                };
            }
        ).CONFIG;
        const gameRef = (
            globalThis as unknown as {
                game?: { packs?: { keys: () => IterableIterator<string> } };
            }
        ).game;

        const actorTypes = Object.keys(cfg?.Actor?.dataModels ?? {});
        const itemTypes = Object.keys(cfg?.Item?.dataModels ?? {});
        const actorSheets: Record<string, string[]> = {};
        for (const [type, sheets] of Object.entries(cfg?.Actor?.sheetClasses ?? {})) {
            actorSheets[type] = Object.keys(sheets ?? {});
        }
        const itemSheets: Record<string, string[]> = {};
        for (const [type, sheets] of Object.entries(cfg?.Item?.sheetClasses ?? {})) {
            itemSheets[type] = Object.keys(sheets ?? {});
        }
        const statusEffects = (cfg?.statusEffects ?? []).map((s) => s.id);
        const compendiumPacks = gameRef?.packs ? Array.from(gameRef.packs.keys()) : [];
        return { actorTypes, itemTypes, actorSheets, itemSheets, statusEffects, compendiumPacks };
    });

    // Per-system actor types follow a `<systemPrefix>-<role>` convention.
    // Build the valid (type, system) pairs explicitly so the e2e coverage
    // denominator only counts pairs that the system actually supports —
    // 'dh2-character' counts toward 'dh2e', not the cross-product of all 7
    // game systems.
    const SYSTEM_PREFIX: Record<string, string> = {
        bc: 'bc',
        dh1e: 'dh1',
        dh2e: 'dh2',
        dw: 'dw',
        ow: 'ow',
        rt: 'rt',
        im: 'im',
    };
    const validActorTypeSystemPairs: string[] = [];
    for (const gameSystem of GAME_SYSTEM_IDS) {
        const prefix = SYSTEM_PREFIX[gameSystem];
        for (const t of inv.actorTypes) {
            if (t.startsWith(`${prefix}-`)) validActorTypeSystemPairs.push(`${t}::${gameSystem}`);
        }
    }

    const fullInventory = {
        generatedAt: new Date().toISOString(),
        gameSystems: GAME_SYSTEM_IDS,
        ...inv,
        validActorTypeSystemPairs,
    };
    writeFileSync(INVENTORY_PATH, `${JSON.stringify(fullInventory, null, 2)}\n`);

    expect(inv.actorTypes.length, 'expected at least one actor type').toBeGreaterThan(0);
    expect(inv.itemTypes.length, 'expected at least one item type').toBeGreaterThan(0);
});
