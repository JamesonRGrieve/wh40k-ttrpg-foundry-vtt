/**
 * Regression guard: a per-system variant is never glued onto the class before it.
 *
 * History: a scripted contrast sweep rewrote `tw-text-crimson bc:tw-text-crimson-light`
 * to `tw-text-crimson-l40bc:tw-text-crimson-light`, dropping the space. The browser
 * then sees ONE unknown class, so the element lost both its base colour and its
 * per-system variant (7 occurrences across 5 panels; the Terminal insanity degree
 * rendered uncoloured). Nothing else catches it: the theme ratchet only noticed
 * because one file's whole chain collapsed.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const TEMPLATES = resolve(__dirname, '..', 'src/templates');
/** A system variant prefix directly preceded by a class character, i.e. no separating whitespace. */
const GLUED_VARIANT = /[\w\])-](?:bc|dh1|dh2|dw|ow|rt|im):tw-/g;

const ROOT = resolve(__dirname, '..');
/**
 * A `tw-` class token whose name runs into a `:` before any arbitrary-value
 * bracket: either a variant written with the utility prefix (`tw-group-hover:`)
 * or a variant glued onto the class before it (`…-l30ow:`, `…-l40hover:`).
 * Arbitrary values (`tw-bg-[color:var(--x)]`) are not matched: their colon
 * follows a `[`.
 */
const PREFIXED_VARIANT = /(?<![\w-])tw-[a-z][a-z0-9-]*:/g;

function filesUnder(dir: string, extensions: readonly string[]): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return filesUnder(path, extensions);
        return extensions.some((ext) => entry.name.endsWith(ext)) ? [path] : [];
    });
}

function templateFiles(dir: string): string[] {
    return filesUnder(dir, ['.hbs']);
}

/** Every source that authors Tailwind classes: templates, module TS (incl. co-located stories) and stories/. */
function variantSources(): string[] {
    return [...filesUnder(TEMPLATES, ['.hbs', '.ts']), ...filesUnder(join(ROOT, 'src/module'), ['.ts']), ...filesUnder(join(ROOT, 'stories'), ['.ts'])];
}

describe('per-system variant class separation', () => {
    it('finds templates to scan', () => {
        expect(templateFiles(TEMPLATES).length).toBeGreaterThan(100);
    });

    it('never glues a <system>:tw-* variant onto the preceding class', () => {
        const glued = templateFiles(TEMPLATES).flatMap((file) =>
            [...readFileSync(file, 'utf8').matchAll(GLUED_VARIANT)].map((match) => `${file.slice(TEMPLATES.length + 1)}: …${match[0]}`),
        );
        expect(glued).toEqual([]);
    });

    it('finds module, story and template sources to scan', () => {
        expect(variantSources().length).toBeGreaterThan(500);
    });

    /*
     * The config's `prefix: 'tw-'` prefixes the UTILITY, never the variant:
     * `group-hover:tw-opacity-100`, not `tw-group-hover:tw-opacity-100`. A
     * prefixed variant is one unknown class, so the rule silently never applies
     * (#194: the Combat tab's power-invoke buttons never became visible on hover).
     * The same pattern also catches a variant glued onto the class before it
     * (`tw-text-crimson-l40hover:tw-bg-crimson`) whatever the variant: any
     * `tw-<name>:` token outside an arbitrary value is broken.
     */
    it('never prefixes a variant with tw- or glues any variant onto the preceding class', () => {
        const broken = variantSources().flatMap((file) =>
            [...readFileSync(file, 'utf8').matchAll(PREFIXED_VARIANT)].map((match) => `${file.slice(ROOT.length + 1)}: …${match[0]}`),
        );
        expect(broken).toEqual([]);
    });
});
