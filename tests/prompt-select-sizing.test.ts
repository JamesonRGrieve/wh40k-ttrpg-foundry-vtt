/**
 * Regression (#624): prompt selects clipped their chosen option. Foundry's chrome
 * gives a select a fixed height and a matching line height, and the climb-surface
 * and characteristic-override selects added `tw-py-2.5` (and `tw-text-base`) on top,
 * so "Standard (no modifier)" was cut off at the bottom of its box. Both now render
 * through the shared prompt-select partial, which carries the damage-type select's
 * fix (4a1980836): its own height, no vertical padding, a normal line height.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import HbsStory from 'handlebars';
import { describe, expect, it } from 'vitest';
import promptSelectSrc from '../src/templates/prompt/partial/prompt-select.hbs?raw';
import { readRepoFile } from './lib/repo-file.ts';

const PARTIAL = 'systems/wh40k-rpg/templates/prompt/partial/prompt-select.hbs';
const contextPanel = readRepoFile('src/templates/prompt/unified/context-panel.hbs');

/**
 * Prompt templates whose selects still carry vertical padding (listed on #624 for
 * migration to the shared prompt select). Remove a file once it is migrated; never add one.
 */
const PADDED_SELECTS_TO_MIGRATE: readonly string[] = [
    'src/templates/prompt/add-speciality-prompt.hbs',
    'src/templates/prompt/assign-damage-prompt.hbs',
    'src/templates/prompt/cybernetics-install-dialog.hbs',
    'src/templates/prompt/daemon-weapon-attribute-dialog.hbs',
    'src/templates/prompt/fear-test-dialog.hbs',
    'src/templates/prompt/hazard-dialog.hbs',
    'src/templates/prompt/partial/ship-field-groups.hbs',
    'src/templates/prompt/ship-assault-dialog.hbs',
    'src/templates/prompt/unified/panels/weapon-panel.hbs',
    'src/templates/prompt/unified/skill-use-panel.hbs',
    'src/templates/prompt/unified/target-selector.hbs',
];

function hbsFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return hbsFiles(path);
        return entry.name.endsWith('.hbs') ? [path] : [];
    });
}

describe('prompt selects show their whole value (#624)', () => {
    it('the shared select sets its own height, clears its vertical padding and uses a normal line height', () => {
        HbsStory.registerPartial('prompt-select-under-test', promptSelectSrc);
        const html = HbsStory.compile(
            '{{#> prompt-select-under-test name="climbSurface" action="a"}}<option value="x">X</option>{{/prompt-select-under-test}}',
        )({});
        const root = document.createElement('div');
        root.innerHTML = html;
        const select = root.querySelector('select');
        expect(select?.name).toBe('climbSurface');
        expect(select?.dataset['action']).toBe('a');
        expect(select?.querySelector('option')?.value).toBe('x');
        expect(['tw-h-10', 'tw-py-0', 'tw-leading-normal'].filter((cls) => select?.classList.contains(cls) !== true)).toEqual([]);
        expect(select?.className).not.toMatch(/tw-py-(?!0\b)/);
    });

    it('the climb-surface and characteristic selects render through it', () => {
        expect(contextPanel).toContain(`{{#> ${PARTIAL} name="climbSurface"`);
        expect(contextPanel).toContain(`{{#> ${PARTIAL} name="characteristicOverride"`);
        expect(contextPanel).not.toContain('<select');
    });

    it('no new prompt select is padded vertically; the known ones may only be fixed (a one-way ratchet)', () => {
        const root = resolve(__dirname, '..');
        const offenders = hbsFiles(join(root, 'src/templates/prompt'))
            .filter((file) => [...readFileSync(file, 'utf8').matchAll(/<select[^>]*class="([^"]*)"/g)].some((m) => /tw-py-(?!0\b)/.test(m[1])))
            .map((file) => relative(root, file));
        expect(offenders.filter((file) => !PADDED_SELECTS_TO_MIGRATE.includes(file))).toEqual([]);
    });
});
