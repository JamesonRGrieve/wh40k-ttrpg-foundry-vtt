import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A skill's name is a <button> (it opens the skill's info), and Foundry's core
 * stylesheet gives every `button` `justify-content: center`. The name button set
 * `display: inline-flex` and `text-align: left` but not its justification, so on the
 * live sheet each name floated to the middle of its line, away from its icon, while
 * the rank pips and value sat right-aligned below it: the rows read as jumbled.
 *
 * The unit environment does not load Foundry's stylesheet, so the guard is on the
 * template: the name button must justify its content to the start itself.
 */
describe('skill row name alignment', () => {
    const template = readFileSync(resolve(__dirname, '../src/templates/actor/partial/skill-row.hbs'), 'utf8');

    it('starts the skill name at the left of its cell, overriding Foundry’s centred buttons', () => {
        const nameButton = /<button[^>]*?class="([^"]*)"[^>]*?data-action="viewSkillInfo"/s.exec(template);
        expect(nameButton, 'the skill name button exists').not.toBeNull();
        const classes = (nameButton?.[1] ?? '').split(/\s+/);
        expect(classes).toContain('tw-inline-flex');
        expect(classes).toContain('tw-justify-start');
    });
});
