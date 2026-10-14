/**
 * Regression guard: a template calls only helpers that production registers.
 *
 * The Storybook harness (`stories/template-support.ts`) registers its own copy
 * of most helpers. One it registered, `hash`, exists nowhere in production, so
 * `(hash action="rollPower" …)` rendered fine in every story and resolved to
 * nothing in Foundry: the Navigator powers, rituals and ship-orders rows lost
 * every action button and stat, and the talent / trait / skill chat cards their
 * rows (#194). A story cannot catch that, so this test does: every helper the
 * harness registers that production does not must be unused by the templates.
 *
 * {@link KNOWN_STORY_ONLY} lists the remaining debt (shrink only).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const TEMPLATES = join(ROOT, 'src/templates');

/** Helpers Foundry core registers (client `registerHandlebarsHelpers`) plus Handlebars' built-ins. */
const CORE_HELPERS = new Set([
    'checked',
    'disabled',
    'concat',
    'editor',
    'formInput',
    'formGroup',
    'formField',
    'filePicker',
    'ifThen',
    'localize',
    'numberFormat',
    'numberInput',
    'object',
    'radioBoxes',
    'rangePicker',
    'selectOptions',
    'timeSince',
    'eq',
    'ne',
    'lt',
    'gt',
    'lte',
    'gte',
    'not',
    'and',
    'or',
    'if',
    'unless',
    'each',
    'with',
    'lookup',
    'log',
]);

/** Story-only helpers templates still call. Empty: this is a hard gate. */
const KNOWN_STORY_ONLY: Readonly<Record<string, readonly string[]>> = {};

const REGISTER = /registerHelper\(\s*'([A-Za-z0-9_-]+)'/g;

function filesUnder(dir: string, ext: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return filesUnder(path, ext);
        return entry.name.endsWith(ext) ? [path] : [];
    });
}

function registeredIn(files: readonly string[]): Set<string> {
    return new Set(files.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(REGISTER)].map((m) => String(m[1]))));
}

/** Names a production sheet supplies as a function on its render context, which Handlebars calls like a helper. */
const CONTEXT_FUNCTIONS = new Set([
    // AmmoSheet._prepareContext: `context['setToArray']`.
    'setToArray',
]);

const production = registeredIn(filesUnder(join(ROOT, 'src/module'), '.ts').filter((file) => !/\.(test|stories)\.ts$/.test(file)));
const storyOnly = [...registeredIn([join(ROOT, 'stories/template-support.ts')])].filter(
    (name) => !production.has(name) && !CORE_HELPERS.has(name) && !CONTEXT_FUNCTIONS.has(name),
);

/** Templates that call `name` as a helper: `{{name …}}`, `{{#name …}}` or a `(name …)` subexpression. */
function templatesCalling(name: string): string[] {
    const call = new RegExp(`\\{\\{[#~]?\\s*${name}[\\s}]|\\(${name}\\s`);
    return filesUnder(TEMPLATES, '.hbs')
        .filter((file) => call.test(readFileSync(file, 'utf8')))
        .map((file) => relative(TEMPLATES, file))
        .sort();
}

describe('templates call only production-registered Handlebars helpers', () => {
    it('reads the production and story helper registries', () => {
        expect(production.size).toBeGreaterThan(50);
        expect(production.has('array')).toBe(true);
    });

    it('calls no story-only helper outside the known debt', () => {
        const calls: Record<string, string[]> = {};
        for (const name of storyOnly) {
            const files = templatesCalling(name);
            if (files.length > 0) calls[name] = files;
        }
        expect(calls).toEqual(KNOWN_STORY_ONLY);
    });

    it('never uses `hash` (no production helper exists; `object` is the core equivalent)', () => {
        expect(templatesCalling('hash')).toEqual([]);
    });
});
