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
import { readDeclaredPacks } from '../../scripts/lib/pack-manifest.mjs';
import { type BuilderPackRole, builderPacks, lineCategoryPack, type PackMetadataLike } from '../../src/module/utils/line-packs.ts';

const PACKS_ROOT = resolve(__dirname, '../../src/packs-private');

/** Every declared pack's metadata, as Foundry would hold it. */
function declaredPackMetadata(): Array<{ metadata: PackMetadataLike }> {
    return readDeclaredPacks(resolve(__dirname, '../..')).packs.map((pack) => ({ metadata: pack }));
}

/** The names of the packs `line`'s builder reads for `role`, in the order it reads them. */
export function builderPackNames(line: string, role: BuilderPackRole): string[] {
    return builderPacks(declaredPackMetadata(), line, role).map((pack) => pack.metadata.name);
}

/** The name of `line`'s first book pack of exactly `category`, if it has one. */
export function lineCategoryPackName(line: string, category: string): string | undefined {
    return lineCategoryPack(declaredPackMetadata(), line, category)?.metadata.name;
}

/** Every declared pack's metadata, for selecting by flags. */
export function declaredPacks(): PackMetadataLike[] {
    return declaredPackMetadata().map((pack) => pack.metadata);
}

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
