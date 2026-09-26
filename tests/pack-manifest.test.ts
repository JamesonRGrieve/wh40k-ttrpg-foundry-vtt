import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergePackManifest, PRIVATE_PACK_MANIFEST, readDeclaredPacks } from '../scripts/lib/pack-manifest.mjs';

const ROOT = resolve(__dirname, '..');

const pack = (name: string, path = `packs/x/${name}`): { name: string; label: string; path: string; type: string } => ({
    name,
    label: name,
    path,
    type: 'Item',
});

describe('mergePackManifest', () => {
    it('appends the private packs and folders after the public ones', () => {
        const merged = mergePackManifest(
            { id: 'wh40k-rpg', packs: [pack('pub')], packFolders: [{ name: 'Public', packs: ['pub'] }] },
            { packs: [pack('priv')], packFolders: [{ name: 'Private', packs: ['priv'] }] },
        );
        expect(merged.packs.map((p) => p.name)).toEqual(['pub', 'priv']);
        expect(merged.packFolders.map((f) => f.name)).toEqual(['Public', 'Private']);
    });

    it('lets a public pack win over a private one of the same name', () => {
        const merged = mergePackManifest({ packs: [pack('dup', 'packs/public/dup')] }, { packs: [pack('dup', 'packs/private/dup')] });
        expect(merged.packs).toEqual([pack('dup', 'packs/public/dup')]);
    });

    it('is the public manifest unchanged without a fragment', () => {
        expect(mergePackManifest({ packs: [pack('pub')] }, null).packs).toEqual([pack('pub')]);
    });
});

describe('public manifest declares no private content (copyright split)', () => {
    // The public src/system.json must never re-declare the copyrighted book packs:
    // their declarations (titles, line names, "(gw-copyright)" labels) live only in
    // the private content repo's fragment and are merged by the campaign deploy.
    const system = JSON.parse(readFileSync(resolve(ROOT, 'src/system.json'), 'utf8')) as {
        packs?: Array<{ name: string; path: string }>;
        packFolders?: object[];
    };

    it('only declares packs built from the public src/packs root', () => {
        for (const declared of system.packs ?? []) {
            expect(existsSync(resolve(ROOT, 'src/packs', declared.path.replace(/^packs\//, '')))).toBe(true);
        }
    });

    const privateFile = resolve(ROOT, PRIVATE_PACK_MANIFEST);
    it.skipIf(!existsSync(privateFile))('declares none of the private fragment packs', () => {
        const privateNames = new Set((JSON.parse(readFileSync(privateFile, 'utf8')) as { packs: Array<{ name: string }> }).packs.map((p) => p.name));
        expect((system.packs ?? []).filter((p) => privateNames.has(p.name))).toEqual([]);
    });

    it('still sees the private declarations through readDeclaredPacks when checked out', () => {
        const declared = readDeclaredPacks(ROOT);
        expect(declared.packs.length).toBeGreaterThanOrEqual((system.packs ?? []).length);
    });
});
