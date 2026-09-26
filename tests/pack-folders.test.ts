/**
 * Regression guard (#297): every declared compendium pack must be foldered exactly
 * once in `packFolders`, and `packFolders` must not reference a pack that no longer
 * exists. `packFolders` is Foundry's declarative compendium-directory folder tree;
 * when it drifts, packs fall to the root unfoldered (the "heap of misorganised
 * packs" symptom). `pnpm packs:folders` regenerates it; this test fails the build if
 * it is ever out of sync. The declarations are the public `src/system.json`'s plus
 * the private content's fragment (scripts/lib/pack-manifest.mjs).
 */

import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type PackFolder, readDeclaredPacks } from '../scripts/lib/pack-manifest.mjs';
import { HAS_PRIVATE_CONTENT } from '../src/module/testing/private-content.ts';

const system = readDeclaredPacks(resolve(__dirname, '..'));

function collectFolderedPacks(folders: PackFolder[] | undefined, out: string[] = []): string[] {
    for (const f of folders ?? []) {
        for (const p of f.packs ?? []) out.push(p);
        collectFolderedPacks(f.folders, out);
    }
    return out;
}

describe.skipIf(!HAS_PRIVATE_CONTENT)('system.json packFolders ↔ packs sync (#297)', () => {
    const declared = system.packs.map((p) => p.name);
    const declaredSet = new Set(declared);
    const folderedList = collectFolderedPacks(system.packFolders);
    const folderedSet = new Set(folderedList);

    it('folders every declared pack (none stranded at the root)', () => {
        const unfoldered = declared.filter((n) => !folderedSet.has(n));
        expect(unfoldered).toEqual([]);
    });

    it('has no stale references to removed/renamed packs', () => {
        const stale = folderedList.filter((n) => !declaredSet.has(n));
        expect(stale).toEqual([]);
    });

    it('folders each pack exactly once', () => {
        const dupes = folderedList.filter((n, i) => folderedList.indexOf(n) !== i);
        expect([...new Set(dupes)]).toEqual([]);
    });

    it('gives every supported game line a top-level folder (incl. IM)', () => {
        const tops = system.packFolders.map((f) => f.name);
        expect(tops).toContain('Imperium Maledictum');
        expect(tops).toContain('Dark Heresy 2e');
    });
});
