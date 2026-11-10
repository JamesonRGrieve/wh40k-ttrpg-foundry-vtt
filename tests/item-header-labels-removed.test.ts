/**
 * Regression (#711): the item data models carry no unread header-label getter.
 *
 * `ItemDataModel` declared a `headerLabels` getter and forty item data models
 * overrode it, each behind its own lint suppression. No template, sheet, story or
 * sibling module read it; only one e2e spec did, to assert on the getter itself.
 * The getter, its overrides and those suppressions are gone, and this guard fails
 * if any of them comes back without a consumer being added alongside it.
 *
 * Source-scan test: the getter was dead precisely because nothing called it, so
 * no behavioural test can tell its presence from its absence.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const SELF = relative(ROOT, __filename);
const GETTER = 'headerLabels';
/** Every tree that could declare the getter or read it. */
const SCANNED_ROOTS = ['src/module', 'src/templates', 'stories', 'tests'];

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(path);
        return /\.(ts|hbs)$/.test(entry.name) ? [path] : [];
    });
}

const files = SCANNED_ROOTS.flatMap((root) => sourceFiles(join(ROOT, root)))
    .map((file) => relative(ROOT, file))
    .filter((file) => file !== SELF);

/** The scanned files whose text matches `pattern`. */
function filesMatching(pattern: RegExp): string[] {
    return files.filter((file) => pattern.test(readFileSync(join(ROOT, file), 'utf8')));
}

describe('item header-label getter (#711)', () => {
    it('scans the item data models, the templates and the e2e specs', () => {
        expect(files).toContain('src/module/data/abstract/item-data-model.ts');
        expect(files).toContain('src/module/data/item/weapon.ts');
        expect(files).toContain('tests/e2e/dh-special-items.spec.ts');
        expect(files.some((file) => file.startsWith('src/templates/item/'))).toBe(true);
    });

    it('is declared by no data model', () => {
        expect(filesMatching(new RegExp(`\\bget ${GETTER}\\b`))).toEqual([]);
    });

    it('is read by no template, sheet, story or spec', () => {
        expect(filesMatching(new RegExp(`\\b${GETTER}\\b`))).toEqual([]);
    });

    it('is named by no lint suppression', () => {
        expect(filesMatching(new RegExp(`eslint-disable[^\\n]*${GETTER}`))).toEqual([]);
    });
});
