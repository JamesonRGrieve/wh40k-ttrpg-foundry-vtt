/**
 * The ship weapon sheet's Weapon Statistics and Resource Requirements inputs sit
 * in equal-column grids (#701). They were flex rows whose cells sized to their
 * labels, so "Strength" and "Crit Rating" columns never lined up.
 */
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const SHEET = readRepoFile('src/templates/item/ship-weapon-sheet.hbs');

describe('ship weapon sheet stat grids (#701)', () => {
    it('lays the statistics out in two equal columns and the resources in three', () => {
        expect(SHEET).toContain('class="tw-grid tw-grid-cols-2 tw-gap-x-3 tw-gap-y-1" data-wh40k-hook="ship-weapon-stat-grid"');
        expect(SHEET).toContain('class="tw-grid tw-grid-cols-3 tw-gap-x-3 tw-gap-y-1" data-wh40k-hook="ship-weapon-resource-grid"');
    });

    it('keeps no label-sized flex rows', () => {
        expect(SHEET).not.toContain('form-row tw-flex');
    });

    it('fills every grid cell with its input', () => {
        for (const name of ['strength', 'damage', 'crit', 'range', 'power', 'space', 'shipPoints']) {
            expect(SHEET).toMatch(new RegExp(`<input class="tw-w-full"[^>]*name="system\\.${name}"`, 'u'));
        }
    });
});
