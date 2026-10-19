/**
 * #613 (the reverse direction): the Storybook harness lacked helpers the live
 * system has, so every story rendering `tab-basics.hbs` (`formInput`) or the Armour
 * Mod sheet (`not`) failed. The harness now registers production's helpers from
 * the same registry Foundry runs (`registerHandlebarsHelpers`), adds stand-ins only
 * for the helpers Foundry core registers, and overrides only the few production
 * helpers that read live Foundry state.
 *
 * - Every helper production registers is registered in the harness, as
 *   production's own function unless it is a declared story override.
 * - Every helper a template calls is registered in the harness.
 * - No template prints a bare `{{name}}` whose name is a helper: Handlebars calls
 *   the helper instead of reading the value. A `min` helper did this to the `min`
 *   argument of four partials, so their inputs rendered `min=""` in Foundry.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import HandlebarsLib from 'handlebars';
import { describe, expect, it } from 'vitest';
import { registerHandlebarsHelpers } from '../src/module/handlebars/handlebars-helpers.ts';
import { registerIconHelper } from '../src/module/icons/helper.ts';
import { FOUNDRY_CORE_HELPERS, initializeStoryHandlebars, STORY_OVERRIDES } from '../stories/template-support.ts';

const ROOT = resolve(__dirname, '..');
const TEMPLATES = join(ROOT, 'src/templates');

/** Handlebars' own block helpers, which every instance has. */
const BUILT_IN = new Set(['if', 'unless', 'each', 'with', 'lookup', 'log', 'blockHelperMissing', 'helperMissing', 'else']);

/** Production's helpers, registered on a fresh instance exactly as Foundry registers them. */
const production = HandlebarsLib.create();
registerHandlebarsHelpers(production, { localize: (key) => key, lang: () => 'en' });
registerIconHelper(production);
const productionNames = Object.keys(production.helpers).filter((name) => !BUILT_IN.has(name));

const harness = initializeStoryHandlebars();
const overrides = new Set<string>(STORY_OVERRIDES);

/** Whether `instance` has a helper called `name`. */
function hasHelper(instance: typeof HandlebarsLib, name: string): boolean {
    return Object.hasOwn(instance.helpers, name);
}

/** The first capture group of a match, or ''. */
function captured(match: RegExpMatchArray): string {
    return match.at(1) ?? '';
}

function templates(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return templates(path);
        return entry.name.endsWith('.hbs') ? [path] : [];
    });
}

const SOURCES = templates(TEMPLATES).map((file) => ({ file: relative(TEMPLATES, file), text: readFileSync(file, 'utf8') }));

/** Helpers a template calls with arguments: `{{name …}}`, `{{#name …}}` or `(name …)`. */
function calledHelpers(text: string): string[] {
    const withoutComments = text.replace(/\{\{!--[\s\S]*?--\}\}|\{\{![\s\S]*?\}\}/g, '');
    // Only inside a mustache, and outside its quoted strings: a `(name …)` anywhere else
    // is CSS (`rgb(from var(…))`) or prose, not a subexpression.
    const mustaches = Array.from(withoutComments.matchAll(/\{\{[^{}]*\}\}/g), (m) => m[0].replace(/"[^"]*"|'[^']*'/g, '""'));
    return mustaches
        .flatMap((mustache) => Array.from(mustache.matchAll(/(?:^\{\{[#~]?|\()\s*([A-Za-z][\w-]*)\s+(?=[^\s}])/g), captured))
        .filter((name) => !BUILT_IN.has(name));
}

/** Names a template binds as block parameters (`as |a b|`), which shadow helpers. */
function blockParams(text: string): Set<string> {
    return new Set(Array.from(text.matchAll(/as \|([^|]+)\|/g), (m) => captured(m).trim().split(/\s+/)).flat());
}

describe('story harness helpers match production (#613)', () => {
    it('reads production’s registry', () => {
        expect(productionNames.length).toBeGreaterThan(80);
        expect(productionNames).toContain('iconSvg');
    });

    it('registers every helper production registers', () => {
        expect(productionNames.filter((name) => !hasHelper(harness, name))).toEqual([]);
    });

    it('uses production’s own function for every helper but the declared story overrides', () => {
        const copies = productionNames.filter((name) => !overrides.has(name) && String(harness.helpers[name]) !== String(production.helpers[name]));
        expect(copies).toEqual([]);
    });

    it('overrides only helpers production has', () => {
        expect(STORY_OVERRIDES.filter((name) => !hasHelper(production, name))).toEqual([]);
    });

    it('registers every helper a template calls', () => {
        const missing = SOURCES.flatMap(({ file, text }) =>
            calledHelpers(text)
                .filter((name) => !hasHelper(harness, name))
                .map((name) => `${file}: ${name}`),
        );
        expect(missing).toEqual([]);
    });

    it('registers each Foundry core stand-in', () => {
        expect(FOUNDRY_CORE_HELPERS.filter((name) => !hasHelper(harness, name))).toEqual([]);
    });
});

describe('no template value is shadowed by a helper', () => {
    it('prints no bare {{name}} whose name is a registered helper', () => {
        const shadowed = SOURCES.flatMap(({ file, text }) => {
            const params = blockParams(text);
            return Array.from(text.matchAll(/\{\{\{?\s*([A-Za-z][\w-]*)\s*\}?\}\}/g), captured)
                .filter((name) => !params.has(name) && !BUILT_IN.has(name) && hasHelper(production, name))
                .map((name) => `${file}: {{${name}}}`);
        });
        expect(shadowed).toEqual([]);
    });
});
