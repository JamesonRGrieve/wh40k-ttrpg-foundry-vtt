/**
 * Guard (#664): a unit test that loads a DataModel module outside Foundry installs
 * the shared stub (`src/module/testing/foundry-data-stub.ts`) instead of hand-rolling
 * its own `foundry.abstract` DataModel. Ten suites once carried their own copies,
 * which drifted from the shared one and from each other. A suite that needs a
 * capability the shared stub lacks extends the shared stub.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const SHARED = 'src/module/testing/foundry-data-stub.ts';

function testFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : testFiles(path);
        return /\.(test|stories)\.ts$/.test(entry.name) ? [path] : [];
    });
}

/** A hand-built `foundry.abstract` DataModel: `DataModel:` / `TypeDataModel:` given a class or value. */
const OWN_DATA_MODEL = /\b(?:Type)?DataModel\s*:\s*[A-Za-z(]/;

describe('one Foundry DataModel stub for every unit test (#664)', () => {
    const files = [...testFiles(join(ROOT, 'src')), ...testFiles(join(ROOT, 'tests')), ...testFiles(join(ROOT, 'stories'))];

    it('scans the test suites', () => {
        expect(files.length).toBeGreaterThan(300);
    });

    it('no test file defines its own foundry.abstract DataModel', () => {
        const offenders = files
            .filter((file) => relative(ROOT, file) !== 'tests/foundry-data-stub-shared.test.ts')
            .filter((file) => OWN_DATA_MODEL.test(readFileSync(file, 'utf8')))
            .map((file) => relative(ROOT, file));
        expect(offenders).toEqual([]);
    });

    it('the shared stub provides both bases', () => {
        const shared = readFileSync(join(ROOT, SHARED), 'utf8');
        expect(shared).toMatch(/abstract: \{ DataModel: StubDataModel, TypeDataModel: StubTypeDataModel \}/);
    });
});
