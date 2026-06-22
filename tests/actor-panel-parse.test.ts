/**
 * Parse guard for the per-system actor panel templates.
 *
 * The ~26 `bc-* / dw-* / ow-* / possession / shock / subtlety` panels render
 * through the `system-card` block partial. A block partial MUST close with the
 * exact name it opened with: opening `{{#> systems/.../system-card.hbs}}` (full
 * path) but closing `{{/system-card}}` (short form) makes Handlebars throw
 * "...system-card.hbs doesn't match system-card" at parse time, so the panel
 * never renders. This compiles every panel and fails on any such mismatch — the
 * e2e panel-probe specs catch it at runtime, but they are not in pre-commit, so
 * this is the cheap guard that keeps the close tags honest.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Hbs from 'handlebars';
import { describe, expect, it } from 'vitest';

// Vitest runs from the repo root, so this cwd-relative path resolves.
const PANEL_DIR = 'src/templates/actor/panel';
const cases: ReadonlyArray<readonly [string, string]> = readdirSync(PANEL_DIR)
    .filter((file) => file.endsWith('.hbs'))
    .map((file) => [file, readFileSync(join(PANEL_DIR, file), 'utf8')]);

describe('actor panel templates — Handlebars block-partial open/close tags match', () => {
    it('covers every panel template', () => {
        expect(cases.length).toBeGreaterThan(20);
    });

    it.each(cases)('%s compiles (no block-partial close-tag mismatch)', (_name, src) => {
        expect(() => Hbs.compile(src)).not.toThrow();
    });
});
