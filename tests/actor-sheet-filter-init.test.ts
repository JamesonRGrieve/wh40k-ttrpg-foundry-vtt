/**
 * Regression guard: filter state properties on actor sheets must be
 * runtime-initialized, not `declare`-only.
 *
 * History: `_traitsFilter` and `_powersFilter` were originally declared
 * for typing purposes only (`declare _traitsFilter: Record<string, unknown>;`)
 * and were never assigned a default at class-field level. They were assigned
 * only inside filter-button click handlers, so on first render — before any
 * filter had been touched — `this._traitsFilter` was `undefined` and the
 * sheet crashed with `Cannot read properties of undefined (reading 'search')`
 * inside `_prepareTraitsContext`. Same shape for `_powersFilter` inside the
 * powers-tab prep.
 *
 * This test enforces: every `_<name>Filter` field that's read in a
 * `_prepare*Context` method of `BaseActorSheet` or `CharacterSheet` must
 * have a real class-field initializer somewhere in the hierarchy. A bare
 * `declare` is not enough.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const BASE_PATH = resolve(__dirname, '../src/module/applications/actor/base-actor-sheet.ts');
const CHAR_PATH = resolve(__dirname, '../src/module/applications/actor/character-sheet.ts');

const baseSrc = readFileSync(BASE_PATH, 'utf8');
const charSrc = readFileSync(CHAR_PATH, 'utf8');
const combinedSrc = `${baseSrc}\n${charSrc}`;

/** Collect every `this._xxxFilter` access in a prepare-context method body. */
function collectFilterReadsInPrepareMethods(src: string): Set<string> {
    const found = new Set<string>();
    // Match `_prepare<Name>Context(...) { ... }` blocks (greedy across the file is fine —
    // we just need every `this._xxxFilter` read regardless of which prepare block it's in).
    const prepareBlocks = src.matchAll(/_prepare\w*Context\s*\([^)]*\)[^{]*\{([\s\S]*?)\n {4}\}/g);
    for (const block of prepareBlocks) {
        const body = block[1] ?? '';
        for (const m of body.matchAll(/this\.(_\w+Filter)\b/g)) {
            const name = m[1];
            if (name !== undefined) found.add(name);
        }
    }
    return found;
}

/** True if `src` contains a real class-field initializer for `propName` (not just `declare`). */
function hasFieldInitializer(src: string, propName: string): boolean {
    // Real init: `propName = ...` or `propName: Type = ...` at field position (4-space indent in this codebase).
    // The optional type annotation may contain braces/semicolons (inline object types), so allow any char until `=`.
    const initRe = new RegExp(`^ {4}(?:(?:public|protected|private|readonly|override)\\s+)*${propName}(?:\\s*:[^=\\n]+)?\\s*=`, 'm');
    return initRe.test(src);
}

describe('actor sheet filter state initialization', () => {
    const reads = collectFilterReadsInPrepareMethods(combinedSrc);

    it('finds the known filter reads in prepare methods', () => {
        // Sanity: if this set is empty, the regex broke and the rest of the test is vacuous.
        expect(reads.size).toBeGreaterThan(0);
        expect(reads).toContain('_traitsFilter');
        expect(reads).toContain('_powersFilter');
    });

    it.each(Array.from(reads))('%s has a real class-field initializer (not just declare)', (propName) => {
        const hasInit = hasFieldInitializer(combinedSrc, propName);
        expect(
            hasInit,
            `${propName} is read in a _prepare*Context method but has no class-field initializer. Add one to BaseActorSheet or CharacterSheet — a bare \`declare\` is not enough; the field will be \`undefined\` on first render and the sheet will crash.`,
        ).toBe(true);
    });

    it('_traitsFilter initializer has the documented shape', () => {
        // The shape `{ search, category, hasLevel }` is consumed by _prepareTraitsContext;
        // a divergent initializer would silently drop fields and re-introduce the crash.
        expect(baseSrc).toMatch(/_traitsFilter[^=]*=\s*\{\s*search:\s*''\s*,\s*category:\s*''\s*,\s*hasLevel:\s*false\s*\}/);
    });

    it('_powersFilter initializer has the documented shape', () => {
        expect(charSrc).toMatch(/_powersFilter[^=]*=\s*\{\s*discipline:\s*''\s*,\s*orderCategory:\s*''\s*\}/);
    });
});

describe('declare-only filters are not silently re-introduced', () => {
    /**
     * The bug shape was: `declare _traitsFilter: Record<string, unknown>;` on the
     * class with no class-field initializer anywhere. This test re-flags exactly
     * that pattern for any property whose name ends in `Filter` so a future
     * cleanup that converts an initialized field back to `declare`-only fails
     * loudly here.
     */
    const declareOnlyFilters: string[] = [];
    for (const src of [baseSrc, charSrc]) {
        for (const m of src.matchAll(/^\s*declare\s+(_\w+Filter)\b/gm)) {
            const name = m[1];
            if (name !== undefined && !hasFieldInitializer(combinedSrc, name)) {
                declareOnlyFilters.push(name);
            }
        }
    }

    it('no filter property is `declare`-only without a runtime initializer', () => {
        expect(
            declareOnlyFilters,
            `These filter properties are declared but never initialized — they will be \`undefined\` on first render and crash the sheet: ${declareOnlyFilters.join(
                ', ',
            )}`,
        ).toEqual([]);
    });
});
