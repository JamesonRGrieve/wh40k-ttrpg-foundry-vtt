/**
 * The Origin Path Builder's source, for source-text tests (#717).
 *
 * `origin-path-builder.ts` keeps the class, its state and rendering; its action
 * handlers, commit pipeline and module-level helpers live in
 * `character-creation/origin-path/*.ts`. A test asking "does the builder do X"
 * reads all of them.
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readRepoFile } from './repo-file.ts';

const PARTS_DIR = 'src/module/applications/character-creation/origin-path';

/** The builder's whole source: the class and its split-out modules. */
export function originPathBuilderSource(): string {
    const parts = readdirSync(resolve(__dirname, '../..', PARTS_DIR))
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
        .sort()
        .map((f) => `${PARTS_DIR}/${f}`);
    return ['src/module/applications/character-creation/origin-path-builder.ts', ...parts].map((f) => readRepoFile(f)).join('\n');
}
