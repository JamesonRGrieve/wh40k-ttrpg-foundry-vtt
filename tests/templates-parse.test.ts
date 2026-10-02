/**
 * Every Handlebars template must parse.
 *
 * A template that fails to parse does not fail the build: the system ships, and
 * the first time the template is rendered the whole application throws. That is
 * how the Without home-world info dialog broke — a bulk class-name cleanup turned
 * `(eq accent "crimson")` into `(eq accent"crimson")`, and the dialog could no
 * longer open at all, with nothing failing until someone clicked it. Parsing is
 * pure syntax (no helpers or partials needed), so every template is checked here.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import handlebarsCompiler from 'handlebars';
import { describe, expect, it } from 'vitest';

const TEMPLATES_ROOT = resolve(__dirname, '../src/templates');

function listTemplates(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return listTemplates(path);
        return entry.name.endsWith('.hbs') ? [path] : [];
    });
}

/** The parse error for one template, or null when it parses. */
function parseError(path: string): string | null {
    try {
        handlebarsCompiler.parse(readFileSync(path, 'utf8'));
        return null;
    } catch (err) {
        return err instanceof Error ? err.message : String(err);
    }
}

describe('Handlebars templates', () => {
    const templates = listTemplates(TEMPLATES_ROOT);

    it('finds the template tree', () => {
        expect(templates.length).toBeGreaterThan(0);
    });

    it('all parse', () => {
        const failures = templates.flatMap((path) => {
            const error = parseError(path);
            return error === null ? [] : [`${relative(TEMPLATES_ROOT, path)}: ${error}`];
        });
        expect(failures).toEqual([]);
    });

    it('rejects a malformed helper call (guards the guard)', () => {
        expect(() => handlebarsCompiler.parse('{{#if (eq accent"crimson")}}x{{/if}}')).toThrow();
    });
});
