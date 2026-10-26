/**
 * Every BaseRollDialog keeps the one footer part (#698). The Frag Grenade's damage prompt
 * had no Roll or Cancel: DamageRollDialog replaced PARTS with its form alone, and its form
 * template never had buttons. AssignDamageDialog copied a V1 button row into its form and
 * wired it by id. The base dialog now owns a `footer` part, and a subclass replaces only
 * `form` by spreading the base PARTS.
 *
 * The dialog classes extend Foundry's ApplicationV2 at module load, so this reads their
 * source; the story plays below render the composed form + footer.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as assignStories from '../src/module/applications/prompts/assign-damage-dialog.stories.ts';
import * as damageStories from '../src/module/applications/prompts/damage-roll-dialog.stories.ts';
import { namedStoryPlayTests } from './lib/story-runner.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROMPTS = path.join(ROOT, 'src/module/applications/prompts');
const FOOTER_TEMPLATE = 'systems/wh40k-rpg/templates/prompt/roll-dialog-footer.hbs';

/** The source of every module under the prompts directory that subclasses BaseRollDialog. */
function rollDialogSubclasses(): Array<{ file: string; source: string }> {
    return readdirSync(PROMPTS)
        .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.stories.ts'))
        .map((file) => ({ file, source: readFileSync(path.join(PROMPTS, file), 'utf8') }))
        .filter(({ source }) => /extends BaseRollDialog\b/.test(source));
}

/** The template path a dialog's `form` part names. */
function formTemplate(source: string): string {
    const match = /form:\s*\{\s*template:\s*'systems\/wh40k-rpg\/(templates\/[^']+)'/.exec(source);
    if (match?.[1] === undefined) throw new Error('no form template');
    return match[1];
}

describe('the roll dialog footer part (#698)', () => {
    it('is a part of the base dialog, after its form', () => {
        const base = readFileSync(path.join(PROMPTS, 'base-roll-dialog.ts'), 'utf8');
        const parts = base.slice(base.indexOf('static override PARTS'));
        expect(parts.indexOf('form:')).toBeGreaterThan(-1);
        expect(parts.indexOf(`template: '${FOOTER_TEMPLATE}'`)).toBeGreaterThan(parts.indexOf('form:'));
    });

    it('is kept by every subclass that sets its own form, whose form carries no buttons of its own', () => {
        const subclasses = rollDialogSubclasses();
        expect(subclasses.map(({ file }) => file).sort()).toEqual(['assign-damage-dialog.ts', 'damage-roll-dialog.ts']);
        const read = subclasses.map(({ file, source }) => ({
            file,
            keepsFooter: /static override PARTS = \{\s*\.\.\.BaseRollDialog\.PARTS,/.test(source),
            formHasButtons: readFileSync(path.join(ROOT, 'src', formTemplate(source)), 'utf8').includes('<button'),
        }));
        expect(read).toEqual(subclasses.map(({ file }) => ({ file, keepsFooter: true, formHasButtons: false })));
    });

    it('wires its buttons to the base actions, the submit label set by the dialog', () => {
        const footer = readFileSync(path.join(ROOT, 'src/templates/prompt/roll-dialog-footer.hbs'), 'utf8');
        expect(footer).toContain('confirmAction="roll"');
        expect(footer).toContain('confirmLabelKey=footer.labelKey');
        expect(readFileSync(path.join(PROMPTS, 'assign-damage-dialog.ts'), 'utf8')).toContain("labelKey: 'WH40K.Common.Apply'");
    });
});

describe('#698 composed damage prompt stories', () => {
    namedStoryPlayTests(damageStories, ['WithFooter']);
    namedStoryPlayTests(assignStories, ['Wired']);
});
