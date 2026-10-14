/**
 * Regression guard (#612): no template opens a form inside an application
 * whose root already is the form.
 *
 * Item sheets, actor sheets and most dialogs are ApplicationV2s with
 * `tag: 'form'`. Foundry parses each part's HTML in a detached container, so a
 * form element in the template survives and is appended INSIDE the root form.
 * It then becomes its controls' form owner, and the root form's submit (and
 * submit-on-change) builds its FormData from `form.elements` without them:
 * every edit is silently dropped. On Tier B an owned Navigator power's mastery
 * select and the special-ability editor changed nothing until this was fixed.
 *
 * A template may open a form only when the application that renders it has a
 * non-form root, so that template's form IS the form. Those are listed in
 * {@link OWN_FORM_TEMPLATES} with the source that renders them, and the guard
 * checks that source really declares a non-form root.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const TEMPLATES = join(ROOT, 'src/templates');

/** A form start tag (not the word "form" in prose or a `tag: 'form'` mention). */
const FORM_TAG = /<form[\s>]/;

/** Templates that legitimately open a form, mapped to the application source whose root is not a form. */
const OWN_FORM_TEMPLATES: Readonly<Record<string, string>> = {
    'dialogs/template-selector.hbs': 'src/module/applications/npc/template-selector.ts',
    'dialogs/difficulty-calculator.hbs': 'src/module/applications/npc/difficulty-calculator-dialog.ts',
    'dialogs/combat-preset.hbs': 'src/module/applications/npc/combat-preset-dialog.ts',
    'dialogs/characteristic-setup.hbs': 'src/module/applications/dialogs/characteristic-setup-dialog.ts',
    'prompt/daemon-weapon-attribute-dialog.hbs': 'src/module/applications/prompts/daemon-weapon-attribute-dialog.ts',
    'applications/compendium-browser.hbs': 'src/module/applications/compendium-browser.ts',
};

/** A root declared as a div, or a DialogV2 (whose root is a `dialog`). */
const NON_FORM_ROOT = /tag:\s*'div'|extends DialogV2\b/;

function hbsFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return hbsFiles(path);
        return entry.name.endsWith('.hbs') ? [path] : [];
    });
}

function templatesOpeningAForm(): string[] {
    return hbsFiles(TEMPLATES)
        .filter((file) => FORM_TAG.test(readFileSync(file, 'utf8')))
        .map((file) => relative(TEMPLATES, file));
}

describe('templates do not nest a form inside a form-root application (#612)', () => {
    it('finds templates to scan', () => {
        expect(hbsFiles(TEMPLATES).length).toBeGreaterThan(300);
    });

    it('opens a form only where the rendering application has a non-form root', () => {
        expect(templatesOpeningAForm().filter((name) => !(name in OWN_FORM_TEMPLATES))).toEqual([]);
    });

    it('lists only templates that still open a form, each rendered by a non-form-root application', () => {
        const opening = new Set(templatesOpeningAForm());
        const wrong = Object.entries(OWN_FORM_TEMPLATES).filter(
            ([template, source]) => !opening.has(template) || !NON_FORM_ROOT.test(readFileSync(join(ROOT, source), 'utf8')),
        );
        expect(wrong).toEqual([]);
    });

    it('keeps every item-sheet template form-free (every item sheet is a form-root ApplicationV2)', () => {
        expect(templatesOpeningAForm().filter((name) => name.startsWith('item/'))).toEqual([]);
    });
});
