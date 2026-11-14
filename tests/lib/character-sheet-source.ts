/**
 * The character sheet's source, for source-text tests (#716).
 *
 * `character-sheet.ts` keeps the class, its options and its wiring; its action
 * handlers and context builders live in `applications/actor/character/*.ts` as
 * `this`-typed functions. A test asking "does the sheet do X" reads all of them.
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readRepoFile } from './repo-file.ts';

const PARTS_DIR = 'src/module/applications/actor/character';

/** The sheet file and every module split out of it, repo-relative. */
const CHARACTER_SHEET_FILES: readonly string[] = [
    'src/module/applications/actor/character-sheet.ts',
    ...readdirSync(resolve(__dirname, '../..', PARTS_DIR))
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
        .sort()
        .map((f) => `${PARTS_DIR}/${f}`),
];

/** The character sheet's whole source: the class and its split-out modules. */
export function characterSheetSource(): string {
    return CHARACTER_SHEET_FILES.map((f) => readRepoFile(f)).join('\n');
}

/** The body of a top-level function in a split-out module, up to its closing brace. */
export function moduleFunctionBody(source: string, name: string): string {
    const start = source.search(new RegExp(`\\n(?:export )?(?:async )?function ${name}\\(`));
    if (start < 0) throw new Error(`function ${name} must exist`);
    const end = source.indexOf('\n}\n', start);
    return source.slice(start, end);
}
