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

function templateFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return templateFiles(path);
        return entry.name.endsWith('.hbs') ? [path] : [];
    });
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
});
