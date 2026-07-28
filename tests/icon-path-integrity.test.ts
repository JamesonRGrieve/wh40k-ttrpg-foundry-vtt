/**
 * Regression guard (#239): system code must not emit image paths that point at
 * an optional module.
 *
 * The packs were swept, but `src/module` still emitted ~57 paths under
 * `modules/game-icons-net-font/` — a module the system only *recommends*, and
 * whose manifest is a dead 404. On any world without it every skill icon and
 * every item/actor type default was a broken image. A system must only
 * reference assets it ships (`systems/wh40k-rpg/…`) or that Foundry itself
 * ships (`icons/…`).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MODULE_ROOT = resolve(__dirname, '../src/module');
const TEMPLATE_ROOT = resolve(__dirname, '../src/templates');

/** Any `modules/<name>/…` asset path in a string literal. */
const MODULE_ASSET = /['"`]modules\/[a-z0-9-]+\/[^'"`]*\.(?:svg|png|jpe?g|webp|gif)['"`]/gi;

/** Recursively collect source files under a directory. */
function sourceFiles(dir: string, exts: readonly string[]): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...sourceFiles(full, exts));
        else if (exts.some((ext) => entry.endsWith(ext))) out.push(full);
    }
    return out;
}

/** Strip block and line comments so commented-out historical code is exempt. */
function withoutComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const files = [...sourceFiles(MODULE_ROOT, ['.ts']), ...sourceFiles(TEMPLATE_ROOT, ['.hbs', '.ts'])].filter((f) => !f.endsWith('.test.ts'));

describe('icon path integrity (#239)', () => {
    it('finds source files to check', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    it('no live system code references an optional module’s assets', () => {
        const offenders: string[] = [];
        for (const file of files) {
            const matches = withoutComments(readFileSync(file, 'utf8')).match(MODULE_ASSET);
            if (matches !== null) {
                for (const match of matches) offenders.push(`${relative(MODULE_ROOT, file)}: ${match}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});
