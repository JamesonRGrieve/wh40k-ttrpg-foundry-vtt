/**
 * The voidcraft Components tab's SP readout reads as one figure (#701): spent,
 * slash, budget side by side on one baseline. The row was `justify-between`, so
 * the two numbers sat at opposite edges with a lone slash floating mid-panel.
 */
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const PANEL = readRepoFile('src/templates/actor/panel/ship-points-budget-panel.hbs');

describe('ship points readout (#701)', () => {
    const row = /<div class="([^"]*)" data-wh40k-hook="ship-points-readout">/u.exec(PANEL)?.[1] ?? '';

    it('clusters spent / budget at the start of the row, bottom-aligned', () => {
        expect(row).toContain('tw-justify-start');
        expect(row).toContain('tw-items-end');
        expect(row).not.toContain('tw-justify-between');
    });

    it('sets the slash at the numbers’ size, between spent and budget', () => {
        const spent = PANEL.indexOf('data-field="spent"');
        const slash = PANEL.indexOf('data-wh40k-hook="ship-points-slash"');
        const budget = PANEL.indexOf('data-field="budget"');
        expect(spent).toBeGreaterThan(-1);
        expect(slash).toBeGreaterThan(spent);
        expect(budget).toBeGreaterThan(slash);
        expect(PANEL).toMatch(/class="tw-text-2xl tw-leading-tight tw-opacity-40" data-wh40k-hook="ship-points-slash"/u);
    });
});
