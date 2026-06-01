/**
 * Test helper: read origin-path compendium content straight from `_source` JSON.
 *
 * The origin-path builder groups options by matching each compendium item's
 * `system.step` to a config `coreStep.step` (OriginChartLayout.computeFullChart),
 * so the wiring tests need to read the raw `step` values per pack to assert a
 * configured step actually resolves to content.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PACKS_ROOT = resolve(__dirname, '../../src/packs');

/** Locate a pack's `_source` directory under any game-line group dir. */
function packSourceDir(packName: string): string | null {
    for (const group of readdirSync(PACKS_ROOT, { withFileTypes: true })) {
        if (!group.isDirectory()) continue;
        const candidate = resolve(PACKS_ROOT, group.name, packName, '_source');
        try {
            readdirSync(candidate);
            return candidate;
        } catch {
            // not this group dir
        }
    }
    return null;
}

/** Read every item's `system.step` from a pack's `_source` JSON. */
export function stepsInPack(packName: string): string[] {
    const dir = packSourceDir(packName);
    if (dir === null) return [];
    const steps: string[] = [];
    for (const file of readdirSync(dir)) {
        if (!file.endsWith('.json')) continue;
        // eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse returns unknown (ts-reset); cast to the minimal item shape, step narrowed below
        const doc = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as { system?: { step?: unknown } };
        const step = doc.system?.step;
        if (typeof step === 'string') steps.push(step);
    }
    return steps;
}
