import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bareImports, findBareRuntimeImports } from '../scripts/check-runtime-imports.cjs';

describe('bareImports', () => {
    it('flags an npm-package import (the shipped zod regression)', () => {
        expect(bareImports("import { z } from 'zod';\nimport { SYSTEM_ID } from '../constants.js';")).toEqual(['zod']);
    });

    it('allows relative, absolute and URL specifiers', () => {
        const source = ["import a from './a.js';", "import b from '../b.js';", "import c from '/systems/x.js';", "import d from 'https://cdn/x.js';"].join(
            '\n',
        );
        expect(bareImports(source)).toEqual([]);
    });

    it('flags re-exports, side-effect imports and dynamic imports', () => {
        const source = ["export { x } from 'lodash';", "import 'polyfill';", "const m = await import('chalk');"].join('\n');
        expect(bareImports(source).sort()).toEqual(['chalk', 'lodash', 'polyfill']);
    });
});

describe('findBareRuntimeImports', () => {
    let root = '';
    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('checks shipped runtime modules and exempts test-only code', () => {
        root = mkdtempSync(join(tmpdir(), 'runtime-imports-'));
        mkdirSync(join(root, 'rules'));
        mkdirSync(join(root, 'testing'));
        writeFileSync(join(root, 'rules', 'lighting.js'), "import { z } from 'zod';\n");
        writeFileSync(join(root, 'rules', 'lighting.test.js'), "import { it } from 'vitest';\n");
        writeFileSync(join(root, 'testing', 'stub.js'), "import { vi } from 'vitest';\n");
        writeFileSync(join(root, 'ok.js'), "import './rules/lighting.js';\n");
        expect(findBareRuntimeImports(root)).toEqual([{ file: join('rules', 'lighting.js'), specifier: 'zod' }]);
    });

    it('flags a relative import whose target is missing from the build', () => {
        root = mkdtempSync(join(tmpdir(), 'runtime-imports-'));
        writeFileSync(join(root, 'entry.js'), "import { a } from './present.js';\nimport { b } from './gone.js';\n");
        writeFileSync(join(root, 'present.js'), 'export const a = 1;\n');
        expect(findBareRuntimeImports(root)).toEqual([{ file: 'entry.js', specifier: './gone.js (missing from the build)' }]);
    });
});
