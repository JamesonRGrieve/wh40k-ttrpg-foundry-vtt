/**
 * Every document type the system declares has a `TYPES.<Document>.<type>` label in
 * the langpack. Foundry builds window titles and the create-document menus from
 * these keys; a missing one shows the raw key ("TYPES.Item.location: …"), which
 * the freeze screenshot audit caught on the Location item sheet.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');

interface SystemManifest {
    documentTypes: Record<string, Record<string, object>>;
}

interface Langpack {
    TYPES: Record<string, Record<string, string> | undefined>;
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'src/system.json'), 'utf8')) as SystemManifest;
const langpack = JSON.parse(readFileSync(join(ROOT, 'src/lang/en.json'), 'utf8')) as Langpack;

describe('document type labels', () => {
    it('every declared Actor and Item type has a TYPES label', () => {
        const missing = Object.entries(manifest.documentTypes).flatMap(([documentName, types]) =>
            Object.keys(types)
                .filter((type) => (langpack.TYPES[documentName]?.[type] ?? '') === '')
                .map((type) => `TYPES.${documentName}.${type}`),
        );
        expect(missing).toEqual([]);
    });
});
